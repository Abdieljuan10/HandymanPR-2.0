import { Ionicons } from '@expo/vector-icons';
import { PlatformPressable } from 'expo-router/react-navigation';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const CIRCLE_SIZE = 56;
// How far the circle's top edge sits above this button's own slot (= the
// bar's top edge) -- roughly the top third of the circle rises above the
// bar, the rest overlaps it, which is what needs tabBarStyle's
// overflow:'hidden' turned off in the client layout (see that file's
// comment) -- otherwise the bar would clip exactly the part meant to float
// above it.
const CIRCLE_RISE = 22;

// The client tab bar's center "Post a Job" action -- distinct from
// CenteredTabBarButton (used by the other four tabs) on purpose: a plain
// centered icon+label doesn't give this the raised, primary-action look the
// design calls for, and CenteredTabBarButton's four other callers (this
// screen's own siblings, and the handyman bar) must keep rendering exactly
// as they did before. This ignores the `children` react-navigation would
// otherwise pass (the default icon+label built from tabBarIcon/title) and
// draws its own content instead; it still spreads every interaction/
// accessibility prop (onPress, accessibilityState, etc.) so it navigates
// and reads out exactly like a normal tab button.
export function CenterPostJobButton({
  style,
  onPress,
  onLongPress,
  accessibilityState,
  accessibilityLabel,
  testID,
}: ComponentProps<typeof PlatformPressable>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const focused = !!accessibilityState?.selected;

  // Explicit prop list, not {...props} -- PlatformPressable's props include
  // a `ref` typed for PlatformPressable itself, which a plain Pressable
  // can't accept (a real TS error, not a style choice). Only the
  // interaction/accessibility props actually needed are passed through.
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[style as object, styles.wrapper]}>
      <View style={[styles.circle, { backgroundColor: theme.tint }]}>
        <Ionicons name="add" size={26} color="#ffffff" />
      </View>
      <ThemedText
        themeColor={focused ? 'tint' : 'textSecondary'}
        style={styles.label}
        numberOfLines={1}>
        {t('tabs.postJob')}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  circle: {
    position: 'absolute',
    top: -CIRCLE_RISE,
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Deliberately stronger than the app's usual CardShadow -- that's tuned
    // for a flat in-page card, and this is meant to read as a raised,
    // separated-from-the-surface action button, not a flat card. Same
    // shadowColor convention the floating bar itself already uses.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  label: {
    // Matches the other four tabs' tabBarLabelStyle (fontSize: 10.5) for a
    // consistent label row -- bolder, since this one's meant to stand out.
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 6,
  },
});
