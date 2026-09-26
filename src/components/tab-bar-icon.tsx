import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TabBarIconProps = {
  name: ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
};

// Visual pass 2026-09-24, option "Nav B": a soft tint pill behind the
// active tab's icon, matching the approved mockup exactly -- not
// react-navigation's built-in tabBarActiveBackgroundColor, since that colors
// the WHOLE tab item (icon and label together), a different, bigger
// highlight than what was shown and picked. Ignores the `size`
// react-navigation would otherwise pass -- the pill's icon size is fixed
// regardless.
//
// Visual refinement 2026-09-26 (client request: "more subtle and
// integrated," not a bigger button): pill tightened from 44x28 to 40x26 and
// the icon from 21 to 20 -- geometry only. Still theme.tintBackground, the
// same token already used for chips/service icons elsewhere -- not changed
// here, since that's a shared token other (locked) screens also read.
export function TabBarIcon({ name, focused }: TabBarIconProps) {
  const theme = useTheme();

  return (
    <View style={[styles.pill, focused && { backgroundColor: theme.tintBackground }]}>
      <Ionicons name={name} size={20} color={focused ? theme.tint : theme.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 40,
    height: 26,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
