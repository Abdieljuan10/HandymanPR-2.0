import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filters/filter-chip';
import { FilterViewShell } from '@/components/filters/filter-view-shell';
import { PuebloFilterView } from '@/components/filters/pueblo-filter-view';
import { TradeFilterGrid } from '@/components/filters/trade-filter-grid';
import { JobPhoto } from '@/components/job-photo';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { ServiceIcon } from '@/components/service-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { useTheme } from '@/hooks/use-theme';
import { useTrades } from '@/hooks/use-trades';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobFeedRow = {
  id: string;
  title: string;
  created_at: string;
  trade_id: number;
  pueblo_id: number;
  visibility: 'public' | 'invite_only';
  pueblos: { name: string } | null;
  trades: { slug: string; name_es: string; name_en: string } | null;
  job_photos: { photo_url: string; sort_order: number }[];
};

const THUMBNAIL_SIZE = 52;

// Pueblo chip's selected names -- same slug -> name source PuebloFilterView
// uses for its own selected chips.
const PUEBLO_NAME_BY_SLUG = new Map(PUEBLO_SHAPES.map((shape) => [shape.slug, shape.name]));

type JobSection ={ key: 'invited' | 'available'; titleKey: string; data: JobFeedRow[] };

export default function HandymanJobFeedScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
  const { session } = useSession();
  const { pueblos } = usePueblos();
  // The same trades lookup TradePicker already ran for the old panel --
  // needed for the Oficio chip's names and the grid (slug + sort_order),
  // including a selected trade with no jobs left in the feed.
  const { trades, error: tradesError } = useTrades();
  const [jobs, setJobs] = useState<JobFeedRow[] | null>(null);
  // Which focused filter view (2026-09-26) is replacing the list, if any.
  // Only open/closed -- the selections below persist independently.
  const [openFilter, setOpenFilter] = useState<'trade' | 'pueblo' | null>(null);
  const [filterTradeIds, setFilterTradeIds] = useState<number[]>([]);
  const [filterPuebloSlugs, setFilterPuebloSlugs] = useState<string[]>([]);
  // Public jobs this handyman was invited to by name (job_invitations; RLS
  // only returns their own rows). Separate query, not a jobs embed, so if
  // it ever fails only the "invited" pinning is lost, not the whole feed.
  const [invitedJobIds, setInvitedJobIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data, error }, { data: invitations, error: invitationsError }] = await Promise.all([
      supabase
        .from('jobs')
        // job_photos rides along in this same query (same embed as client
        // Home) for the card thumbnail -- a plain embed, so jobs without
        // photos still come back, with an empty array.
        .select(
          'id, title, created_at, trade_id, pueblo_id, visibility, pueblos(name), trades(slug, name_es, name_en), ' +
            'job_photos(photo_url, sort_order)'
        )
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase.from('job_invitations').select('job_id').eq('handyman_id', session.user.id),
    ]);
    if (invitationsError) console.error('Failed to load job invitations:', invitationsError.message);
    // A failed load must not read as "no open jobs match your pueblos and
    // trades" -- on a handyman's main screen that looks like there's no work.
    if (error) {
      console.error('Failed to load job feed:', error.message);
      setLoadError(error.message);
      setJobs([]);
      return;
    }
    setLoadError(null);
    setJobs((data as unknown as JobFeedRow[] | null) ?? []);
    setInvitedJobIds(new Set((invitations ?? []).map((row) => row.job_id as string)));
  }, [session]);

  // Personally addressed to this handyman: a private invite_only job (RLS
  // only returns those to the handyman they name) or an invitation to a
  // public job.
  const isInvite = useCallback(
    (job: JobFeedRow) => job.visibility === 'invite_only' || invitedJobIds.has(job.id),
    [invitedJobIds]
  );

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

  const closeFilter = useCallback(() => setOpenFilter(null), []);

  // Leaving the Jobs tab closes whichever focused filter view is open, so
  // coming back lands on the feed (same as Client Browse). Selections kept.
  useFocusEffect(
    useCallback(() => {
      return () => setOpenFilter(null);
    }, [])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filterPuebloIds = useMemo(() => {
    if (!pueblos || filterPuebloSlugs.length === 0) return null;
    const slugSet = new Set(filterPuebloSlugs);
    return new Set(pueblos.filter((p) => slugSet.has(p.slug)).map((p) => p.id));
  }, [pueblos, filterPuebloSlugs]);

  // The two filter checks, split out (2026-09-26, focused Oficio/Pueblo
  // views) so the filter views' options/counts can apply one without the
  // other, reusing the exact same checks. filteredJobs applies both, same
  // as before.
  const matchesTradeFilter = useCallback(
    (job: JobFeedRow) => filterTradeIds.length === 0 || filterTradeIds.includes(job.trade_id),
    [filterTradeIds]
  );
  const matchesPuebloFilter = useCallback(
    (job: JobFeedRow) => !filterPuebloIds || filterPuebloIds.has(job.pueblo_id),
    [filterPuebloIds]
  );

  // Invites are pinned to the top and exempt from the trade/pueblo filters,
  // so a filter can't hide something addressed to this user personally --
  // especially an invitation outside their own pueblos/trades.
  const filteredJobs = useMemo(() => {
    if (!jobs) return null;
    const invites = jobs.filter(isInvite);
    const rest = jobs.filter((job) => !isInvite(job) && matchesTradeFilter(job) && matchesPuebloFilter(job));
    return [...invites, ...rest];
  }, [jobs, isInvite, matchesTradeFilter, matchesPuebloFilter]);

  const hasActiveFilters = filterTradeIds.length > 0 || filterPuebloSlugs.length > 0;

  // ---- Focused filter views (2026-09-26) ----
  // Options and counts come ONLY from non-invitation jobs: invitations are
  // pinned and bypass both filters, so they can't be "found" by filtering
  // and mustn't inflate a trade/pueblo into looking like it has results.
  // All computed from the jobs already loaded -- no extra query.
  const filterableJobs = useMemo(() => (jobs ?? []).filter((job) => !isInvite(job)), [jobs, isInvite]);

  // Per-trade count under the CURRENT pueblo selection, never under the
  // trade filter itself -- so a selected trade's tile shows what it
  // contributes, not 0.
  const tradeCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const job of filterableJobs) {
      if (!matchesPuebloFilter(job)) continue;
      counts.set(job.trade_id, (counts.get(job.trade_id) ?? 0) + 1);
    }
    return counts;
  }, [filterableJobs, matchesPuebloFilter]);

  // Only trades that can produce a result, plus anything already selected
  // (so it stays visible and removable even at 0). In the trades table's
  // own sort_order.
  const tradeOptions = useMemo(
    () => (trades ?? []).filter((trade) => tradeCounts.has(trade.id) || filterTradeIds.includes(trade.id)),
    [trades, tradeCounts, filterTradeIds]
  );

  // Pueblos with at least one job under the CURRENT trade selection.
  // PuebloFilterView adds the selected pueblos back itself, so a selection
  // that drops to 0 stays removable. undefined until pueblos load (the view
  // shows a loading state until then).
  const availablePuebloSlugs = useMemo(() => {
    if (!pueblos) return undefined;
    const slugById = new Map(pueblos.map((p) => [p.id, p.slug]));
    const slugs = new Set<string>();
    for (const job of filterableJobs) {
      if (!matchesTradeFilter(job)) continue;
      const slug = slugById.get(job.pueblo_id);
      if (slug) slugs.add(slug);
    }
    return slugs;
  }, [pueblos, filterableJobs, matchesTradeFilter]);

  // CTA count: the filterable list only, not the pinned invitations.
  const filteredAvailableCount = useMemo(
    () => (filteredJobs ?? []).filter((job) => !isInvite(job)).length,
    [filteredJobs, isInvite]
  );

  const selectedTradeNames = useMemo(() => {
    if (!trades) return [];
    const byId = new Map(trades.map((trade) => [trade.id, trade.name]));
    return filterTradeIds.map((id) => byId.get(id)).filter((name): name is string => !!name);
  }, [trades, filterTradeIds]);

  const selectedPuebloNames = useMemo(
    () => filterPuebloSlugs.map((slug) => PUEBLO_NAME_BY_SLUG.get(slug) ?? slug),
    [filterPuebloSlugs]
  );

  // Display-only split of filteredJobs into its two existing halves (invites
  // pinned first, then the rest) -- same rows, same order, just rendered
  // under two headers. filteredJobs itself, and the "Show N" count built on
  // it, are untouched.
  const sections = useMemo<JobSection[]>(() => {
    if (!filteredJobs) return [];
    const invites = filteredJobs.filter(isInvite);
    const rest = filteredJobs.filter((job) => !isInvite(job));
    const list: JobSection[] = [];
    if (invites.length > 0) list.push({ key: 'invited', titleKey: 'handymanJobFeed.invitedSection', data: invites });
    if (rest.length > 0) list.push({ key: 'available', titleKey: 'handymanJobFeed.availableSection', data: rest });
    return list;
  }, [filteredJobs, isInvite]);

  const resultsLabel = t('handymanJobFeed.showResults', { count: filteredAvailableCount });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('handymanJobFeed.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        {openFilter === null && (
          <View style={styles.controlsRow}>
            <FilterChip
              label={t('postJob.tradeLabel')}
              selectedNames={selectedTradeNames}
              onPress={() => setOpenFilter('trade')}
            />
            <FilterChip
              label={t('postJob.puebloLabel')}
              selectedNames={selectedPuebloNames}
              onPress={() => setOpenFilter('pueblo')}
            />
          </View>
        )}

        {/* A focused filter view REPLACES the list while open (plain
            ScrollView inside FilterViewShell) -- never inside the
            SectionList. On Android, filter pickers inside a FlatList header
            never scrolled: nested-VirtualizedList handling, the pueblo
            list's inner scroller needing nestedScrollEnabled, and drags on
            the SVG map's pressable shapes being swallowed. Same structure as
            Client Browse's filter views (phone-tested 2026-09-26). The old
            combined trade+pueblo panel was removed once both chips had their
            own views. */}
        {openFilter === 'trade' ? (
          <FilterViewShell
            title={t('postJob.tradeLabel')}
            onClose={closeFilter}
            onClear={() => setFilterTradeIds([])}
            canClear={filterTradeIds.length > 0}
            ctaLabel={resultsLabel}
            onCtaPress={closeFilter}>
            {tradesError ? (
              <ThemedText type="small" themeColor="error">
                {t('common.loadError', { error: tradesError })}
              </ThemedText>
            ) : !trades || !jobs ? (
              <LoadingState label={t('common.loading')} fullScreen={false} />
            ) : tradeOptions.length === 0 ? (
              <EmptyState
                icon="briefcase-outline"
                title={t('handymanJobFeed.emptyTitle')}
                description={t('handymanJobFeed.empty')}
              />
            ) : (
              <TradeFilterGrid
                trades={tradeOptions}
                selected={filterTradeIds}
                onChange={setFilterTradeIds}
                counts={tradeCounts}
                countLabel={(count) => t('handymanJobFeed.tradeCount', { count })}
              />
            )}
          </FilterViewShell>
        ) : openFilter === 'pueblo' ? (
          <FilterViewShell
            title={t('postJob.puebloLabel')}
            onClose={closeFilter}
            onClear={() => setFilterPuebloSlugs([])}
            canClear={filterPuebloSlugs.length > 0}
            ctaLabel={resultsLabel}
            onCtaPress={closeFilter}>
            {availablePuebloSlugs === undefined || !jobs ? (
              <LoadingState label={t('common.loading')} fullScreen={false} />
            ) : (
              <PuebloFilterView
                selected={filterPuebloSlugs}
                onChange={setFilterPuebloSlugs}
                availableSlugs={availablePuebloSlugs}
              />
            )}
          </FilterViewShell>
        ) : filteredJobs === null ? (
          <LoadingState label={t('common.loading')} />
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
                <SectionHeader title={t(section.titleKey)} />
              </View>
            )}
            ListEmptyComponent={
              loadError !== null ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title={t('handymanJobFeed.errorTitle')}
                  description={t('common.loadError', { error: loadError })}
                />
              ) : hasActiveFilters ? (
                <EmptyState
                  icon="funnel-outline"
                  title={t('handymanJobFeed.emptyFilteredTitle')}
                  description={t('handymanJobFeed.emptyFiltered')}
                />
              ) : (
                <EmptyState
                  icon="briefcase-outline"
                  title={t('handymanJobFeed.emptyTitle')}
                  description={t('handymanJobFeed.empty')}
                />
              )
            }
            renderItem={({ item }) => {
              const tradeName = item.trades ? (language === 'en' ? item.trades.name_en : item.trades.name_es) : '';
              const invited = isInvite(item);
              // Thumbnail: the job's first photo, else the trade icon.
              const firstPhoto =
                item.job_photos && item.job_photos.length > 0
                  ? [...item.job_photos].sort((a, b) => a.sort_order - b.sort_order)[0].photo_url
                  : null;
              return (
                <Link href={`/job/${item.id}`} asChild>
                  <Pressable>
                    {/* Elevated only for invites -- the one thing on this
                        screen addressed to this handyman personally. */}
                    <Card variant={invited ? 'elevated' : 'flat'} style={styles.card}>
                      {firstPhoto ? (
                        <JobPhoto uri={firstPhoto} style={styles.thumbnail} />
                      ) : (
                        <ServiceIcon slug={item.trades?.slug ?? ''} size={THUMBNAIL_SIZE} />
                      )}
                      <View style={styles.cardBody}>
                        {invited && (
                          <View style={styles.iconRow}>
                            <Ionicons name="mail-outline" size={13} color={theme.tint} />
                            <ThemedText type="smallBold" themeColor="tint">
                              {t('handymanJobFeed.invitedYou')}
                            </ThemedText>
                          </View>
                        )}
                        <ThemedText type="cardTitle" numberOfLines={2}>
                          {item.title}
                        </ThemedText>
                        <View style={styles.metaRow}>
                          {tradeName !== '' && (
                            <ThemedText type="small" themeColor="textSecondary">
                              {tradeName}
                            </ThemedText>
                          )}
                          {tradeName !== '' && item.pueblos?.name && (
                            <View style={[styles.metaDot, { backgroundColor: theme.border }]} />
                          )}
                          {item.pueblos?.name && (
                            <View style={styles.iconRow}>
                              <Ionicons name="location-outline" size={12} color={theme.textSecondary} />
                              <ThemedText type="small" themeColor="textSecondary">
                                {item.pueblos.name}
                              </ThemedText>
                            </View>
                          )}
                        </View>
                        <ThemedText type="metadata">{formatRelativeTime(item.created_at, t)}</ThemedText>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                    </Card>
                  </Pressable>
                </Link>
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
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
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
