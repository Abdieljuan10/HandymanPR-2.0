import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { PuebloList } from '@/components/pueblo-picker/pueblo-list';
import { PuebloMap } from '@/components/pueblo-picker/pueblo-map';
import { ThemedText } from '@/components/themed-text';
import { PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PuebloFilterViewProps = {
  selected: string[];
  onChange: (slugs: string[]) => void;
  /**
   * Optional: only these pueblos are pickable (the job feed's "only what
   * can produce a result"). Anything already selected stays pickable too,
   * so it can always be removed. Omit to offer all 78 (Browse).
   */
  availableSlugs?: ReadonlySet<string>;
};

const NAME_BY_SLUG = new Map(PUEBLO_SHAPES.map((shape) => [shape.slug, shape.name]));

// Geographic filter body (new 2026-09-26, filter UX redesign): a compact
// Mapa/Lista switch over the EXISTING PuebloMap / PuebloList, plus a row of
// removable chips for what's selected (the map alone is too small to read
// a selection back from). Deliberately no "Select All": in a filter, all
// selected == nothing selected. Not a replacement for PuebloPicker, which
// keeps Select All for the settings/editing flows that use it.
//
// Map and list are two views of the same `selected` prop -- switching
// between them can't lose a selection.
export function PuebloFilterView({ selected, onChange, availableSlugs }: PuebloFilterViewProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [view, setView] = useState<'map' | 'list'>('map');
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const enabledSlugs = useMemo(() => {
    if (!availableSlugs) return undefined;
    return new Set([...availableSlugs, ...selected]);
  }, [availableSlugs, selected]);

  function handleToggle(slug: string) {
    if (selectedSet.has(slug)) {
      onChange(selected.filter((s) => s !== slug));
      return;
    }
    if (enabledSlugs && !enabledSlugs.has(slug)) return;
    onChange([...selected, slug]);
  }

  const selectedSorted = useMemo(
    () => [...selected].sort((a, b) => (NAME_BY_SLUG.get(a) ?? a).localeCompare(NAME_BY_SLUG.get(b) ?? b)),
    [selected]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
        {(['map', 'list'] as const).map((option) => {
          const active = view === option;
          return (
            <Pressable
              key={option}
              onPress={() => setView(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.segment, active && [styles.segmentActive, { backgroundColor: theme.background }]]}>
              <Ionicons
                name={option === 'map' ? 'map-outline' : 'list-outline'}
                size={16}
                color={active ? theme.tint : theme.textSecondary}
              />
              <ThemedText type="smallBold" themeColor={active ? 'tint' : 'textSecondary'}>
                {option === 'map' ? t('common.map') : t('filters.list')}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {view === 'map' ? (
        <PuebloMap selected={selectedSet} onToggle={handleToggle} enabledSlugs={enabledSlugs} />
      ) : (
        <PuebloList selected={selectedSet} onToggle={handleToggle} enabledSlugs={enabledSlugs} />
      )}

      {selectedSorted.length > 0 && (
        <View style={styles.selectedBlock}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('filters.selectedCount', { count: selectedSorted.length })}
          </ThemedText>
          <View style={styles.chipRow}>
            {selectedSorted.map((slug) => (
              <Chip
                key={slug}
                label={NAME_BY_SLUG.get(slug) ?? slug}
                selected
                onPress={() => handleToggle(slug)}
                trailingIcon={<Ionicons name="close" size={14} color={theme.tint} />}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: Spacing.half,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  segmentActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  selectedBlock: {
    gap: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
