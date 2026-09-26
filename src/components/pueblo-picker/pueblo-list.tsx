import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

type PuebloListProps = {
  selected: ReadonlySet<string>;
  onToggle: (slug: string) => void;
  /**
   * Optional, added 2026-09-26 (see PuebloMap's prop of the same name):
   * when set, only these pueblos are listed. The caller includes anything
   * already selected so it stays removable. Omitted: all 78, as before.
   */
  enabledSlugs?: ReadonlySet<string>;
};

export function PuebloList({ selected, onToggle, enabledSlugs }: PuebloListProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const base = enabledSlugs ? PUEBLO_SHAPES.filter((shape) => enabledSlugs.has(shape.slug)) : PUEBLO_SHAPES;
    const needle = normalize(query);
    if (!needle) return base;
    return base.filter((shape) => normalize(shape.name).includes(needle));
  }, [query, enabledSlugs]);

  return (
    <>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('common.searchPueblosPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.search,
          { color: theme.text, backgroundColor: theme.backgroundElement },
        ]}
      />
      {/* A plain ScrollView, not FlatList -- this always sits inside another
          scrolling screen (Post Job, the filter panels, portfolio/edit
          forms), and a FlatList (a VirtualizedList) there prints "should
          never be nested inside plain ScrollViews" and, per that check's own
          condition in VirtualizedList.js (`scrollEnabled !== false`), really
          does lose windowing/functionality -- `nestedScrollEnabled` doesn't
          touch that check at all, it only fixes Android's native touch
          handoff, so it never silenced this. 78 plain text rows costs
          nothing to render unvirtualized, unlike a real data-backed feed. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.list}
        // Still needed on Android so a drag starting on this box scrolls
        // it, not the outer ScrollView.
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled">
        {filtered.map((item) => {
          const isSelected = selected.has(item.slug);
          return (
            <Pressable
              key={item.slug}
              onPress={() => onToggle(item.slug)}
              style={[
                styles.row,
                { backgroundColor: isSelected ? theme.backgroundSelected : 'transparent' },
              ]}>
              <ThemedText type="default">{item.name}</ThemedText>
              {isSelected && <ThemedText type="smallBold">✓</ThemedText>}
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
});
