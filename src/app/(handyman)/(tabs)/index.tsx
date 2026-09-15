import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobFeedRow = {
  id: string;
  title: string;
  created_at: string;
  pueblos: { name: string } | null;
  trades: { name_es: string; name_en: string } | null;
};

export default function HandymanJobFeedScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { session } = useSession();
  const [jobs, setJobs] = useState<JobFeedRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;

      let isMounted = true;
      supabase
        .from('jobs')
        .select('id, title, created_at, pueblos(name), trades(name_es, name_en)')
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('handymanJobFeed.title')}
        </ThemedText>

        {jobs === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {t('handymanJobFeed.empty')}
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
  list: {
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
});
