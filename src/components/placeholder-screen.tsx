import { StyleSheet } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type PlaceholderScreenProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  /**
   * Defaults to undefined (SafeAreaView's own default: all four edges) --
   * right for this component's tab-screen uses (client Profile, Post Job),
   * which have no native header and so need the real top inset. A screen
   * that DOES have a native header (Settings, "New private job") must pass
   * edges={['left', 'right', 'bottom']} instead, or the header (which
   * already sits in the device's top inset) and this component's own
   * top-inset padding stack, doubling the gap above the title.
   */
  edges?: readonly Edge[];
};

export function PlaceholderScreen({ title, description, children, edges }: PlaceholderScreenProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={edges}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {description && (
          <ThemedText type="default" themeColor="textSecondary">
            {description}
          </ThemedText>
        )}
        {children}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
