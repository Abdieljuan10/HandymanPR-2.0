import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * Optional leading icon. Added 2026-09-26 for Browse's "Saved" chip
   * (a heart icon before the label) -- purely additive, the existing
   * Client Home caller never passes this and is unaffected.
   */
  icon?: ReactNode;
  /**
   * Optional icon after the label -- added 2026-09-26 for the filter chips'
   * dropdown chevron ("Oficio ▾"). Additive like `icon`; callers that don't
   * pass it render exactly as before.
   */
  trailingIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Standardized filter/tag pill -- trades, pueblos, bid-status filters, etc.
// New in the 2026-09-25 design-system pass. Deliberately has no idea what
// it's filtering -- that logic stays exactly where it is today in each
// screen (e.g. my-bids.tsx's own status-filter state); this only replaces
// the Pressable + manual backgroundColor row those screens currently
// hand-roll for the same purpose.
export function Chip({ label, selected = false, onPress, disabled, icon, trailingIcon, style }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected, disabled } : undefined}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.tintBackground : theme.backgroundElement,
          borderColor: selected ? theme.tint : theme.border,
        },
        pressed && onPress && styles.pressed,
        style,
      ]}>
      {icon}
      <ThemedText type="smallBold" themeColor={selected ? 'tint' : 'textSecondary'}>
        {label}
      </ThemedText>
      {trailingIcon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
