import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

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
};

export function PuebloList({ selected, onToggle }: PuebloListProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return PUEBLO_SHAPES;
    return PUEBLO_SHAPES.filter((shape) => normalize(shape.name).includes(needle));
  }, [query]);

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
      <FlatList
        showsVerticalScrollIndicator={false}
        data={filtered}
        keyExtractor={(item) => item.slug}
        style={styles.list}
        // Scrolls inside its fixed maxHeight while the picker sits in a
        // scrolling screen (Post Job, the filter panels). Without this,
        // Android gives every drag to the outer ScrollView and this list
        // can't be scrolled at all. No effect on iOS.
        nestedScrollEnabled
        renderItem={({ item }) => {
          const isSelected = selected.has(item.slug);
          return (
            <Pressable
              onPress={() => onToggle(item.slug)}
              style={[
                styles.row,
                { backgroundColor: isSelected ? theme.backgroundSelected : 'transparent' },
              ]}>
              <ThemedText type="default">{item.name}</ThemedText>
              {isSelected && <ThemedText type="smallBold">✓</ThemedText>}
            </Pressable>
          );
        }}
      />
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
