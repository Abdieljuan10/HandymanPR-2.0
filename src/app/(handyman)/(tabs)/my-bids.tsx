import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
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
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { SectionHeader } from '@/components/section-header';
import { ServiceIcon } from '@/components/service-icon';
import { StatusBadge, type StatusTone } from '@/components/status-badge';
import { SwipeAction, SWIPE_OVERSHOOT_FRICTION, SWIPE_SPRING } from '@/components/swipe-action';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type MyBidRow = {
  id: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled';
  created_at: string;
  jobs: {
    id: string;
    title: string;
    status: 'open' | 'hired' | 'pending_completion' | 'completed' | 'cancelled' | 'expired';
    trade_id: number;
    pueblo_id: number;
    pueblos: { name: string } | null;
    trades: { slug: string; name_es: string; name_en: string } | null;
    job_photos: { photo_url: string; sort_order: number }[];
  } | null;
};

// 'archived' isn't a real bid/job state -- it's a synthetic section built
// from whatever's currently hidden out of the archivable categories below.
type SectionKey = 'accepted' | 'completed' | 'pending' | 'jobCancelled' | 'closed' | 'archived';
type Section = { key: SectionKey; titleKey: string; data: MyBidRow[] };

// Only categories that represent "done, no longer actionable" state can be
// archived -- an active hire or a bid still awaiting a decision shouldn't be
// hideable, the same reasoning as the client side only allowing archive on
// completed jobs.
const ARCHIVABLE_KEYS: SectionKey[] = ['completed', 'jobCancelled', 'closed'];

const SECTION_DEFS: { key: Exclude<SectionKey, 'archived'>; titleKey: string }[] = [
  { key: 'accepted', titleKey: 'myBids.sections.accepted' },
  { key: 'completed', titleKey: 'myBids.sections.completed' },
  { key: 'pending', titleKey: 'myBids.sections.pending' },
  { key: 'jobCancelled', titleKey: 'myBids.sections.jobCancelled' },
  { key: 'closed', titleKey: 'myBids.sections.closed' },
];

// The three primary statuses get one-tap chips on the screen itself (row 2,
// single-select); the Filters panel keeps only the rest. Both write the
// same filterStatusKeys state, so there's still one filtering path --
// these are just which keys each control is allowed to touch.
const QUICK_STATUS_DEFS: { key: SectionKey; labelKey: string }[] = [
  { key: 'accepted', labelKey: 'myBids.quick.hired' },
  { key: 'pending', labelKey: 'myBids.quick.pending' },
  { key: 'completed', labelKey: 'myBids.quick.completed' },
];
const QUICK_STATUS_KEYS = QUICK_STATUS_DEFS.map((def) => def.key);
const PANEL_STATUS_DEFS = SECTION_DEFS.filter((def) => !QUICK_STATUS_KEYS.includes(def.key));

// Badge color per section -- display only; which section a bid lands in is
// decided by the grouping below, not here.
const SECTION_TONE: Record<SectionKey, StatusTone> = {
  accepted: 'success',
  completed: 'neutral',
  pending: 'warning',
  jobCancelled: 'error',
  closed: 'neutral',
  archived: 'neutral',
};

// job_photos is the same plain embed the job feed and client Home use, for
// the card thumbnail -- jobs without photos come back with an empty array.
const BIDS_SELECT =
  'id, price, status, created_at, jobs!job_id(id, title, status, trade_id, pueblo_id, pueblos(name), ' +
  'trades(slug, name_es, name_en), job_photos(photo_url, sort_order))';

const THUMBNAIL_SIZE = 52;

export default function MyBidsScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
  const { session } = useSession();
  const { pueblos } = usePueblos();
  const [bids, setBids] = useState<MyBidRow[] | null>(null);
  const [archivedJobIds, setArchivedJobIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterTradeIds, setFilterTradeIds] = useState<number[]>([]);
  const [filterPuebloSlugs, setFilterPuebloSlugs] = useState<string[]>([]);
  const [filterStatusKeys, setFilterStatusKeys] = useState<SectionKey[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const load = useCallback(async () => {
    if (!session) return;
    // "jobs" is disambiguated to "!job_id" because bids and jobs have two
    // FKs between them (bids.job_id, and jobs.hired_bid_id pointing back) —
    // without the hint, PostgREST can't tell which relationship to embed and
    // errors out, which silently produced an empty list here (the error was
    // never checked, so it looked like "no bids").
    const [{ data, error }, { data: archivesData }] = await Promise.all([
      supabase.from('bids').select(BIDS_SELECT).eq('handyman_id', session.user.id).order('created_at', {
        ascending: false,
      }),
      supabase.from('job_archives').select('job_id').eq('user_id', session.user.id),
    ]);

    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setBids((data as unknown as MyBidRow[] | null) ?? []);
    setArchivedJobIds(new Set((archivesData ?? []).map((row) => row.job_id as string)));
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

  const filterPuebloIds = useMemo(() => {
    if (!pueblos || filterPuebloSlugs.length === 0) return null;
    const slugSet = new Set(filterPuebloSlugs);
    return new Set(pueblos.filter((p) => slugSet.has(p.slug)).map((p) => p.id));
  }, [pueblos, filterPuebloSlugs]);

  const hasActiveFilters = filterTradeIds.length > 0 || filterPuebloSlugs.length > 0 || filterStatusKeys.length > 0;

  const { sections, archivedCount } = useMemo<{ sections: Section[]; archivedCount: number }>(() => {
    if (!bids) return { sections: [], archivedCount: 0 };

    const filtered = bids.filter((bid) => {
      if (!bid.jobs) return false;
      if (filterTradeIds.length > 0 && !filterTradeIds.includes(bid.jobs.trade_id)) return false;
      if (filterPuebloIds && !filterPuebloIds.has(bid.jobs.pueblo_id)) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) =>
      sortOrder === 'newest' ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)
    );

    // A bid whose job was cancelled after being hired isn't "still accepted"
    // from the handyman's point of view — it needs its own category rather
    // than sitting under "Accepted" looking like an active hire. bid.status
    // = 'cancelled' is the ground-truth marker going forward (the job
    // itself reopens to 'open', it doesn't stay 'cancelled'); the job-status
    // check alongside it only still matters for jobs cancelled before this
    // distinction existed, which are stuck at status = 'cancelled' for good.
    const grouped: Record<Exclude<SectionKey, 'archived'>, MyBidRow[]> = {
      jobCancelled: sorted.filter(
        (b) => b.status === 'cancelled' || (b.status === 'accepted' && b.jobs?.status === 'cancelled')
      ),
      completed: sorted.filter((b) => b.status === 'accepted' && b.jobs?.status === 'completed'),
      accepted: sorted.filter(
        (b) => b.status === 'accepted' && b.jobs?.status !== 'cancelled' && b.jobs?.status !== 'completed'
      ),
      pending: sorted.filter((b) => b.status === 'pending'),
      closed: sorted.filter((b) => b.status === 'rejected' || b.status === 'withdrawn'),
    };

    const activeDefs = SECTION_DEFS.filter((def) => filterStatusKeys.length === 0 || filterStatusKeys.includes(def.key));

    const visible: Section[] = [];
    const archivedRows: MyBidRow[] = [];

    for (const def of activeDefs) {
      const rows = grouped[def.key];
      if (!ARCHIVABLE_KEYS.includes(def.key)) {
        if (rows.length > 0) visible.push({ key: def.key, titleKey: def.titleKey, data: rows });
        continue;
      }
      const notArchived = rows.filter((b) => !b.jobs || !archivedJobIds.has(b.jobs.id));
      const archived = rows.filter((b) => b.jobs && archivedJobIds.has(b.jobs.id));
      archivedRows.push(...archived);
      if (notArchived.length > 0) visible.push({ key: def.key, titleKey: def.titleKey, data: notArchived });
    }

    if (showArchived && archivedRows.length > 0) {
      visible.push({ key: 'archived', titleKey: 'myBids.sections.archived', data: archivedRows });
    }

    return { sections: visible, archivedCount: archivedRows.length };
  }, [bids, archivedJobIds, showArchived, filterTradeIds, filterPuebloIds, filterStatusKeys, sortOrder]);

  function toggleStatusFilter(key: SectionKey) {
    setFilterStatusKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // Single-select among the quick chips: tapping the active one clears it,
  // tapping another swaps to it. Panel-only status keys are left alone.
  function toggleQuickStatus(key: SectionKey) {
    setFilterStatusKeys((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev.filter((k) => !QUICK_STATUS_KEYS.includes(k)), key]
    );
  }

  // hasActiveFilters above (quick statuses included) still drives the
  // empty-state wording; the Filters chip and Clear Filters only reflect
  // what's set inside the panel, so a quick chip doesn't count as a filter.
  const panelStatusCount = filterStatusKeys.filter((k) => !QUICK_STATUS_KEYS.includes(k)).length;
  const activeFilterCount = filterTradeIds.length + filterPuebloSlugs.length + panelStatusCount;
  const hasPanelFilters = activeFilterCount > 0;
  const filtersHighlighted = filtersOpen || hasPanelFilters;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('tabs.myBids')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        {/* Was its own permanent banner above this row (client call
            2026-09-25: wasted space, always there whenever anything was
            archived). Now a compact icon sharing the filters row instead.
            Sort order moved into the filter panel below (was a second
            button here too, which crowded this row and forced the icon
            off its vertical center -- see filterPanel for it now).
            2026-09-26 visual pass: the full-width Filters button is now a
            compact chip ("Filters · 3" when active) -- same three labels,
            same toggle. */}
        <View style={styles.controlsRow}>
          <Chip
            label={
              hasPanelFilters
                ? `${t('myBids.showFilters')} · ${activeFilterCount}`
                : filtersOpen
                  ? t('myBids.hideFilters')
                  : t('myBids.showFilters')
            }
            selected={filtersHighlighted}
            icon={<Ionicons name="options-outline" size={16} color={filtersHighlighted ? theme.tint : theme.textSecondary} />}
            onPress={() => setFiltersOpen((prev) => !prev)}
          />
          {archivedCount > 0 && (
            <Pressable
              onPress={() => setShowArchived((prev) => !prev)}
              style={[
                styles.archiveIconButton,
                {
                  backgroundColor: showArchived ? theme.tintBackground : theme.backgroundElement,
                  borderColor: showArchived ? theme.tint : theme.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                showArchived ? t('myBids.hideArchived') : t('myBids.showArchived', { count: archivedCount })
              }>
              <Ionicons name="archive-outline" size={18} color={showArchived ? theme.tint : theme.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Row 2: quick status chips. Own row, not beside Filters -- in
            Spanish (Contratadas/Pendientes/Completadas) all four controls
            can't share ~342px without shrinking text (client picked this
            2026-09-26). flexGrow spreads them across the row, sized to
            their labels, so the longest word never clips. */}
        <View style={styles.quickRow}>
          {QUICK_STATUS_DEFS.map((def) => (
            <Chip
              key={def.key}
              label={t(def.labelKey)}
              selected={filterStatusKeys.includes(def.key)}
              onPress={() => toggleQuickStatus(def.key)}
              style={styles.quickChip}
            />
          ))}
        </View>

        {/* With filters open, the screen becomes a plain ScrollView holding
            the panel -- the same structure Post Job uses for these pickers,
            which scrolls on-device. A fixed panel above the list (the
            previous shape here) doesn't scroll on Android: TradePicker is
            itself a FlatList nested in a FlatList/SectionList, PuebloList is
            an inner scroller Android won't hand drags to without
            nestedScrollEnabled, and drags starting on the SVG map's
            pressable shapes get swallowed. See job feed / Browse for the
            same fix. */}
        {filtersOpen ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterScroll} keyboardShouldPersistTaps="handled">
            <ThemedView type="backgroundElement" style={styles.filterPanel}>
              <ThemedText type="smallBold">{t('postJob.tradeLabel')}</ThemedText>
              <TradePicker mode="multi" selected={filterTradeIds} onChange={setFilterTradeIds} />

              <ThemedText type="smallBold">{t('postJob.puebloLabel')}</ThemedText>
              <PuebloPicker mode="multi" selected={filterPuebloSlugs} onChange={setFilterPuebloSlugs} />

              <ThemedText type="smallBold">{t('myBids.statusLabel')}</ThemedText>
              <View style={styles.chipRow}>
                {PANEL_STATUS_DEFS.map((def) => (
                  <Chip
                    key={def.key}
                    label={t(def.titleKey)}
                    selected={filterStatusKeys.includes(def.key)}
                    onPress={() => toggleStatusFilter(def.key)}
                  />
                ))}
              </View>

              {/* Was its own button sharing the top controls row with
                  Filtros (client call 2026-09-25: crowded that row and
                  pushed the archive icon off its vertical center). Not a
                  "filter" -- doesn't hide anything -- so it sits below the
                  filters proper, outside hasActiveFilters/clearFilters. */}
              <ThemedText type="smallBold">{t('myBids.sortLabel')}</ThemedText>
              <Chip
                label={sortOrder === 'newest' ? t('myBids.sortNewest') : t('myBids.sortOldest')}
                icon={<Ionicons name="swap-vertical-outline" size={16} color={theme.textSecondary} />}
                onPress={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
              />

              {hasPanelFilters && (
                <PrimaryButton
                  label={t('myBids.clearFilters')}
                  variant="secondary"
                  onPress={() => {
                    setFilterTradeIds([]);
                    setFilterPuebloSlugs([]);
                    // Keeps the selected quick status (it lives outside
                    // this panel); clears only the panel's own statuses.
                    setFilterStatusKeys((prev) => prev.filter((k) => QUICK_STATUS_KEYS.includes(k)));
                  }}
                />
              )}
            </ThemedView>
            <PrimaryButton
              label={t('myBids.showResults', { count: sections.reduce((sum, s) => sum + s.data.length, 0) })}
              onPress={() => setFiltersOpen(false)}
            />
          </ScrollView>
        ) : loadError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t('myBids.errorTitle')}
            description={t('common.loadError', { error: loadError })}
          />
        ) : bids === null ? (
          <LoadingState label={t('common.loading')} />
        ) : sections.length === 0 ? (
          hasActiveFilters ? (
            <EmptyState icon="funnel-outline" title={t('myBids.emptyFilteredTitle')} description={t('myBids.emptyFiltered')} />
          ) : (
            <EmptyState icon="pricetag-outline" title={t('myBids.emptyTitle')} description={t('myBids.empty')} />
          )
        ) : (
          <SectionList
            showsVerticalScrollIndicator={false}
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <SectionHeader title={`${t(section.titleKey)} · ${section.data.length}`} />
              </View>
            )}
            renderItem={({ item, section }) => {
              if (!item.jobs) return null;
              const tradeName = item.jobs.trades
                ? language === 'en'
                  ? item.jobs.trades.name_en
                  : item.jobs.trades.name_es
                : '';
              // Thumbnail: the job's first photo, else the trade icon.
              const photos = item.jobs.job_photos;
              const firstPhoto =
                photos && photos.length > 0
                  ? [...photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
                  : null;
              const row = (
                <Link href={`/job/${item.jobs.id}`} asChild>
                  <Pressable>
                    {/* marginBottom (styles.card) matches SwipeAction's own
                        marginBottom so the revealed action lines up with
                        the card's height -- keep them equal. */}
                    <Card style={styles.card}>
                      <View style={styles.cardTop}>
                        {firstPhoto ? (
                          <JobPhoto uri={firstPhoto} style={styles.thumbnail} />
                        ) : (
                          <ServiceIcon slug={item.jobs.trades?.slug ?? ''} size={THUMBNAIL_SIZE} />
                        )}
                        <View style={styles.cardBody}>
                          <ThemedText type="cardTitle" numberOfLines={2}>
                            {item.jobs.title}
                          </ThemedText>
                          <View style={styles.metaRow}>
                            {tradeName !== '' && (
                              <ThemedText type="small" themeColor="textSecondary">
                                {tradeName}
                              </ThemedText>
                            )}
                            {tradeName !== '' && item.jobs.pueblos?.name && (
                              <View style={[styles.metaDot, { backgroundColor: theme.border }]} />
                            )}
                            {item.jobs.pueblos?.name && (
                              <View style={styles.iconRow}>
                                <Ionicons name="location-outline" size={12} color={theme.textSecondary} />
                                <ThemedText type="small" themeColor="textSecondary">
                                  {item.jobs.pueblos.name}
                                </ThemedText>
                              </View>
                            )}
                          </View>
                        </View>
                        <ThemedText type="cardTitle" themeColor="tint">
                          ${item.price.toFixed(2)}
                        </ThemedText>
                      </View>
                      <View style={styles.cardBottom}>
                        <StatusBadge label={t(section.titleKey)} tone={SECTION_TONE[section.key]} />
                        <ThemedText type="metadata">{formatRelativeTime(item.created_at, t)}</ThemedText>
                      </View>
                    </Card>
                  </Pressable>
                </Link>
              );

              if (!ARCHIVABLE_KEYS.includes(section.key) && section.key !== 'archived') {
                return row;
              }

              const jobId = item.jobs.id;
              const isArchived = section.key === 'archived';
              return (
                <Swipeable
                  animationOptions={SWIPE_SPRING}
                  overshootFriction={SWIPE_OVERSHOOT_FRICTION}
                  renderRightActions={(progress, _drag, swipeable) => (
                    <SwipeAction
                      kind={isArchived ? 'unarchive' : 'archive'}
                      label={t(isArchived ? 'myBids.unarchive' : 'myBids.archive')}
                      progress={progress}
                      onPress={() => {
                        swipeable.close();
                        if (isArchived) {
                          handleUnarchive(jobId);
                        } else {
                          handleArchive(jobId);
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
  archiveIconButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  filterScroll: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset,
  },
  filterPanel: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  quickRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    // Pulls row 2 a bit closer to row 1 than safeArea's gap, so the two
    // control rows read as one group above the list.
    marginTop: -Spacing.one,
  },
  quickChip: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset,
  },
  sectionHeader: {
    marginTop: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: Radius.medium,
  },
  cardBody: {
    flex: 1,
    gap: Spacing.half,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
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
});
