import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { DEFAULT_TRADE_ICON, TRADE_ICONS } from '@/constants/trade-icons';
import { useTheme } from '@/hooks/use-theme';

type ServiceIconProps = {
  slug: string;
  size?: number;
};

// Consistent circular treatment for a trade's icon -- wraps the existing
// slug -> Ionicon map (trade-icons.ts, already used ad hoc in several
// screens) in a themed tint-wash circle, so a trade looks the same wherever
// it appears instead of each screen styling its own icon container.
// New in the 2026-09-25 design-system pass; not wired into any screen yet.
export function ServiceIcon({ slug, size = 40 }: ServiceIconProps) {
  const theme = useTheme();
  const iconName = TRADE_ICONS[slug] ?? DEFAULT_TRADE_ICON;

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.tintBackground },
      ]}>
      <Ionicons name={iconName} size={size * 0.5} color={theme.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
