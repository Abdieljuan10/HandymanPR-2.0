import { StyleSheet, View, type ViewProps } from 'react-native';

import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = ViewProps & {
  /**
   * 'flat' (default): white surface + a hairline border -- the everyday
   * card, and the direct replacement for a `ThemedView type="backgroundElement"`
   * flat-gray panel. 'elevated': same white surface, a soft shadow instead
   * of the border -- reserve for the one thing on a screen that should sit
   * above the rest (e.g. a highlighted job), not every card at once, or
   * everything reads as equally important again.
   */
  variant?: 'flat' | 'elevated';
  /** false to lay out padding yourself, e.g. a card wrapping an edge-to-edge photo. */
  padded?: boolean;
};

// New in the 2026-09-25 design-system pass. Not wired into any screen yet --
// screens that build their own rounded gray panel (ThemedView type=
// "backgroundElement" + borderRadius + padding, repeated ad hoc in most job/
// profile/portfolio screens) are candidates to switch to this in the
// screen-by-screen pass, not this one.
export function Card({ variant = 'flat', padded = true, style, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: theme.background },
        variant === 'flat' ? [styles.flatBorder, { borderColor: theme.border }] : (CardShadow as object),
        padded && styles.padded,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.large,
  },
  flatBorder: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  padded: {
    padding: Spacing.three,
  },
});
