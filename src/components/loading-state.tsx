import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type LoadingStateProps = {
  label?: string;
  /** Fills and centers in its parent (a whole screen/tab body). Default true. */
  fullScreen?: boolean;
};

// Standardized loading indicator -- every screen today rolls its own bare
// <ActivityIndicator />; this gives it the brand tint color and an optional
// label consistently.
// New in the 2026-09-25 design-system pass; not wired into any screen yet.
export function LoadingState({ label, fullScreen = true }: LoadingStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <ActivityIndicator color={theme.tint} />
      {label && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreen: {
    flex: 1,
  },
  label: {
    marginTop: Spacing.two,
  },
});
