/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform, type ViewStyle } from 'react-native';

// Brand palette ("Isla"): teal reads as trustworthy without the generic
// trade-app blue, coral is the sparing accent. Dark-mode tint is a lighter
// step than light-mode's so it still clears WCAG AA contrast on a pure
// black background (the flat light-mode teal falls just under 4.5:1 there).
//
// 2026-09-25 design-system pass added: `text` moved from pure black to a
// navy-charcoal (matches the confirm-signup/reset-password email templates'
// `#111827` for one consistent "brand ink" across app + email); `border`,
// `success`/`successBackground`, `error`/`errorBackground`, and
// `tintBackground` are new tokens, additive only -- nothing existing was
// renumbered. `error` promotes the `#d64545` that was hardcoded ad hoc in
// ~40 screen files (form errors, delete buttons, swipe-to-hide) to a real
// token; screens still need to be switched over to it one at a time (not
// done as part of this pass -- see redesign plan). `success` (green) is a
// brand-new semantic addition -- see TODO.md / chat history for the
// proposed status -> tone mapping before any screen wires it in.
export const Colors = {
  light: {
    text: '#111827',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    tint: '#0E7A82',
    accent: '#E8593F',
    // Subtle 1px card/divider border -- the tool for "rounded card with a
    // hairline edge" instead of a flat backgroundElement fill (today's
    // "gray box" look). New, unused until a screen adopts it.
    border: '#E3E5E9',
    // Soft wash of `tint`, for a selected chip/badge background or the tab
    // bar's active-icon pill -- replaces the ad hoc `${theme.tint}29`
    // string-concat hack that lived in tab-bar-icon.tsx.
    tintBackground: 'rgba(14,122,130,0.14)',
    // Semantic success/active -- NEW, see the module comment above.
    success: '#1E8E5C',
    successBackground: '#E3F6EC',
    // Promoted from the hardcoded '#d64545' scattered across ~40 files.
    // Same value, so adopting this token anywhere changes nothing visually.
    error: '#D64545',
    errorBackground: '#FBEAEA',
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
    // Not part of the brand brief (light-mode only, like the original Isla
    // mockup) -- left as plain white rather than guessing a navy-for-dark
    // equivalent nobody's approved yet.
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    tint: '#22A0A8',
    accent: '#F16B50',
    border: '#33363B',
    tintBackground: 'rgba(34,160,168,0.20)',
    success: '#3DDB8C',
    successBackground: 'rgba(61,219,140,0.16)',
    // Lighter than light.error, same reasoning as tint/accent's dark step:
    // clears contrast against black better than the flat light-mode red.
    error: '#E8726F',
    errorBackground: 'rgba(232,114,111,0.16)',
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

// Corner-radius scale, new in the 2026-09-25 design-system pass. Existing
// components mostly reused Spacing.two (8) as a radius by coincidence;
// these are named for what they are, not for a spacing value that happens
// to match. Nothing existing referenced this before, so adding it is
// zero-risk on its own -- it only takes effect where a component is
// explicitly switched over to it.
export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  xlarge: 24,
  pill: 999,
} as const;

// Subtle elevation for a card that should read as "raised" without a full
// modal-style shadow (that's DialogHost's own, heavier shadow, left as-is).
// A plain object, not StyleSheet.create -- Platform.select already returns
// the right shape per platform and this is spread into a style array
// wherever it's used (Card.tsx).
export const CardShadow: ViewStyle = Platform.select({
  ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
  default: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
})!;

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
