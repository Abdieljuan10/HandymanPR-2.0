import { BlurView } from 'expo-blur';
import { Platform, StyleSheet } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Visual pass 2026-09-24, option "Nav B -- Floating Translucent". Renders
// as the Tabs navigator's tabBarBackground, absolutely filling the same
// rounded, overflow:hidden container the tab bar itself is styled with
// (BottomTabBar.js renders it as a StyleSheet.absoluteFill sibling inside
// that container) -- so it gets the bar's rounded corners for free, no
// borderRadius needed here.
//
// iOS/web: a real live blur, exactly like the approved mockup.
// Android: expo-blur's Android path has no OS-level "blur whatever's
// behind me" primitive -- it needs a BlurTargetView wired around each tab
// screen's own content via a shared ref, threaded through this navigator.
// Not built yet (see TODO.md) -- `blurMethod="none"` here is one of
// expo-blur's own supported values for exactly this: not attempted, so
// Android renders this as a flat translucent tint at the same
// intensity/tint instead of silently blank or erroring. Still floating,
// still translucent, just not blurred-through on Android today.
export function FloatingTabBarBackground() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <BlurView
      intensity={80}
      tint={isDark ? 'dark' : 'light'}
      blurMethod={Platform.OS === 'android' ? 'none' : undefined}
      style={StyleSheet.absoluteFill}
    />
  );
}
