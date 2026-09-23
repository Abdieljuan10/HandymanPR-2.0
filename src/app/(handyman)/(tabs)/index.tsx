import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
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
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('jobs')
      .select('id, title, created_at, trade_id, pueblo_id, visibility, pueblos(name), trades(name_es, name_en)')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    setJobs((data as JobFeedRow[] | null) ?? []);
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

  const filterPuebloIds = useMemo(() => {
    if (!pueblos || filterPuebloSlugs.length === 0) return null;
    const slugSet = new Set(filterPuebloSlugs);
    return new Set(pueblos.filter((p) => slugSet.has(p.slug)).map((p) => p.id));
  }, [pueblos, filterPuebloSlugs]);

  // RLS only ever returns an invite_only job to the handyman it invites, so
  // any one here is addressed to this user personally: pinned to the top
  // and exempt from the trade/pueblo filters, so a filter can't hide it.
  const filteredJobs = useMemo(() => {
    if (!jobs) return null;
    const invites = jobs.filter((job) => job.visibility === 'invite_only');
    const rest = jobs.filter((job) => {
      if (job.visibility === 'invite_only') return false;
      if (filterTradeIds.length > 0 && !filterTradeIds.includes(job.trade_id)) return false;
      if (filterPuebloIds && !filterPuebloIds.has(job.pueblo_id)) return false;
      return true;
    });
    return [...invites, ...rest];
  }, [jobs, filterTradeIds, filterPuebloIds]);

  const hasActiveFilters = filterTradeIds.length > 0 || filterPuebloSlugs.length > 0;

  // Rendered as the list's header, not above the list: the pickers don't
  // scroll on their own (built to sit inside Post Job's ScrollView), so a
  // fixed panel above the list ran off the bottom of the screen with no way
  // to reach the rest of the trades or the pueblo section.
  const filtersHeader = (
    <View style={styles.header}>
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

      {filtersOpen && (
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
      )}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('handymanJobFeed.title')}
        </ThemedText>

        {filteredJobs === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : (
          <FlatList
            data={filteredJobs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListHeaderComponent={filtersHeader}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {hasActiveFilters ? t('handymanJobFeed.emptyFiltered') : t('handymanJobFeed.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => {
              const tradeName = item.trades ? (language === 'en' ? item.trades.name_en : item.trades.name_es) : '';
              return (
                <Link href={`/job/${item.id}`} asChild>
                  <Pressable>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      {item.visibility === 'invite_only' && (
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
