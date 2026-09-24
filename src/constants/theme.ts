/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Brand palette ("Isla"): teal reads as trustworthy without the generic
// trade-app blue, coral is the sparing accent. Dark-mode tint is a lighter
// step than light-mode's so it still clears WCAG AA contrast on a pure
// black background (the flat light-mode teal falls just under 4.5:1 there).
export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    tint: '#0E7A82',
    accent: '#E8593F',
    // Pueblo map only (PuebloMap.tsx) -- deliberately NOT background or
    // backgroundElement. Those were the original bug: an unselected
    // municipio's fill was backgroundElement and its border stroke was
    // background, so wherever the map sat inside a backgroundElement panel
    // (every filter panel), fill == container and the border blended into
    // the page by definition. Own literals here, reused nowhere else, so
    // they can never again collide with whatever container the map is in.
    mapFill: '#ffffff',
    mapBorder: '#C7CBD1',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    tint: '#22A0A8',
    accent: '#F16B50',
    // See light.mapFill/mapBorder above. Not verified on a physical dark-mode
    // screen -- the approved mockup was light-mode only.
    mapFill: '#2E3135',
    mapBorder: '#4A4E55',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Extra bottom padding every top-level tab screen's scrollable content needs
// so its last item isn't hidden under the floating tab bar (both
// (client)/(tabs)/_layout.tsx and (handyman)/(tabs)/_layout.tsx, visual
// pass 2026-09-24, option "Nav B"). The bar is position:'absolute' now, so
// it no longer reserves its own row in the screen's layout -- add this on
// top of whatever padding a screen already has, not in place of it.
// Platform-independent on purpose: each screen's own SafeAreaView already
// accounts for the device's bottom safe-area inset separately (the bar
// itself floats `insets.bottom + 16` above that same boundary) -- this is
// only the bar's own fixed height (68) + its 16px floating margin + 16px of
// breathing room so content doesn't touch it.
export const BottomTabInset = 100;
export const MaxContentWidth = 800;

// Same gold in both themes -- a star rating reads as "rating," not
// "themed accent," so it stays constant against light and dark backgrounds.
export const RatingColor = '#f5a623';
