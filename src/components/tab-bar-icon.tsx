import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type TabBarIconProps = {
  name: ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
};

// Visual pass 2026-09-24, option "Nav B": a soft tint pill behind the
// active tab's icon, matching the approved mockup exactly (a small 44x28
// rounded box, not react-navigation's built-in tabBarActiveBackgroundColor
// -- that colors the WHOLE tab item, icon and label together, which is a
// different, bigger highlight than what was shown and picked). Ignores the
// `size` react-navigation would otherwise pass -- the pill's icon size is
// fixed to match the mockup regardless.
export function TabBarIcon({ name, focused }: TabBarIconProps) {
  const theme = useTheme();

  return (
    <View style={[styles.pill, focused && { backgroundColor: `${theme.tint}29` }]}>
      <Ionicons name={name} size={21} color={focused ? theme.tint : theme.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
