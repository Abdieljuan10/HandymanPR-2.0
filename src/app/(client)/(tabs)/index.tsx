import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
// The root-export Swipeable is deprecated in favor of this Reanimated-backed
// one (react-native-reanimated is already a dependency here).
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { JobPhoto } from '@/components/job-photo';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { ServiceIcon } from '@/components/service-icon';
import { StatusBadge, type StatusTone } from '@/components/status-badge';
import { SwipeAction, SWIPE_OVERSHOOT_FRICTION, SWIPE_SPRING } from '@/components/swipe-action';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobStatus = 'open' | 'hired' | 'pending_completion' | 'completed' | 'cancelled' | 'expired';

type ClientJobRow = {
  id: string;
  title: string;
  status: JobStatus;
  created_at: string;
  expires_at: string;
  pueblos: { name: string } | null;
  // Display-only addition, 2026-09-26 (client-home redesign) -- trade_id
  // was never selected here before. Read-only; nothing about how a job is
  // created, filtered, grouped, or transitioned reads this.
  trade_id: number | null;
  trades: { slug: string; name_es: string; name_en: string } | null;
  // Display-only addition, 2026-09-26 (card thumbnail) -- same "one embed,
  // read-only" reasoning as trade_id above. jobs.hired_bid_id -> bids.id is
  // already how job/[id]/index.tsx resolves who was hired; bids.handyman_id
  // -> handyman_profiles is already embedded unhinted there too (BID_SELECT),
  // so this is a proven, unambiguous path, not a new relationship.
  hired_bid: { handyman_profiles: { avatar_url: string | null } | null } | null;
  job_photos: { photo_url: string; sort_order: number }[];
};

type SectionKey = 'pendingCompletion' | 'hired' | 'open' | 'completed' | 'expired' | 'cancelled' | 'archived';
type Section = { key: SectionKey; titleKey: string; data: ClientJobRow[] };
// The Filter chips' own status list -- deliberately excludes 'archived',
// which stays governed entirely by the existing, separate archive toggle
// below (not this new filter) so the two controls never fight over the same
// concept.
type FilterableStatus = Exclude<SectionKey, 'archived'>;

// Same status set as before, now mapped to StatusBadge tones instead of a
// hand-rolled color map -- this is what actually fixes the dark-mode bug
// (the old map read Colors.light.tint and raw hex literals directly,
// ignoring dark mode entirely; StatusBadge resolves every tone through
// useTheme()). 'open' had no color of its own before (it fell back to
// theme.textSecondary); giving it the info/teal tone is the one new visual
// treatment here, not a status/business-logic change.
const STATUS_TONE: Record<JobStatus, StatusTone> = {
  open: 'info',
  hired: 'success',
  pending_completion: 'warning',
  completed: 'success',
  cancelled: 'error',
  expired: 'neutral',
};

// Labels only, for the Filter chip row -- kept separate from (not replacing)
// the sections useMemo below, which stays exactly as it worked before this
// pass. A tiny duplication of 6 key/titleKey pairs is a much smaller risk
// than restructuring the proven section-grouping logic to share this list.
const FILTER_DEFS: { key: FilterableStatus; titleKey: string }[] = [
  { key: 'pendingCompletion', titleKey: 'clientHome.sections.pendingCompletion' },
  { key: 'hired', titleKey: 'clientHome.sections.hired' },
  { key: 'open', titleKey: 'clientHome.sections.open' },
  { key: 'completed', titleKey: 'clientHome.sections.completed' },
  { key: 'expired', titleKey: 'clientHome.sections.expired' },
  { key: 'cancelled', titleKey: 'clientHome.sections.cancelled' },
];

// Card thumbnail slot -- same size whether it ends up showing the hired
// handyman's avatar, the job's own first photo, or (via ServiceIcon at this
// same size) the trade icon, so cards don't jump in height depending on
// which case applies.
const THUMBNAIL_SIZE = 52;

// Sections longer than this are capped with a "View all" footer instead of
// rendering every row -- purely a display slice (see displaySections
// below), never touches which jobs belong to which section.
const SECTION_DISPLAY_CAP = 3;

// Thumbnail priority (see renderItem): hired handyman's avatar, else the
// job's own first photo, else the trade icon. Both new embeds below ride
// along in this SAME single query -- one round trip for the whole list,
// not one per card. hired_bid_id is null for jobs never hired, so
// hired_bid comes back null for those rows (harmless).
const JOBS_SELECT =
  'id, title, status, created_at, expires_at, pueblos(name), trade_id, trades(slug, name_es, name_en), ' +
  'hired_bid:bids!hired_bid_id(handyman_profiles(avatar_url)), job_photos(photo_url, sort_order)';

export default function ClientHomeScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const [jobs, setJobs] = useState<ClientJobRow[] | null>(null);
  // null = the count query failed -- the "N bids" line is left off rather
  // than showing a false "0 bids".
  const [bidCounts, setBidCounts] = useState<Record<string, number> | null>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  // Archiving only ever applies to completed jobs here (see
  // 20260930010000_job_archives.sql) -- cancelled/expired jobs already have
  // a real delete option, and the client's own call was that completed jobs
  // stay permanently undeletable (their reviews belong to whoever received
  // them), so archive is the "get it out of my list" option for those.
  const [archivedJobIds, setArchivedJobIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // New, purely local/presentational state for this pass -- none of it
  // touches Supabase, the section-grouping logic, or the archive mechanism.
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatusKeys, setFilterStatusKeys] = useState<FilterableStatus[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(new Set());

  const load = useCallback(async () => {
    if (!session) return;

    const [{ data, error }, { data: archivesData, error: archivesError }] = await Promise.all([
      supabase.from('jobs').select(JOBS_SELECT).eq('client_id', session.user.id).order('created_at', {
        ascending: false,
      }),
      supabase.from('job_archives').select('job_id').eq('user_id', session.user.id),
    ]);

    // A failed load must not read as "you haven't posted a job yet".
    if (error) {
      console.error('Failed to load jobs:', error.message);
      setLoadError(error.message);
      setJobs([]);
      return;
    }
    setLoadError(null);
    if (archivesError) console.error('Failed to load archived jobs:', archivesError.message);

    const jobsData = (data as unknown as ClientJobRow[] | null) ?? [];
    setJobs(jobsData);
    setArchivedJobIds(new Set((archivesData ?? []).map((row) => row.job_id as string)));

    const openJobIds = jobsData.filter((job) => job.status === 'open').map((job) => job.id);
    if (openJobIds.length === 0) {
      setBidCounts({});
      return;
    }

    const { data: bidsData, error: bidsError } = await supabase
      .from('bids')
      .select('job_id')
      .in('job_id', openJobIds)
      .neq('status', 'withdrawn');

    // Unknown, not zero: a failed count leaves the line off rather than
    // telling the client nobody has bid.
    if (bidsError) {
      console.error('Failed to load bid counts:', bidsError.message);
      setBidCounts(null);
      return;
    }

    const counts: Record<string, number> = {};
    for (const row of bidsData ?? []) {
      counts[row.job_id] = (counts[row.job_id] ?? 0) + 1;
    }
    setBidCounts(counts);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      load().then(() => {
        if (!isMounted) return;
      });
      return () => {
        isMounted = false;
      };
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleArchive(jobId: string) {
    if (!session) return;
    setArchivedJobIds((prev) => new Set(prev).add(jobId));
    const { error } = await supabase.from('job_archives').insert({ job_id: jobId, user_id: session.user.id });
    if (error) {
      console.error('Failed to archive job:', error.message);
      setArchivedJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  async function handleUnarchive(jobId: string) {
    if (!session) return;
    setArchivedJobIds((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
    const { error } = await supabase
      .from('job_archives')
      .delete()
      .eq('job_id', jobId)
      .eq('user_id', session.user.id);
    if (error) {
      console.error('Failed to unarchive job:', error.message);
      setArchivedJobIds((prev) => new Set(prev).add(jobId));
    }
  }

  function toggleFilterStatus(key: FilterableStatus) {
    setFilterStatusKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // Unchanged from before this pass -- exact same grouping, exact same
  // filters, exact same order (pendingCompletion/hired/open already come
  // before completed/expired/cancelled, so "lower-priority statuses farther
  // down" was already true; nothing to reorder).
  const { sections, archivedCount } = useMemo<{ sections: Section[]; archivedCount: number }>(() => {
    if (!jobs) return { sections: [], archivedCount: 0 };
    const hired = jobs.filter((job) => job.status === 'hired');
    const pendingCompletion = jobs.filter((job) => job.status === 'pending_completion');
    const open = jobs.filter((job) => job.status === 'open');
    const completed = jobs.filter((job) => job.status === 'completed' && !archivedJobIds.has(job.id));
    const archived = jobs.filter((job) => job.status === 'completed' && archivedJobIds.has(job.id));
    const cancelled = jobs.filter((job) => job.status === 'cancelled');
    const expired = jobs.filter((job) => job.status === 'expired');

    const allSections: Section[] = [
      { key: 'pendingCompletion', titleKey: 'clientHome.sections.pendingCompletion', data: pendingCompletion },
      { key: 'hired', titleKey: 'clientHome.sections.hired', data: hired },
      { key: 'open', titleKey: 'clientHome.sections.open', data: open },
      { key: 'completed', titleKey: 'clientHome.sections.completed', data: completed },
      { key: 'expired', titleKey: 'clientHome.sections.expired', data: expired },
      { key: 'cancelled', titleKey: 'clientHome.sections.cancelled', data: cancelled },
    ];
    const list = allSections.filter((section) => section.data.length > 0);

    if (showArchived && archived.length > 0) {
      list.push({ key: 'archived', titleKey: 'clientHome.sections.archived', data: archived });
    }

    return { sections: list, archivedCount: archived.length };
  }, [jobs, archivedJobIds, showArchived]);

  // New: an optional, purely presentational narrowing of the SAME sections
  // above -- never recomputes which jobs belong where. 'archived' always
  // passes through regardless of the filter, since it's owned by the
  // existing toggle, not by this control.
  const visibleSections = useMemo(
    () =>
      filterStatusKeys.length === 0
        ? sections
        : sections.filter((section) => section.key === 'archived' || filterStatusKeys.includes(section.key)),
    [sections, filterStatusKeys]
  );

  // New: caps each visible section to SECTION_DISPLAY_CAP rows unless the
  // client tapped "View all" for it -- a display slice only, same data.
  const displaySections = useMemo(
    () =>
      visibleSections.map((section) => ({
        ...section,
        data: expandedSections.has(section.key) ? section.data : section.data.slice(0, SECTION_DISPLAY_CAP),
      })),
    [visibleSections, expandedSections]
  );

  const archiveToggle = archivedCount > 0 && (
    <Pressable onPress={() => setShowArchived((prev) => !prev)} style={styles.archiveToggle}>
      <ThemedText type="small" themeColor="textSecondary">
        {showArchived ? t('clientHome.hideArchived') : t('clientHome.showArchived', { count: archivedCount })}
      </ThemedText>
    </Pressable>
  );

  // Time-aware greeting. The name comes from session.user_metadata (set at
  // sign-up, already loaded with the session -- no new query), NOT
  // client_profiles.full_name -- profile-edit only ever updates the DB
  // column, never this auth metadata, so a client who renames themselves
  // after sign-up keeps seeing their original sign-up name here. Accepted
  // trade-off per the "no new query" constraint; a cosmetic staleness, not
  // a functional bug.
  const fullName = session?.user.user_metadata?.full_name as string | undefined;
  const firstName = fullName?.trim().split(/\s+/)[0];
  const namePart = firstName ? `, ${firstName}` : '';
  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? 'clientHome.greetingMorning' : hour < 18 ? 'clientHome.greetingAfternoon' : 'clientHome.greetingEvening';
  const greeting = t(greetingKey, { name: namePart });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('clientHome.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.greetingBlock}>
          <ThemedText type="screenTitle">{greeting}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('clientHome.greetingSubtitle')}
          </ThemedText>
        </View>

        <View style={styles.myJobsRow}>
          <ThemedText type="sectionHeading">{t('clientHome.myJobsHeading')}</ThemedText>
          <Pressable
            onPress={() => setFilterOpen((prev) => !prev)}
            style={styles.filterButton}
            accessibilityRole="button">
            <ThemedText type="smallBold" themeColor="tint">
              {t('clientHome.filter')}
            </ThemedText>
            <Ionicons name={filterOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.tint} />
          </Pressable>
        </View>

        {filterOpen && (
          <View style={styles.filterChipsRow}>
            {FILTER_DEFS.map((def) => (
              <Chip
                key={def.key}
                label={t(def.titleKey)}
                selected={filterStatusKeys.includes(def.key)}
                onPress={() => toggleFilterStatus(def.key)}
              />
            ))}
          </View>
        )}

        {jobs === null ? (
          <LoadingState label={t('common.loading')} />
        ) : loadError !== null ? (
          // Kept separate from the genuine-empty branch below -- a failed
          // load must never look like "post your first job".
          <ThemedText type="small" style={{ color: theme.error }}>
            {t('common.loadError', { error: loadError })}
          </ThemedText>
        ) : sections.length === 0 ? (
          <>
            <EmptyState
              title={t('clientHome.empty')}
              actionLabel={t('postJob.title')}
              onActionPress={() => router.push('/post-job')}
            />
            {archiveToggle}
          </>
        ) : visibleSections.length === 0 ? (
          // Jobs exist, but the selected filter matches none of them -- a
          // different situation from "no jobs at all" above, so it gets a
          // small inline message instead of the full EmptyState/CTA.
          <View style={styles.noMatches}>
            <ThemedText type="default" themeColor="textSecondary">
              {t('clientHome.noFilterMatches')}
            </ThemedText>
            <Pressable onPress={() => setFilterStatusKeys([])}>
              <ThemedText type="small" themeColor="tint">
                {t('handymanJobFeed.clearFilters')}
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <SectionList
            showsVerticalScrollIndicator={false}
            sections={displaySections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            renderSectionHeader={({ section }) => <SectionHeader title={t(section.titleKey)} />}
            renderSectionFooter={({ section }) => {
              const full = visibleSections.find((s) => s.key === section.key);
              if (!full || full.data.length <= SECTION_DISPLAY_CAP || expandedSections.has(section.key)) {
                return null;
              }
              return (
                <Pressable
                  onPress={() => setExpandedSections((prev) => new Set(prev).add(section.key))}
                  style={styles.viewAll}>
                  <ThemedText type="small" themeColor="tint">
                    {t('clientHome.viewAll', { count: full.data.length })}
                  </ThemedText>
                </Pressable>
              );
            }}
            ListFooterComponent={archiveToggle || null}
            renderItem={({ item, section }) => {
              const tradeName = item.trades
                ? language === 'en'
                  ? item.trades.name_en
                  : item.trades.name_es
                : null;
              // Priority: hired handyman's photo -> job's own first photo ->
              // trade icon (handled below, in JSX, when thumbnailUri is
              // null). A hired job whose handyman has no avatar falls
              // through to the job's own photo, same as an open job would.
              const firstJobPhoto =
                item.job_photos.length > 0
                  ? [...item.job_photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
                  : null;
              const thumbnailUri = item.hired_bid?.handyman_profiles?.avatar_url || firstJobPhoto;
              const bidCountText =
                item.status === 'open' && bidCounts
                  ? t('clientHome.bidCount', { count: bidCounts[item.id] ?? 0 })
                  : null;
              const timeText = formatRelativeTime(
                item.status === 'expired' ? item.expires_at : item.created_at,
                t
              );

              const row = (
                <Link href={`/job/${item.id}`} asChild>
                  <Pressable>
                    <Card style={styles.card}>
                      <View style={styles.titleRow}>
                        {thumbnailUri ? (
                          <JobPhoto uri={thumbnailUri} style={styles.thumbnail} />
                        ) : (
                          <ServiceIcon slug={item.trades?.slug ?? ''} size={THUMBNAIL_SIZE} />
                        )}
                        <View style={styles.titleTextCol}>
                          <ThemedText type="cardTitle">{item.title}</ThemedText>
                          <View style={styles.metaRow}>
                            {tradeName && (
                              <ThemedText type="small" themeColor="textSecondary">
                                {tradeName}
                              </ThemedText>
                            )}
                            {tradeName && item.pueblos?.name && (
                              <View style={[styles.metaDot, { backgroundColor: theme.border }]} />
                            )}
                            {item.pueblos?.name && (
                              <View style={styles.pinRow}>
                                <Ionicons name="location-outline" size={12} color={theme.textSecondary} />
                                <ThemedText type="small" themeColor="textSecondary">
                                  {item.pueblos.name}
                                </ThemedText>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      <View style={styles.statusRow}>
                        <StatusBadge label={t(`jobStatus.${item.status}`)} tone={STATUS_TONE[item.status]} />
                        <ThemedText type="metadata" themeColor="textSecondary">
                          {bidCountText ? `${bidCountText} · ${timeText}` : timeText}
                        </ThemedText>
                      </View>
                    </Card>
                  </Pressable>
                </Link>
              );

              if (section.key !== 'completed' && section.key !== 'archived') {
                return row;
              }

              const isArchived = section.key === 'archived';
              return (
                <Swipeable
                  animationOptions={SWIPE_SPRING}
                  overshootFriction={SWIPE_OVERSHOOT_FRICTION}
                  renderRightActions={(progress, _drag, swipeable) => (
                    <SwipeAction
                      kind={isArchived ? 'unarchive' : 'archive'}
                      label={t(isArchived ? 'clientHome.unarchive' : 'clientHome.archive')}
                      progress={progress}
                      onPress={() => {
                        swipeable.close();
                        if (isArchived) {
                          handleUnarchive(item.id);
                        } else {
                          handleArchive(item.id);
                        }
                      }}
                    />
                  )}>
                  {row}
                </Swipeable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  greetingBlock: {
    gap: Spacing.half,
  },
  myJobsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: -Spacing.one,
  },
  noMatches: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  archiveToggle: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.two,
  },
  viewAll: {
    alignSelf: 'flex-start',
    marginTop: -Spacing.one,
    marginBottom: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset,
  },
  card: {
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  titleTextCol: {
    flex: 1,
    gap: Spacing.half,
  },
  // JobPhoto's own failed-load fallback (a themed box + "failed to load"
  // text) renders correctly at this size too -- no separate handling needed.
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: Radius.medium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexWrap: 'wrap',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
