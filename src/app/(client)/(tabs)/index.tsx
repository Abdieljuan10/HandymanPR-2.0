import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
// The root-export Swipeable is deprecated in favor of this Reanimated-backed
// one (react-native-reanimated is already a dependency here).
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobStatus = 'open' | 'hired' | 'pending_completion' | 'completed' | 'cancelled' | 'expired';

type ClientJobRow = {
  id: string;
  title: string;
  status: JobStatus;
  created_at: string;
  pueblos: { name: string } | null;
};

type SectionKey = 'pendingCompletion' | 'hired' | 'open' | 'completed' | 'expired' | 'cancelled' | 'archived';
type Section = { key: SectionKey; titleKey: string; data: ClientJobRow[] };

const STATUS_COLORS: Record<Exclude<JobStatus, 'open'>, string> = {
  hired: '#2e9e5b',
  pending_completion: '#e0a72e',
  completed: Colors.light.tint,
  cancelled: '#d64545',
  expired: '#9a9a9a',
};

const JOBS_SELECT = 'id, title, status, created_at, pueblos(name)';

export default function ClientHomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useSession();
  const [jobs, setJobs] = useState<ClientJobRow[] | null>(null);
  // null = the count query failed -- the "N bids" line is left off rather
  // than showing a false "0 bids".
  const [bidCounts, setBidCounts] = useState<Record<string, number> | null>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  // Archiving only ever applies to completed jobs here (see
  // 20260930010000_job_archives.sql) -- cancelled/expired jobs already have
  // a real delete option, and the client's own call was that completed jobs
  // stay permanently undeletable (their reviews belong to whoever received
  // them), so archive is the "get it out of my list" option for those.
  const [archivedJobIds, setArchivedJobIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;

    const [{ data, error }, { data: archivesData, error: archivesError }] = await Promise.all([
      supabase.from('jobs').select(JOBS_SELECT).eq('client_id', session.user.id).order('created_at', {
        ascending: false,
      }),
      supabase.from('job_archives').select('job_id').eq('user_id', session.user.id),
    ]);

    // A failed load must not read as "you haven't posted a job yet".
    if (error) {
      console.error('Failed to load jobs:', error.message);
      setLoadError(error.message);
      setJobs([]);
      return;
    }
    setLoadError(null);
    if (archivesError) console.error('Failed to load archived jobs:', archivesError.message);

    const jobsData = (data as unknown as ClientJobRow[] | null) ?? [];
    setJobs(jobsData);
    setArchivedJobIds(new Set((archivesData ?? []).map((row) => row.job_id as string)));

    const openJobIds = jobsData.filter((job) => job.status === 'open').map((job) => job.id);
    if (openJobIds.length === 0) {
      setBidCounts({});
      return;
    }

    const { data: bidsData, error: bidsError } = await supabase
      .from('bids')
      .select('job_id')
      .in('job_id', openJobIds)
      .neq('status', 'withdrawn');

    // Unknown, not zero: a failed count leaves the line off rather than
    // telling the client nobody has bid.
    if (bidsError) {
      console.error('Failed to load bid counts:', bidsError.message);
      setBidCounts(null);
      return;
    }

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

  const { sections, archivedCount } = useMemo<{ sections: Section[]; archivedCount: number }>(() => {
    if (!jobs) return { sections: [], archivedCount: 0 };
    const hired = jobs.filter((job) => job.status === 'hired');
    const pendingCompletion = jobs.filter((job) => job.status === 'pending_completion');
    const open = jobs.filter((job) => job.status === 'open');
    const completed = jobs.filter((job) => job.status === 'completed' && !archivedJobIds.has(job.id));
    const archived = jobs.filter((job) => job.status === 'completed' && archivedJobIds.has(job.id));
    const cancelled = jobs.filter((job) => job.status === 'cancelled');
    const expired = jobs.filter((job) => job.status === 'expired');

    const allSections: Section[] = [
      { key: 'pendingCompletion', titleKey: 'clientHome.sections.pendingCompletion', data: pendingCompletion },
      { key: 'hired', titleKey: 'clientHome.sections.hired', data: hired },
      { key: 'open', titleKey: 'clientHome.sections.open', data: open },
      { key: 'completed', titleKey: 'clientHome.sections.completed', data: completed },
      { key: 'expired', titleKey: 'clientHome.sections.expired', data: expired },
      { key: 'cancelled', titleKey: 'clientHome.sections.cancelled', data: cancelled },
    ];
    const list = allSections.filter((section) => section.data.length > 0);

    if (showArchived && archived.length > 0) {
      list.push({ key: 'archived', titleKey: 'clientHome.sections.archived', data: archived });
    }

    return { sections: list, archivedCount: archived.length };
  }, [jobs, archivedJobIds, showArchived]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle">{t('clientHome.title')}</ThemedText>
          {archivedCount > 0 && (
            <Pressable onPress={() => setShowArchived((prev) => !prev)}>
              <ThemedText type="small" themeColor="textSecondary">
                {showArchived ? t('clientHome.hideArchived') : t('clientHome.showArchived', { count: archivedCount })}
              </ThemedText>
            </Pressable>
          )}
        </View>

        {jobs === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : sections.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary">
            {loadError !== null ? t('common.loadError', { error: loadError }) : t('clientHome.empty')}
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
            renderItem={({ item, section }) => {
              const dotColor = item.status === 'open' ? theme.textSecondary : STATUS_COLORS[item.status];
              const row = (
                <Link href={`/job/${item.id}`} asChild>
                  <Pressable>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <View style={styles.itemTitleRow}>
                        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                        <ThemedText type="default">{item.title}</ThemedText>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.pueblos?.name} · {t(`jobStatus.${item.status}`)}
                        {item.status === 'open' && bidCounts
                          ? ` · ${t('clientHome.bidCount', { count: bidCounts[item.id] ?? 0 })}`
                          : ''}{' '}
                        · {formatRelativeTime(item.created_at, t)}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                </Link>
              );

              if (section.key !== 'completed' && section.key !== 'archived') {
                return row;
              }

              const isArchived = section.key === 'archived';
              return (
                <Swipeable
                  renderRightActions={(_progress, _drag, swipeable) => (
                    <Pressable
                      style={[styles.swipeAction, isArchived ? styles.unarchiveAction : styles.archiveAction]}
                      onPress={() => {
                        swipeable.close();
                        if (isArchived) {
                          handleUnarchive(item.id);
                        } else {
                          handleArchive(item.id);
                        }
                      }}>
                      <ThemedText type="smallBold" style={styles.swipeActionText}>
                        {t(isArchived ? 'clientHome.unarchive' : 'clientHome.archive')}
                      </ThemedText>
                    </Pressable>
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginBottom: Spacing.two,
    borderRadius: Spacing.two,
  },
  archiveAction: {
    backgroundColor: Colors.light.tint,
  },
  unarchiveAction: {
    backgroundColor: '#6b7280',
  },
  swipeActionText: {
    color: '#ffffff',
  },
});
