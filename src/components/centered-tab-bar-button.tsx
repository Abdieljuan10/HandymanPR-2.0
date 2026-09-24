import { PlatformPressable } from 'expo-router/react-navigation';
import type { ComponentProps } from 'react';

// The tab bar's default button (the same PlatformPressable, see
// BottomTabItem.js) stacks icon + label from the TOP of the item
// (justifyContent: 'flex-start'), which left a band of empty space under
// the labels in the fixed-height floating bar (phone test 2026-09-24).
// Same button, centered vertically -- exact at any font scale, unlike a
// hand-tuned paddingTop.
export function CenteredTabBarButton({ style, ...props }: ComponentProps<typeof PlatformPressable>) {
  return <PlatformPressable {...props} style={[style, { justifyContent: 'center' }]} />;
}
