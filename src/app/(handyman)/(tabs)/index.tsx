import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
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
  trades: { name_es: string; name_en: string } | null;
};

export default function HandymanJobFeedScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
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
        .select('id, title, created_at, trade_id, pueblo_id, visibility, pueblos(name), trades(name_es, name_en)')
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

  const filtersButton = (
    <PrimaryButton
      label={
        hasActiveFilters
          ? t('handymanJobFeed.filtersActive')
          : filtersOpen
            ? t('handymanJobFeed.hideFilters')
            : t('handymanJobFeed.showFilters')
      }
      variant="secondary"
      onPress={() => setFiltersOpen((prev) => !prev)}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('handymanJobFeed.title')}
        </ThemedText>

        {/* With filters open, the screen is a plain ScrollView holding the
            panel -- the same structure Post Job uses for these pickers, which
            scrolls on-device. The previous fix put the panel in the FlatList's
            header instead, and on Android that never scrolled through it: the
            trade picker is itself a FlatList (nested-VirtualizedList
            handling), the pueblo list is an inner scroller that needs
            nestedScrollEnabled, and drags that start on the SVG map's
            pressable shapes are swallowed. */}
        {filtersOpen ? (
          <ScrollView contentContainerStyle={styles.filterScroll} keyboardShouldPersistTaps="handled">
            {filtersButton}
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
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : (
          <FlatList
            data={filteredJobs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListHeaderComponent={<View style={styles.header}>{filtersButton}</View>}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {loadError !== null
                  ? t('common.loadError', { error: loadError })
                  : hasActiveFilters
                    ? t('handymanJobFeed.emptyFiltered')
                    : t('handymanJobFeed.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => {
              const tradeName = item.trades ? (language === 'en' ? item.trades.name_en : item.trades.name_es) : '';
              return (
                <Link href={`/job/${item.id}`} asChild>
                  <Pressable>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      {isInvite(item) && (
                        <ThemedText type="smallBold" themeColor="tint">
                          {t('handymanJobFeed.invitedYou')}
                        </ThemedText>
                      )}
                      <ThemedText type="default">{item.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.pueblos?.name} · {tradeName} · {formatRelativeTime(item.created_at, t)}
                      </ThemedText>
                    </ThemedView>
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
  title: {
    marginBottom: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  filterScroll: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  filterPanel: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
});
