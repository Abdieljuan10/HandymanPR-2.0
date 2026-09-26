import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
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
// Not built (see TODO.md). Without a real blur, expo-blur's own flat-tint
// fallback (~62% opaque at this intensity) let the content behind show
// through sharply enough to make the tab labels hard to read (phone test
// 2026-09-24), so Android gets a plain, mostly-opaque tint instead, using
// the same colors expo-blur's light/dark tints use.
//
// 2026-09-26: now carries its own borderRadius instead of relying solely on
// the client bar's overflow:'hidden' for its rounded corners -- the client
// layout switched to overflow:'visible' so the new center Post-a-Job button
// can rise above the bar without being clipped, so this can no longer count
// on the parent to round it off. The handyman bar still has overflow:
// 'hidden' (no protruding button there), so this is a harmless no-op for it
// -- same rounded rect either way.
export function FloatingTabBarBackground() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.rounded,
          { backgroundColor: isDark ? 'rgba(25,25,25,0.92)' : 'rgba(249,249,249,0.92)' },
        ]}
      />
    );
  }

  return (
    <BlurView
      intensity={80}
      tint={isDark ? 'dark' : 'light'}
      style={[StyleSheet.absoluteFill, styles.rounded]}
    />
  );
}

const styles = StyleSheet.create({
  rounded: {
    borderRadius: Radius.xlarge,
  },
});
