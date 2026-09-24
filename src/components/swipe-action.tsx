import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shared by every swipe-to-reveal row (client Home, My Bids, both Messages
// lists). ReanimatedSwipeable's own default spring is mass 2 / damping 1000
// / stiffness 700 -- so overdamped it reads as a linear slide. This one
// settles with a small, quick overshoot.
export const SWIPE_SPRING = { mass: 0.8, damping: 18, stiffness: 180 } as const;
// Dragging past the actions' width feels rubbery instead of 1:1.
export const SWIPE_OVERSHOOT_FRICTION = 8;

type SwipeActionKind = 'archive' | 'unarchive' | 'hide';

const ICONS: Record<SwipeActionKind, ComponentProps<typeof Ionicons>['name']> = {
  archive: 'archive-outline',
  unarchive: 'arrow-undo-outline',
  hide: 'eye-off-outline',
};

type SwipeActionProps = {
  kind: SwipeActionKind;
  label: string;
  onPress: () => void;
  /** The `progress` renderRightActions receives: 0 closed, 1 fully open. */
  progress: SharedValue<number>;
  /** Position among the revealed actions, left to right -- later ones pop in slightly later. */
  index?: number;
};

export function SwipeAction({ kind, label, onPress, progress, index = 0 }: SwipeActionProps) {
  const theme = useTheme();
  const backgroundColor =
    kind === 'archive' ? theme.tint : kind === 'unarchive' ? '#6b7280' : '#d64545';

  const start = 0.15 * index;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [start, start + 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(progress.value, [start, start + 0.8], [0.7, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View style={[styles.action, { backgroundColor }, animatedStyle]}>
      <Pressable
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <Ionicons name={ICONS[kind]} size={22} color="#ffffff" />
        <ThemedText type="smallBold" style={styles.label} numberOfLines={1}>
          {label}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 88,
    marginBottom: Spacing.two,
    marginLeft: Spacing.one,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  pressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: '#ffffff',
    fontSize: 12,
  },
});
