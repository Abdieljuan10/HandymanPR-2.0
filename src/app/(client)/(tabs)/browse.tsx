import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { FilterChip } from '@/components/filters/filter-chip';
import { FilterViewShell } from '@/components/filters/filter-view-shell';
import { PuebloFilterView } from '@/components/filters/pueblo-filter-view';
import { TradeFilterGrid } from '@/components/filters/trade-filter-grid';
import { EmptyState } from '@/components/empty-state';
import { LoadingState } from '@/components/loading-state';
import { SearchBar } from '@/components/search-bar';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { useTheme } from '@/hooks/use-theme';
import { useTrades } from '@/hooks/use-trades';
import { saveHandyman, unsaveHandyman } from '@/lib/saved-handymen';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';

type HandymanRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  years_experience: number | null;
  is_promoted: boolean;
  promotion_expires_at: string | null;
  handyman_trades: { trade_id: number; trades: { name_es: string; name_en: string } | null }[];
  handyman_pueblos: { pueblo_id: number }[];
};

type HandymanSection = { key: 'featured' | 'handymen'; titleKey: string; data: HandymanRow[] };

const HANDYMEN_SELECT =
  'id, full_name, avatar_url, is_verified, years_experience, is_promoted, promotion_expires_at, ' +
  'handyman_trades(trade_id, trades(name_es, name_en)), handyman_pueblos(pueblo_id)';

// Card avatar + section-partition size -- same value used in both places so
// "Featured" cards and regular cards read as one consistent list.
const AVATAR_SIZE = 68;

// Pueblo chip's selected names -- same slug -> name source PuebloFilterView
// uses for its own selected chips.
const PUEBLO_NAME_BY_SLUG = new Map(PUEBLO_SHAPES.map((shape) => [shape.slug, shape.name]));

function isPromotedNow(row: HandymanRow): boolean {
  return row.is_promoted && (!row.promotion_expires_at || Date.parse(row.promotion_expires_at) > Date.now());
}

// Filtering happens client-side over the full list, same as the handyman
// job feed -- fine at pilot scale (one island, a handful of handymen), and
// it keeps multi-trade/multi-pueblo "match any" filters trivial. Move it
// server-side once the list is big enough for the payload to matter.
export default function BrowseHandymenScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { language } = useLanguage();
  const { pueblos } = usePueblos();
  // The same trades lookup TradePicker already runs itself -- needed here
  // for the Oficio chip's selected names and the trade grid (all trades,
  // with slugs for ServiceIcon).
  const { trades, error: tradesError } = useTrades();
  const { session } = useSession();
  const [handymen, setHandymen] = useState<HandymanRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Which focused filter view (2026-09-26) is replacing the list, if any.
  // Only the view's open/closed state -- the selections below live on
  // independently of it, so closing/reopening never loses them.
  const [openFilter, setOpenFilter] = useState<'trade' | 'pueblo' | null>(null);
  const [filterTradeIds, setFilterTradeIds] = useState<number[]>([]);
  const [filterPuebloSlugs, setFilterPuebloSlugs] = useState<string[]>([]);
  // Saved handymen (client_saved_handymen) -- a private bookmark list.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedOnly, setSavedOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data, error }, { data: savedData, error: savedError }] = await Promise.all([
      supabase.from('handyman_profiles').select(HANDYMEN_SELECT),
      supabase.from('client_saved_handymen').select('handyman_id').eq('client_id', session.user.id),
    ]);
    // Fail-soft on its own: a broken saved list must not hide Browse itself.
    if (savedError) console.error('Failed to load saved handymen:', savedError.message);
    setSavedIds(new Set((savedData ?? []).map((row) => row.handyman_id as string)));
    if (error) {
      console.error('Failed to load handymen:', error.message);
      setLoadError(error.message);
      setHandymen([]);
      return;
    }
    setLoadError(null);
    setHandymen((data as unknown as HandymanRow[] | null) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const closeFilter = useCallback(() => setOpenFilter(null), []);

  // Leaving Browse (switching tabs, etc.) closes whichever focused filter
  // view is open, so coming back lands on the results, not a filter screen
  // left open behind another tab. Cleanup runs on blur; the selections
  // themselves are kept.
  useFocusEffect(
    useCallback(() => {
      return () => setOpenFilter(null);
    }, [])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Same save/unsave functions the (locked) Handyman Profile screen already
  // uses -- same table, same optimistic-update-then-rollback pattern. Browse
  // previously only showed a read-only "already saved" heart; this wires the
  // existing lib functions to a tap here too, it doesn't add new backend
  // behavior.
  async function toggleSaved(handymanId: string) {
    if (!session) return;
    const next = !savedIds.has(handymanId);
    setSavedIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(handymanId);
      else updated.delete(handymanId);
      return updated;
    });
    const { error } = next
      ? await saveHandyman(session.user.id, handymanId)
      : await unsaveHandyman(session.user.id, handymanId);
    if (error) {
      console.error('Failed to update saved handyman:', error);
      setSavedIds((prev) => {
        const updated = new Set(prev);
        if (next) updated.delete(handymanId);
        else updated.add(handymanId);
        return updated;
      });
    }
  }

  const filterPuebloIds = useMemo(() => {
    if (!pueblos || filterPuebloSlugs.length === 0) return null;
    const slugSet = new Set(filterPuebloSlugs);
    return new Set(pueblos.filter((p) => slugSet.has(p.slug)).map((p) => p.id));
  }, [pueblos, filterPuebloSlugs]);

  // visibleHandymen's checks, split into pieces (2026-09-26, focused
  // Oficio/Pueblo filter views) so each view's counts/options can apply
  // every filter EXCEPT its own, reusing the exact same checks instead of
  // a second copy. Same checks, same AND semantics as before:
  // visibleHandymen = saved/search AND trade AND pueblo.
  const matchesSavedAndSearch = useCallback(
    (row: HandymanRow) => {
      const query = search.trim().toLowerCase();
      if (savedOnly && !savedIds.has(row.id)) return false;
      if (query && !row.full_name.toLowerCase().includes(query)) return false;
      return true;
    },
    [search, savedOnly, savedIds]
  );

  const matchesTradeFilter = useCallback(
    (row: HandymanRow) =>
      filterTradeIds.length === 0 || row.handyman_trades.some((ht) => filterTradeIds.includes(ht.trade_id)),
    [filterTradeIds]
  );

  const matchesPuebloFilter = useCallback(
    (row: HandymanRow) => !filterPuebloIds || row.handyman_pueblos.some((hp) => filterPuebloIds.has(hp.pueblo_id)),
    [filterPuebloIds]
  );

  // Promoted (while the promotion is live) first, then verified, then by
  // name -- is_promoted had nowhere to show up before this screen existed.
  // Unchanged by this pass.
  const visibleHandymen = useMemo(() => {
    if (!handymen) return null;
    return handymen
      .filter((row) => matchesSavedAndSearch(row) && matchesTradeFilter(row) && matchesPuebloFilter(row))
      .sort(
        (a, b) =>
          Number(isPromotedNow(b)) - Number(isPromotedNow(a)) ||
          Number(b.is_verified) - Number(a.is_verified) ||
          a.full_name.localeCompare(b.full_name)
      );
  }, [handymen, matchesSavedAndSearch, matchesTradeFilter, matchesPuebloFilter]);

  // Oficio tile counts: how many handymen each trade would show under the
  // OTHER active filters (search / pueblo / saved-only) -- the usual facet
  // count, so a tile's number is what you'd get with that trade alone
  // selected. From the already-loaded list; no extra query.
  const tradeCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!handymen) return counts;
    for (const row of handymen) {
      if (!matchesSavedAndSearch(row) || !matchesPuebloFilter(row)) continue;
      for (const tradeId of new Set(row.handyman_trades.map((ht) => ht.trade_id))) {
        counts.set(tradeId, (counts.get(tradeId) ?? 0) + 1);
      }
    }
    return counts;
  }, [handymen, matchesSavedAndSearch, matchesPuebloFilter]);

  // Pueblo view options: pueblos served by at least one handyman under the
  // OTHER active filters (search / trade / saved-only) -- same facet idea as
  // tradeCounts, so every pickable pueblo produces a result. Selected
  // pueblos are always added back inside PuebloFilterView, so a selection
  // that drops to zero stays visible and removable. From the already-loaded
  // list; no extra query. undefined until pueblos load (the view shows a
  // loading state until then).
  const availablePuebloSlugs = useMemo(() => {
    if (!handymen || !pueblos) return undefined;
    const slugById = new Map(pueblos.map((p) => [p.id, p.slug]));
    const slugs = new Set<string>();
    for (const row of handymen) {
      if (!matchesSavedAndSearch(row) || !matchesTradeFilter(row)) continue;
      for (const hp of row.handyman_pueblos) {
        const slug = slugById.get(hp.pueblo_id);
        if (slug) slugs.add(slug);
      }
    }
    return slugs;
  }, [handymen, pueblos, matchesSavedAndSearch, matchesTradeFilter]);

  const selectedPuebloNames = useMemo(
    () => filterPuebloSlugs.map((slug) => PUEBLO_NAME_BY_SLUG.get(slug) ?? slug),
    [filterPuebloSlugs]
  );

  const selectedTradeNames = useMemo(() => {
    if (!trades) return [];
    const byId = new Map(trades.map((trade) => [trade.id, trade.name]));
    return filterTradeIds.map((id) => byId.get(id)).filter((name): name is string => !!name);
  }, [trades, filterTradeIds]);

  // New: purely a visual partition of the SAME already-sorted list above --
  // isPromotedNow() and the sort comparator are untouched, so which
  // handymen count as "featured" and their relative order within each
  // group are exactly what they were before this pass.
  const sections = useMemo<HandymanSection[]>(() => {
    if (!visibleHandymen) return [];
    const featured = visibleHandymen.filter((h) => isPromotedNow(h));
    const rest = visibleHandymen.filter((h) => !isPromotedNow(h));
    const list: HandymanSection[] = [];
    if (featured.length > 0) list.push({ key: 'featured', titleKey: 'browseHandymen.featured', data: featured });
    if (rest.length > 0) list.push({ key: 'handymen', titleKey: 'browseHandymen.allHandymen', data: rest });
    return list;
  }, [visibleHandymen]);

  const hasActiveFilters = filterTradeIds.length > 0 || filterPuebloSlugs.length > 0;
  const resultsLabel = t('browseHandymen.showResults', { count: visibleHandymen?.length ?? 0 });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('browseHandymen.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        {/* A focused filter view REPLACES the list while open (plain
            ScrollView inside FilterViewShell) -- never inside the
            SectionList. See the file's own history: putting filter pickers
            in the FlatList/SectionList header broke Android scrolling
            (nested-VirtualizedList handling, nestedScrollEnabled on the
            pueblo list, drags on the SVG map's pressable shapes). The old
            combined Oficio+Pueblo panel was removed 2026-09-26 once both
            chips had their own focused views. */}
        {openFilter === 'trade' ? (
          <FilterViewShell
            title={t('postJob.tradeLabel')}
            onClose={closeFilter}
            onClear={() => setFilterTradeIds([])}
            canClear={filterTradeIds.length > 0}
            ctaLabel={resultsLabel}
            onCtaPress={closeFilter}>
            {tradesError ? (
              <ThemedText type="small" themeColor="error">
                {t('common.loadError', { error: tradesError })}
              </ThemedText>
            ) : !trades ? (
              <LoadingState label={t('common.loading')} fullScreen={false} />
            ) : (
              <TradeFilterGrid
                trades={trades}
                selected={filterTradeIds}
                onChange={setFilterTradeIds}
                counts={tradeCounts}
                countLabel={(count) => t('browseHandymen.tradeCount', { count })}
              />
            )}
          </FilterViewShell>
        ) : openFilter === 'pueblo' ? (
          <FilterViewShell
            title={t('postJob.puebloLabel')}
            onClose={closeFilter}
            onClear={() => setFilterPuebloSlugs([])}
            canClear={filterPuebloSlugs.length > 0}
            ctaLabel={resultsLabel}
            onCtaPress={closeFilter}>
            {availablePuebloSlugs === undefined ? (
              <LoadingState label={t('common.loading')} fullScreen={false} />
            ) : (
              <PuebloFilterView
                selected={filterPuebloSlugs}
                onChange={setFilterPuebloSlugs}
                availableSlugs={availablePuebloSlugs}
              />
            )}
          </FilterViewShell>
        ) : (
          <SectionList
            showsVerticalScrollIndicator={false}
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            renderSectionHeader={({ section }) => <SectionHeader title={t(section.titleKey)} />}
            ListHeaderComponent={
              <View style={styles.header}>
                <SearchBar
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('browseHandymen.searchPlaceholder')}
                  autoCorrect={false}
                  onClear={() => setSearch('')}
                />

                <View style={styles.filterChipsRow}>
                  {/* Each opens only its own focused view (2026-09-26). */}
                  <FilterChip
                    label={t('postJob.tradeLabel')}
                    selectedNames={selectedTradeNames}
                    onPress={() => setOpenFilter('trade')}
                  />
                  <FilterChip
                    label={t('postJob.puebloLabel')}
                    selectedNames={selectedPuebloNames}
                    onPress={() => setOpenFilter('pueblo')}
                  />
                  {/* Direct toggle, no focused view -- so the plain Chip
                      (the same one FilterChip wraps, same height/type),
                      not FilterChip, whose chevron means "opens a view".
                      ALWAYS rendered (2026-09-26): it used to hide when
                      savedIds was empty, so unsaving your last saved
                      handyman while this was on left savedOnly stuck true
                      with no control to turn it off (the known "Saved
                      dead end"). */}
                  <Chip
                    icon={
                      <Ionicons
                        name={savedOnly ? 'heart' : 'heart-outline'}
                        size={14}
                        color={savedOnly ? theme.tint : theme.textSecondary}
                      />
                    }
                    label={t('browseHandymen.savedFilter')}
                    selected={savedOnly}
                    onPress={() => setSavedOnly((prev) => !prev)}
                  />
                </View>
              </View>
            }
            ListEmptyComponent={
              // Guardados on and nothing to show: the shared EmptyState. No
              // saved handymen at all (incl. right after unsaving the last
              // one) vs. saved ones exist but search/Oficio/Pueblo exclude
              // them. The chips stay above in the list header either way,
              // so Guardados can always be tapped off from here.
              visibleHandymen !== null && !loadError && savedOnly ? (
                savedIds.size === 0 ? (
                  <EmptyState
                    icon="heart-outline"
                    title={t('browseHandymen.savedEmptyTitle')}
                    description={t('browseHandymen.savedEmptyDescription')}
                  />
                ) : (
                  <EmptyState
                    icon="heart-outline"
                    title={t('browseHandymen.savedNoMatchTitle')}
                    description={t('browseHandymen.emptyFiltered')}
                  />
                )
              ) : (
                <ThemedText type="default" themeColor="textSecondary">
                  {visibleHandymen === null
                    ? t('common.loading')
                    : loadError
                      ? t('common.loadError', { error: loadError })
                      : hasActiveFilters || search.trim()
                        ? t('browseHandymen.emptyFiltered')
                        : t('browseHandymen.empty')}
                </ThemedText>
              )
            }
            renderItem={({ item }) => {
              const tradeNames = item.handyman_trades
                .map((ht) => (ht.trades ? (language === 'en' ? ht.trades.name_en : ht.trades.name_es) : null))
                .filter((name): name is string => !!name)
                .join(', ');
              const saved = savedIds.has(item.id);
              const promoted = isPromotedNow(item);

              return (
                <Link href={`/handyman/${item.id}`} asChild>
                  <Pressable>
                    <Card style={styles.card}>
                      {promoted && (
                        <View style={styles.featuredRow}>
                          <Ionicons name="star" size={12} color={theme.accent} />
                          <ThemedText type="metadata" themeColor="accent" style={styles.featuredLabel}>
                            {t('browseHandymen.featured')}
                          </ThemedText>
                        </View>
                      )}
                      <View style={styles.cardRow}>
                        <Avatar uri={item.avatar_url} name={item.full_name} size={AVATAR_SIZE} />
                        <View style={styles.cardText}>
                          <View style={styles.nameRow}>
                            <ThemedText type="cardTitle" style={styles.name} numberOfLines={1}>
                              {item.full_name}
                            </ThemedText>
                            {item.is_verified && (
                              <Ionicons name="shield-checkmark" size={13} color={theme.accent} />
                            )}
                          </View>
                          {tradeNames.length > 0 && (
                            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                              {tradeNames}
                            </ThemedText>
                          )}
                          <View style={styles.metaRow}>
                            {item.years_experience !== null && (
                              <View style={styles.metaItem}>
                                <Ionicons name="briefcase-outline" size={12} color={theme.textSecondary} />
                                <ThemedText type="small" themeColor="textSecondary">
                                  {t('handymanPublicProfile.yearsExperience', { count: item.years_experience })}
                                </ThemedText>
                              </View>
                            )}
                            {item.years_experience !== null && item.handyman_pueblos.length > 0 && (
                              <View style={[styles.metaDot, { backgroundColor: theme.border }]} />
                            )}
                            {item.handyman_pueblos.length > 0 && (
                              <View style={styles.metaItem}>
                                <Ionicons name="location-outline" size={12} color={theme.textSecondary} />
                                <ThemedText type="small" themeColor="textSecondary">
                                  {t('browseHandymen.puebloCount', { count: item.handyman_pueblos.length })}
                                </ThemedText>
                              </View>
                            )}
                          </View>
                        </View>
                        <Pressable
                          onPress={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleSaved(item.id);
                          }}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={
                            saved ? t('handymanPublicProfile.unsave') : t('handymanPublicProfile.save')
                          }>
                          <Ionicons
                            name={saved ? 'heart' : 'heart-outline'}
                            size={22}
                            color={saved ? theme.error : theme.textSecondary}
                          />
                        </Pressable>
                      </View>
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
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset,
  },
  card: {
    gap: Spacing.two,
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  featuredLabel: {
    fontWeight: '700',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
