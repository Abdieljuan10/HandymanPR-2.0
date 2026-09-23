import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { useTheme } from '@/hooks/use-theme';
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

const HANDYMEN_SELECT =
  'id, full_name, avatar_url, is_verified, years_experience, is_promoted, promotion_expires_at, ' +
  'handyman_trades(trade_id, trades(name_es, name_en)), handyman_pueblos(pueblo_id)';

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

  const filterPuebloIds = useMemo(() => {
    if (!pueblos || filterPuebloSlugs.length === 0) return null;
    const slugSet = new Set(filterPuebloSlugs);
    return new Set(pueblos.filter((p) => slugSet.has(p.slug)).map((p) => p.id));
  }, [pueblos, filterPuebloSlugs]);

  // Promoted (while the promotion is live) first, then verified, then by
  // name -- is_promoted had nowhere to show up before this screen existed.
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

  const hasActiveFilters = filterTradeIds.length > 0 || filterPuebloSlugs.length > 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle">{t('browseHandymen.title')}</ThemedText>
          {(savedIds.size > 0 || savedOnly) && (
            <Pressable onPress={() => setSavedOnly((prev) => !prev)}>
              <ThemedText type="small" themeColor="textSecondary">
                {savedOnly ? t('browseHandymen.showAll') : t('browseHandymen.showSaved', { count: savedIds.size })}
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* Search + filters live in the list header, not above the list:
            the pickers don't scroll on their own (built to sit inside Post
            Job's ScrollView), so a fixed panel above the list ran off the
            bottom of the screen with no way to reach the rest of the trades
            or the pueblo section. Passed as an element, not a component, so
            the search TextInput keeps focus across re-renders. */}
        <FlatList
          data={visibleHandymen ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('browseHandymen.searchPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                autoCorrect={false}
                style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />

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
            const badges = [
              isPromotedNow(item) ? t('browseHandymen.featured') : null,
              item.is_verified ? t('handymanPublicProfile.verified') : null,
            ].filter(Boolean);
            return (
              <Link href={`/handyman/${item.id}`} asChild>
                <Pressable>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.background }]}>
                        <ThemedText type="smallBold" themeColor="textSecondary">
                          {item.full_name.trim().charAt(0).toUpperCase() || '?'}
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.cardText}>
                      <View style={styles.nameRow}>
                        <ThemedText type="default" style={styles.name}>
                          {item.full_name}
                        </ThemedText>
                        {savedIds.has(item.id) && (
                          <Ionicons
                            name="heart"
                            size={16}
                            color="#d64545"
                            accessibilityLabel={t('browseHandymen.savedBadge')}
                          />
                        )}
                      </View>
                      {badges.length > 0 && (
                        <ThemedText type="small" themeColor="tint">
                          {badges.join(' · ')}
                        </ThemedText>
                      )}
                      {tradeNames.length > 0 && (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {tradeNames}
                        </ThemedText>
                      )}
                      <ThemedText type="small" themeColor="textSecondary">
                        {[
                          t('browseHandymen.puebloCount', { count: item.handyman_pueblos.length }),
                          item.years_experience !== null
                            ? t('handymanPublicProfile.yearsExperience', { count: item.years_experience })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>
                  </ThemedView>
                </Pressable>
              </Link>
            );
          }}
        />
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    flexShrink: 1,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  search: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
});
