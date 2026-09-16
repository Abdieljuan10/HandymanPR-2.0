import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobStatus = 'open' | 'hired' | 'completed' | 'cancelled' | 'expired';

type ClientJobRow = {
  id: string;
  title: string;
  status: JobStatus;
  created_at: string;
  pueblos: { name: string } | null;
};

type Section = { key: string; titleKey: string; data: ClientJobRow[] };

const STATUS_COLORS: Record<Exclude<JobStatus, 'open'>, string> = {
  hired: '#2e9e5b',
  completed: '#3c87f7',
  cancelled: '#d64545',
  expired: '#9a9a9a',
};

const JOBS_SELECT = 'id, title, status, created_at, pueblos(name)';

export default function ClientHomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useSession();
  const [jobs, setJobs] = useState<ClientJobRow[] | null>(null);
  const [bidCounts, setBidCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;

    const { data } = await supabase
      .from('jobs')
      .select(JOBS_SELECT)
      .eq('client_id', session.user.id)
      .order('created_at', { ascending: false });

    const jobsData = (data as ClientJobRow[] | null) ?? [];
    setJobs(jobsData);

    const openJobIds = jobsData.filter((job) => job.status === 'open').map((job) => job.id);
    if (openJobIds.length === 0) {
      setBidCounts({});
      return;
    }

    const { data: bidsData } = await supabase
      .from('bids')
      .select('job_id')
      .in('job_id', openJobIds)
      .neq('status', 'withdrawn');

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

  const sections = useMemo<Section[]>(() => {
    if (!jobs) return [];
    const hired = jobs.filter((job) => job.status === 'hired');
    const open = jobs.filter((job) => job.status === 'open');
    const completed = jobs.filter((job) => job.status === 'completed');
    const cancelled = jobs.filter((job) => job.status === 'cancelled');
    const expired = jobs.filter((job) => job.status === 'expired');

    return [
      { key: 'hired', titleKey: 'clientHome.sections.hired', data: hired },
      { key: 'open', titleKey: 'clientHome.sections.open', data: open },
      { key: 'completed', titleKey: 'clientHome.sections.completed', data: completed },
      { key: 'expired', titleKey: 'clientHome.sections.expired', data: expired },
      { key: 'cancelled', titleKey: 'clientHome.sections.cancelled', data: cancelled },
    ].filter((section) => section.data.length > 0);
  }, [jobs]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('clientHome.title')}
        </ThemedText>

        {jobs === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : sections.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary">
            {t('clientHome.empty')}
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
            renderItem={({ item }) => {
              const dotColor = item.status === 'open' ? theme.textSecondary : STATUS_COLORS[item.status];
              return (
                <Link href={`/job/${item.id}`} asChild>
                  <Pressable>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <View style={styles.titleRow}>
                        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                        <ThemedText type="default">{item.title}</ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.pueblos?.name} · {t(`jobStatus.${item.status}`)}
                        {item.status === 'open'
                          ? ` · ${t('clientHome.bidCount', { count: bidCounts[item.id] ?? 0 })}`
                          : ''}{' '}
                        · {formatRelativeTime(item.created_at, t)}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
