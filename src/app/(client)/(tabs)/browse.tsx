import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { SearchBar } from '@/components/search-bar';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { useTheme } from '@/hooks/use-theme';
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
  const { session } = useSession();
  const [handymen, setHandymen] = useState<HandymanRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // Promoted (while the promotion is live) first, then verified, then by
  // name -- is_promoted had nowhere to show up before this screen existed.
  // Unchanged by this pass.
  const visibleHandymen = useMemo(() => {
    if (!handymen) return null;
    const query = search.trim().toLowerCase();
    return handymen
      .filter((row) => {
        if (savedOnly && !savedIds.has(row.id)) return false;
        if (query && !row.full_name.toLowerCase().includes(query)) return false;
        if (filterTradeIds.length > 0 && !row.handyman_trades.some((ht) => filterTradeIds.includes(ht.trade_id))) {
          return false;
        }
        if (filterPuebloIds && !row.handyman_pueblos.some((hp) => filterPuebloIds.has(hp.pueblo_id))) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          Number(isPromotedNow(b)) - Number(isPromotedNow(a)) ||
          Number(b.is_verified) - Number(a.is_verified) ||
          a.full_name.localeCompare(b.full_name)
      );
  }, [handymen, search, filterTradeIds, filterPuebloIds, savedOnly, savedIds]);

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
  // Only for the button's own label -- "saved only" has its own quick chip
  // now (below), but the button inside the open panel should still hint
  // that something is active even if that's the only thing on.
  const filtersButtonActive = hasActiveFilters || savedOnly;

  const filtersButton = (
    <PrimaryButton
      label={
        filtersButtonActive
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
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('browseHandymen.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        {/* With filters open, the screen is a plain ScrollView holding the
            panel -- unchanged from before this pass. See the file's own
            history: putting this panel in the FlatList/SectionList header
            broke Android scrolling (nested-VirtualizedList handling on the
            trade picker, nestedScrollEnabled on the pueblo list, and drags
            on the SVG map's pressable shapes being swallowed). */}
        {filtersOpen ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterScroll} keyboardShouldPersistTaps="handled">
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
              label={t('browseHandymen.showResults', { count: visibleHandymen?.length ?? 0 })}
              onPress={() => setFiltersOpen(false)}
            />
          </ScrollView>
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
                  {/* Both open the SAME existing filter panel (setFiltersOpen)
                      -- there are still not two separate pickers, just two
                      more visible entry points into the one that exists. */}
                  <Chip
                    label={`${t('postJob.tradeLabel')} ▾`}
                    selected={filterTradeIds.length > 0}
                    onPress={() => setFiltersOpen(true)}
                  />
                  <Chip
                    label={`${t('postJob.puebloLabel')} ▾`}
                    selected={filterPuebloSlugs.length > 0}
                    onPress={() => setFiltersOpen(true)}
                  />
                  {savedIds.size > 0 && (
                    <Chip
                      icon={
                        <Ionicons
                          name={savedOnly ? 'heart' : 'heart-outline'}
                          size={14}
                          color={savedOnly ? theme.tint : theme.textSecondary}
                        />
                      }
                      label={t('browseHandymen.savedOnly', { count: savedIds.size })}
                      selected={savedOnly}
                      onPress={() => setSavedOnly((prev) => !prev)}
                    />
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {visibleHandymen === null
                  ? t('common.loading')
                  : loadError
                    ? t('common.loadError', { error: loadError })
                    : savedOnly && !hasActiveFilters && !search.trim()
                      ? t('browseHandymen.emptySaved')
                      : hasActiveFilters || search.trim() || savedOnly
                        ? t('browseHandymen.emptyFiltered')
                        : t('browseHandymen.empty')}
              </ThemedText>
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
  filterScroll: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset,
  },
  filterPanel: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
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
