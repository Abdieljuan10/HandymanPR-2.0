import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type MyBidRow = {
  id: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  created_at: string;
  jobs: {
    id: string;
    title: string;
    status: 'open' | 'hired' | 'completed' | 'cancelled';
    pueblos: { name: string } | null;
  } | null;
};

type Section = { key: string; titleKey: string; data: MyBidRow[] };

export default function MyBidsScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [bids, setBids] = useState<MyBidRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    // "jobs" is disambiguated to "!job_id" because bids and jobs have two
    // FKs between them (bids.job_id, and jobs.hired_bid_id pointing back) —
    // without the hint, PostgREST can't tell which relationship to embed and
    // errors out, which silently produced an empty list here (the error was
    // never checked, so it looked like "no bids").
    const { data, error } = await supabase
      .from('bids')
      .select('id, price, status, created_at, jobs!job_id(id, title, status, pueblos(name))')
      .eq('handyman_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setBids((data as unknown as MyBidRow[] | null) ?? []);
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

  const sections = useMemo<Section[]>(() => {
    if (!bids) return [];
    // An accepted bid whose job was later cancelled isn't "still accepted"
    // from the handyman's point of view — it needs its own section rather
    // than sitting under "Accepted" looking like an active hire.
    const jobCancelled = bids.filter((b) => b.status === 'accepted' && b.jobs?.status === 'cancelled');
    const accepted = bids.filter((b) => b.status === 'accepted' && b.jobs?.status !== 'cancelled');
    const pending = bids.filter((b) => b.status === 'pending');
    const closed = bids.filter((b) => b.status === 'rejected' || b.status === 'withdrawn');

    return [
      { key: 'accepted', titleKey: 'myBids.sections.accepted', data: accepted },
      { key: 'pending', titleKey: 'myBids.sections.pending', data: pending },
      { key: 'jobCancelled', titleKey: 'myBids.sections.jobCancelled', data: jobCancelled },
      { key: 'closed', titleKey: 'myBids.sections.closed', data: closed },
    ].filter((section) => section.data.length > 0);
  }, [bids]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('tabs.myBids')}
        </ThemedText>

        {loadError ? (
          <ThemedText type="small" style={styles.error}>
            {t('common.loadError', { error: loadError })}
          </ThemedText>
        ) : bids === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : sections.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary">
            {t('myBids.empty')}
          </ThemedText>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            renderSectionHeader={({ section }) => (
              <ThemedText type="smallBold" style={styles.sectionHeader}>
                {t(section.titleKey)}
              </ThemedText>
            )}
            renderItem={({ item }) =>
              item.jobs ? (
                <Link href={`/job/${item.jobs.id}`} asChild>
                  <Pressable>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <ThemedText type="default">{item.jobs.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.jobs.pueblos?.name} · ${item.price.toFixed(2)} ·{' '}
                        {formatRelativeTime(item.created_at, t)}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                </Link>
              ) : null
            }
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
  sectionHeader: {
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  error: {
    color: '#d64545',
  },
});
