import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
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
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { useTheme } from '@/hooks/use-theme';
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

type JobSection ={ key: 'invited' | 'available'; titleKey: string; data: JobFeedRow[] };

export default function HandymanJobFeedScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
  const { session } = useSession();
  const { pueblos } = usePueblos();
  const [jobs, setJobs] = useState<JobFeedRow[] | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // Invites are pinned to the top and exempt from the trade/pueblo filters,
  // so a filter can't hide something addressed to this user personally --
  // especially an invitation outside their own pueblos/trades.
  const filteredJobs = useMemo(() => {
    if (!jobs) return null;
    const invites = jobs.filter(isInvite);
    const rest = jobs.filter((job) => {
      if (isInvite(job)) return false;
      if (filterTradeIds.length > 0 && !filterTradeIds.includes(job.trade_id)) return false;
      if (filterPuebloIds && !filterPuebloIds.has(job.pueblo_id)) return false;
      return true;
    });
    return [...invites, ...rest];
  }, [jobs, filterTradeIds, filterPuebloIds, isInvite]);

  const hasActiveFilters = filterTradeIds.length > 0 || filterPuebloSlugs.length > 0;
  const activeFilterCount = filterTradeIds.length + filterPuebloSlugs.length;

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

  // Same three states and same toggle as the old full-width button (active /
  // open / closed), now a compact chip -- "Filters · 2" when anything is set.
  const filtersHighlighted = filtersOpen || hasActiveFilters;
  const filtersChip = (
    <Chip
      label={
        hasActiveFilters
          ? `${t('handymanJobFeed.showFilters')} · ${activeFilterCount}`
          : filtersOpen
            ? t('handymanJobFeed.hideFilters')
            : t('handymanJobFeed.showFilters')
      }
      selected={filtersHighlighted}
      icon={<Ionicons name="options-outline" size={16} color={filtersHighlighted ? theme.tint : theme.textSecondary} />}
      onPress={() => setFiltersOpen((prev) => !prev)}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('handymanJobFeed.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.controlsRow}>{filtersChip}</View>

        {/* With filters open, the screen is a plain ScrollView holding the
            panel -- the same structure Post Job uses for these pickers, which
            scrolls on-device. The previous fix put the panel in the FlatList's
            header instead, and on Android that never scrolled through it: the
            trade picker is itself a FlatList (nested-VirtualizedList
            handling), the pueblo list is an inner scroller that needs
            nestedScrollEnabled, and drags that start on the SVG map's
            pressable shapes are swallowed. */}
        {filtersOpen ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterScroll} keyboardShouldPersistTaps="handled">
            <ThemedView type="backgroundElement" style={styles.filterPanel}>
              <ThemedText type="smallBold">{t('postJob.tradeLabel')}</ThemedText>
              <TradePicker mode="multi" selected={filterTradeIds} onChange={setFilterTradeIds} />

              <ThemedText type="smallBold">{t('postJob.puebloLabel')}</ThemedText>
              <PuebloPicker mode="multi" selected={filterPuebloSlugs} onChange={setFilterPuebloSlugs} />

              {hasActiveFilters && (
                <PrimaryButton
                  label={t('handymanJobFeed.clearFilters')}
                  variant="secondary"
                  onPress={() => {
                    setFilterTradeIds([]);
                    setFilterPuebloSlugs([]);
                  }}
                />
              )}
            </ThemedView>
            <PrimaryButton
              label={t('handymanJobFeed.showResults', { count: filteredJobs?.length ?? 0 })}
              onPress={() => setFiltersOpen(false)}
            />
          </ScrollView>
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
    alignItems: 'center',
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
