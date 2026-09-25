import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
// The root-export Swipeable is deprecated in favor of this Reanimated-backed
// one (react-native-reanimated is already a dependency here).
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { SwipeAction, SWIPE_OVERSHOOT_FRICTION, SWIPE_SPRING } from '@/components/swipe-action';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type MyBidRow = {
  id: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled';
  created_at: string;
  jobs: {
    id: string;
    title: string;
    status: 'open' | 'hired' | 'pending_completion' | 'completed' | 'cancelled' | 'expired';
    trade_id: number;
    pueblo_id: number;
    pueblos: { name: string } | null;
    trades: { name_es: string; name_en: string } | null;
  } | null;
};

// 'archived' isn't a real bid/job state -- it's a synthetic section built
// from whatever's currently hidden out of the archivable categories below.
type SectionKey = 'accepted' | 'completed' | 'pending' | 'jobCancelled' | 'closed' | 'archived';
type Section = { key: SectionKey; titleKey: string; data: MyBidRow[] };

// Only categories that represent "done, no longer actionable" state can be
// archived -- an active hire or a bid still awaiting a decision shouldn't be
// hideable, the same reasoning as the client side only allowing archive on
// completed jobs.
const ARCHIVABLE_KEYS: SectionKey[] = ['completed', 'jobCancelled', 'closed'];

const SECTION_DEFS: { key: Exclude<SectionKey, 'archived'>; titleKey: string }[] = [
  { key: 'accepted', titleKey: 'myBids.sections.accepted' },
  { key: 'completed', titleKey: 'myBids.sections.completed' },
  { key: 'pending', titleKey: 'myBids.sections.pending' },
  { key: 'jobCancelled', titleKey: 'myBids.sections.jobCancelled' },
  { key: 'closed', titleKey: 'myBids.sections.closed' },
];

const BIDS_SELECT =
  'id, price, status, created_at, jobs!job_id(id, title, status, trade_id, pueblo_id, pueblos(name), trades(name_es, name_en))';

export default function MyBidsScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
  const { session } = useSession();
  const { pueblos } = usePueblos();
  const [bids, setBids] = useState<MyBidRow[] | null>(null);
  const [archivedJobIds, setArchivedJobIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterTradeIds, setFilterTradeIds] = useState<number[]>([]);
  const [filterPuebloSlugs, setFilterPuebloSlugs] = useState<string[]>([]);
  const [filterStatusKeys, setFilterStatusKeys] = useState<SectionKey[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const load = useCallback(async () => {
    if (!session) return;
    // "jobs" is disambiguated to "!job_id" because bids and jobs have two
    // FKs between them (bids.job_id, and jobs.hired_bid_id pointing back) —
    // without the hint, PostgREST can't tell which relationship to embed and
    // errors out, which silently produced an empty list here (the error was
    // never checked, so it looked like "no bids").
    const [{ data, error }, { data: archivesData }] = await Promise.all([
      supabase.from('bids').select(BIDS_SELECT).eq('handyman_id', session.user.id).order('created_at', {
        ascending: false,
      }),
      supabase.from('job_archives').select('job_id').eq('user_id', session.user.id),
    ]);

    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setBids((data as unknown as MyBidRow[] | null) ?? []);
    setArchivedJobIds(new Set((archivesData ?? []).map((row) => row.job_id as string)));
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

  const filterPuebloIds = useMemo(() => {
    if (!pueblos || filterPuebloSlugs.length === 0) return null;
    const slugSet = new Set(filterPuebloSlugs);
    return new Set(pueblos.filter((p) => slugSet.has(p.slug)).map((p) => p.id));
  }, [pueblos, filterPuebloSlugs]);

  const hasActiveFilters = filterTradeIds.length > 0 || filterPuebloSlugs.length > 0 || filterStatusKeys.length > 0;

  const { sections, archivedCount } = useMemo<{ sections: Section[]; archivedCount: number }>(() => {
    if (!bids) return { sections: [], archivedCount: 0 };

    const filtered = bids.filter((bid) => {
      if (!bid.jobs) return false;
      if (filterTradeIds.length > 0 && !filterTradeIds.includes(bid.jobs.trade_id)) return false;
      if (filterPuebloIds && !filterPuebloIds.has(bid.jobs.pueblo_id)) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) =>
      sortOrder === 'newest' ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)
    );

    // A bid whose job was cancelled after being hired isn't "still accepted"
    // from the handyman's point of view — it needs its own category rather
    // than sitting under "Accepted" looking like an active hire. bid.status
    // = 'cancelled' is the ground-truth marker going forward (the job
    // itself reopens to 'open', it doesn't stay 'cancelled'); the job-status
    // check alongside it only still matters for jobs cancelled before this
    // distinction existed, which are stuck at status = 'cancelled' for good.
    const grouped: Record<Exclude<SectionKey, 'archived'>, MyBidRow[]> = {
      jobCancelled: sorted.filter(
        (b) => b.status === 'cancelled' || (b.status === 'accepted' && b.jobs?.status === 'cancelled')
      ),
      completed: sorted.filter((b) => b.status === 'accepted' && b.jobs?.status === 'completed'),
      accepted: sorted.filter(
        (b) => b.status === 'accepted' && b.jobs?.status !== 'cancelled' && b.jobs?.status !== 'completed'
      ),
      pending: sorted.filter((b) => b.status === 'pending'),
      closed: sorted.filter((b) => b.status === 'rejected' || b.status === 'withdrawn'),
    };

    const activeDefs = SECTION_DEFS.filter((def) => filterStatusKeys.length === 0 || filterStatusKeys.includes(def.key));

    const visible: Section[] = [];
    const archivedRows: MyBidRow[] = [];

    for (const def of activeDefs) {
      const rows = grouped[def.key];
      if (!ARCHIVABLE_KEYS.includes(def.key)) {
        if (rows.length > 0) visible.push({ key: def.key, titleKey: def.titleKey, data: rows });
        continue;
      }
      const notArchived = rows.filter((b) => !b.jobs || !archivedJobIds.has(b.jobs.id));
      const archived = rows.filter((b) => b.jobs && archivedJobIds.has(b.jobs.id));
      archivedRows.push(...archived);
      if (notArchived.length > 0) visible.push({ key: def.key, titleKey: def.titleKey, data: notArchived });
    }

    if (showArchived && archivedRows.length > 0) {
      visible.push({ key: 'archived', titleKey: 'myBids.sections.archived', data: archivedRows });
    }

    return { sections: visible, archivedCount: archivedRows.length };
  }, [bids, archivedJobIds, showArchived, filterTradeIds, filterPuebloIds, filterStatusKeys, sortOrder]);

  function toggleStatusFilter(key: SectionKey) {
    setFilterStatusKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('tabs.myBids')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        {/* Was its own permanent banner above this row (client call
            2026-09-25: wasted space, always there whenever anything was
            archived). Now a compact icon sharing the filters row instead.
            Sort order moved into the filter panel below (was a second
            button here too, which crowded this row and forced the icon
            off its vertical center -- see filterPanel for it now). */}
        <View style={styles.controlsRow}>
          <PrimaryButton
            label={
              hasActiveFilters
                ? t('myBids.filtersActive')
                : filtersOpen
                  ? t('myBids.hideFilters')
                  : t('myBids.showFilters')
            }
            variant="secondary"
            style={styles.controlButton}
            onPress={() => setFiltersOpen((prev) => !prev)}
          />
          {archivedCount > 0 && (
            <Pressable
              onPress={() => setShowArchived((prev) => !prev)}
              style={[styles.archiveIconButton, { backgroundColor: showArchived ? theme.tint : theme.backgroundElement }]}
              accessibilityRole="button"
              accessibilityLabel={
                showArchived ? t('myBids.hideArchived') : t('myBids.showArchived', { count: archivedCount })
              }>
              <Ionicons name="archive-outline" size={20} color={showArchived ? '#ffffff' : theme.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* With filters open, the screen becomes a plain ScrollView holding
            the panel -- the same structure Post Job uses for these pickers,
            which scrolls on-device. A fixed panel above the list (the
            previous shape here) doesn't scroll on Android: TradePicker is
            itself a FlatList nested in a FlatList/SectionList, PuebloList is
            an inner scroller Android won't hand drags to without
            nestedScrollEnabled, and drags starting on the SVG map's
            pressable shapes get swallowed. See job feed / Browse for the
            same fix. */}
        {filtersOpen ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterScroll} keyboardShouldPersistTaps="handled">
            <ThemedView type="backgroundElement" style={styles.filterPanel}>
              <ThemedText type="smallBold">{t('postJob.tradeLabel')}</ThemedText>
              <TradePicker mode="multi" selected={filterTradeIds} onChange={setFilterTradeIds} />

              <ThemedText type="smallBold">{t('postJob.puebloLabel')}</ThemedText>
              <PuebloPicker mode="multi" selected={filterPuebloSlugs} onChange={setFilterPuebloSlugs} />

              <ThemedText type="smallBold">{t('myBids.statusLabel')}</ThemedText>
              {SECTION_DEFS.map((def) => {
                const isSelected = filterStatusKeys.includes(def.key);
                return (
                  <Pressable
                    key={def.key}
                    onPress={() => toggleStatusFilter(def.key)}
                    style={[
                      styles.statusRow,
                      { backgroundColor: isSelected ? theme.backgroundSelected : 'transparent' },
                    ]}>
                    <ThemedText type="default">{t(def.titleKey)}</ThemedText>
                    {isSelected && <ThemedText type="smallBold">✓</ThemedText>}
                  </Pressable>
                );
              })}

              {/* Was its own button sharing the top controls row with
                  Filtros (client call 2026-09-25: crowded that row and
                  pushed the archive icon off its vertical center). Not a
                  "filter" -- doesn't hide anything -- so it sits below the
                  filters proper, outside hasActiveFilters/clearFilters. */}
              <ThemedText type="smallBold">{t('myBids.sortLabel')}</ThemedText>
              <Pressable onPress={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))} style={styles.statusRow}>
                <ThemedText type="default">
                  {sortOrder === 'newest' ? t('myBids.sortNewest') : t('myBids.sortOldest')}
                </ThemedText>
                <Ionicons name="swap-vertical-outline" size={18} color={theme.textSecondary} />
              </Pressable>

              {hasActiveFilters && (
                <PrimaryButton
                  label={t('myBids.clearFilters')}
                  variant="secondary"
                  onPress={() => {
                    setFilterTradeIds([]);
                    setFilterPuebloSlugs([]);
                    setFilterStatusKeys([]);
                  }}
                />
              )}
            </ThemedView>
            <PrimaryButton
              label={t('myBids.showResults', { count: sections.reduce((sum, s) => sum + s.data.length, 0) })}
              onPress={() => setFiltersOpen(false)}
            />
          </ScrollView>
        ) : loadError ? (
          <ThemedText type="small" style={styles.error}>
            {t('common.loadError', { error: loadError })}
          </ThemedText>
        ) : bids === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : sections.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary">
            {hasActiveFilters ? t('myBids.emptyFiltered') : t('myBids.empty')}
          </ThemedText>
        ) : (
          <SectionList
            showsVerticalScrollIndicator={false}
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
              if (!item.jobs) return null;
              const tradeName = item.jobs.trades
                ? language === 'en'
                  ? item.jobs.trades.name_en
                  : item.jobs.trades.name_es
                : '';
              const row = (
                <Link href={`/job/${item.jobs.id}`} asChild>
                  <Pressable>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <ThemedText type="default">{item.jobs.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.jobs.pueblos?.name} · {tradeName} · ${item.price.toFixed(2)} ·{' '}
                        {formatRelativeTime(item.created_at, t)}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                </Link>
              );

              if (!ARCHIVABLE_KEYS.includes(section.key) && section.key !== 'archived') {
                return row;
              }

              const jobId = item.jobs.id;
              const isArchived = section.key === 'archived';
              return (
                <Swipeable
                  animationOptions={SWIPE_SPRING}
                  overshootFriction={SWIPE_OVERSHOOT_FRICTION}
                  renderRightActions={(progress, _drag, swipeable) => (
                    <SwipeAction
                      kind={isArchived ? 'unarchive' : 'archive'}
                      label={t(isArchived ? 'myBids.unarchive' : 'myBids.archive')}
                      progress={progress}
                      onPress={() => {
                        swipeable.close();
                        if (isArchived) {
                          handleUnarchive(jobId);
                        } else {
                          handleArchive(jobId);
                        }
                      }}
                    />
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
  archiveIconButton: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  controlButton: {
    flex: 1,
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset,
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
