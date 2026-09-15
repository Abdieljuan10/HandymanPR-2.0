import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type ClientJobRow = {
  id: string;
  title: string;
  status: 'open' | 'hired' | 'completed' | 'cancelled';
  created_at: string;
  pueblos: { name: string } | null;
};

export default function ClientHomeScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [jobs, setJobs] = useState<ClientJobRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;

      let isMounted = true;
      supabase
        .from('jobs')
        .select('id, title, status, created_at, pueblos(name)')
        .eq('client_id', session.user.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (isMounted) setJobs((data as ClientJobRow[] | null) ?? []);
        });

      return () => {
        isMounted = false;
      };
    }, [session])
  );

  async function handleRefresh() {
    if (!session) return;
    setRefreshing(true);
    const { data } = await supabase
      .from('jobs')
      .select('id, title, status, created_at, pueblos(name)')
      .eq('client_id', session.user.id)
      .order('created_at', { ascending: false });
    setJobs((data as ClientJobRow[] | null) ?? []);
    setRefreshing(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('clientHome.title')}
        </ThemedText>

        {jobs === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {t('clientHome.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Link href={`/job/${item.id}`} asChild>
                <Pressable>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    <ThemedText type="default">{item.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.pueblos?.name} · {t(`jobStatus.${item.status}`)} ·{' '}
                      {formatRelativeTime(item.created_at, t)}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              </Link>
            )}
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
