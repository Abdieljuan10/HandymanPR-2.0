import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet } from 'react-native';
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

  useFocusEffect(
    useCallback(() => {
      if (!session) return;

      let isMounted = true;
      supabase
        .from('jobs')
        .select('id, title, created_at, trade_id, pueblo_id, pueblos(name), trades(name_es, name_en)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (isMounted) setJobs((data as JobFeedRow[] | null) ?? []);
        });

      return () => {
        isMounted = false;
      };
    }, [session])
  );

  const filterPuebloIds = useMemo(() => {
    if (!pueblos || filterPuebloSlugs.length === 0) return null;
    const slugSet = new Set(filterPuebloSlugs);
    return new Set(pueblos.filter((p) => slugSet.has(p.slug)).map((p) => p.id));
  }, [pueblos, filterPuebloSlugs]);

  const filteredJobs = useMemo(() => {
    if (!jobs) return null;
    return jobs.filter((job) => {
      if (filterTradeIds.length > 0 && !filterTradeIds.includes(job.trade_id)) return false;
      if (filterPuebloIds && !filterPuebloIds.has(job.pueblo_id)) return false;
      return true;
    });
  }, [jobs, filterTradeIds, filterPuebloIds]);

  const hasActiveFilters = filterTradeIds.length > 0 || filterPuebloSlugs.length > 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('handymanJobFeed.title')}
        </ThemedText>

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

        {filteredJobs === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : (
          <FlatList
            data={filteredJobs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {hasActiveFilters ? t('handymanJobFeed.emptyFiltered') : t('handymanJobFeed.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => {
              const tradeName = item.trades
                ? language === 'en'
                  ? item.trades.name_en
                  : item.trades.name_es
                : '';
              return (
                <Link href={`/job/${item.id}`} asChild>
                  <Pressable>
                    <ThemedView type="backgroundElement" style={styles.card}>
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
