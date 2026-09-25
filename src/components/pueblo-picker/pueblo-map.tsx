import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PUEBLO_MAP_VIEWBOX, PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { useTheme } from '@/hooks/use-theme';

type PuebloMapProps = {
  selected: ReadonlySet<string>;
  onToggle: (slug: string) => void;
};

export function PuebloMap({ selected, onToggle }: PuebloMapProps) {
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
          return (
            <Path
              key={shape.slug}
              d={shape.path}
              fill={isSelected ? theme.tint : theme.mapFill}
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
              onPress={() => onToggle(shape.slug)}
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
