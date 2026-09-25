import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { PUEBLO_MAP_VIEWBOX, PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PuebloMapThumbnailProps = {
  selectedSlugs: ReadonlySet<string>;
  /** Localized display names, for the "See list" expansion -- not read from PUEBLO_SHAPES (that's Spanish-only). */
  names: string[];
};

// Visual pass 2026-09-25, replacing a flat comma-separated pueblo list on
// the public handyman profile (client's report: unreadable past ~15
// selections). Read-only twin of PuebloMap (the picker's own component) --
// same shapes/viewBox, just without onToggle, since this is a display, not
// an input.
export function PuebloMapThumbnail({ selectedSlugs, names }: PuebloMapThumbnailProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.map, { aspectRatio: PUEBLO_MAP_VIEWBOX.width / PUEBLO_MAP_VIEWBOX.height }]}>
        <Svg viewBox={`0 0 ${PUEBLO_MAP_VIEWBOX.width} ${PUEBLO_MAP_VIEWBOX.height}`} width="100%" height="100%">
          {PUEBLO_SHAPES.map((shape) => {
            const isSelected = selectedSlugs.has(shape.slug);
            return (
              <Path
                key={shape.slug}
                d={shape.path}
                fill={isSelected ? theme.tint : theme.mapFill}
                // ALWAYS mapBorder -- see pueblo-map.tsx (the picker's own
                // map) for why matching stroke to fill on selection merges
                // adjacent selected municipios into one seamless blob.
                stroke={theme.mapBorder}
                strokeWidth={1}
              />
            );
          })}
        </Svg>
      </View>

      <Pressable style={styles.footer} onPress={() => setExpanded((v) => !v)}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('handymanPublicProfile.puebloCount', { count: names.length })}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="tint">
          {expanded ? t('handymanPublicProfile.hideList') : t('handymanPublicProfile.seeList')}
        </ThemedText>
      </Pressable>

      {expanded && (
        <ThemedText type="default" style={styles.list}>
          {names.join(', ')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  map: {
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  list: {
    marginTop: Spacing.two,
  },
});
