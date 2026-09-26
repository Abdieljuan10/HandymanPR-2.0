import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PUEBLO_MAP_VIEWBOX, PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { useTheme } from '@/hooks/use-theme';

type PuebloMapProps = {
  selected: ReadonlySet<string>;
  onToggle: (slug: string) => void;
  /**
   * Optional, added 2026-09-26 for the handyman job-feed filter (only
   * pueblos that can produce a result are pickable). When set, shapes
   * outside it (and not selected) are drawn plain and aren't tappable, and
   * pickable-but-unselected shapes get a light tint wash so they read as
   * options. Omitted (every existing caller): rendering is unchanged.
   */
  enabledSlugs?: ReadonlySet<string>;
};

export function PuebloMap({ selected, onToggle, enabledSlugs }: PuebloMapProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { aspectRatio: PUEBLO_MAP_VIEWBOX.width / PUEBLO_MAP_VIEWBOX.height },
      ]}>
      <Svg
        viewBox={`0 0 ${PUEBLO_MAP_VIEWBOX.width} ${PUEBLO_MAP_VIEWBOX.height}`}
        width="100%"
        height="100%">
        {PUEBLO_SHAPES.map((shape) => {
          const isSelected = selected.has(shape.slug);
          const isEnabled = !enabledSlugs || isSelected || enabledSlugs.has(shape.slug);
          const fill = isSelected
            ? theme.tint
            : enabledSlugs && isEnabled
              ? theme.tintBackground
              : theme.mapFill;
          return (
            <Path
              key={shape.slug}
              d={shape.path}
              fill={fill}
              // ALWAYS mapBorder, never theme.tint -- the contrast fix
              // earlier today (20260924, mapFill/mapBorder tokens) matched
              // stroke to fill when selected, which reads fine for one
              // isolated selected pueblo but merges neighboring selected
              // ones into a single blob with no visible seam between them
              // (client report: 68 of 78 selected showing as one shape).
              // A stroke distinct from the fill is what actually draws a
              // boundary between two adjacently-filled shapes -- same
              // fill as its neighbor is exactly the case this needs to
              // keep drawing one.
              stroke={theme.mapBorder}
              strokeWidth={1.25}
              onPress={isEnabled ? () => onToggle(shape.slug) : undefined}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
