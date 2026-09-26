import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

// Standardized "Section title ...... See all" row above a list/grid within a
// screen -- not a full-screen title (that's ThemedText type="screenTitle").
// New in the 2026-09-25 design-system pass; not wired into any screen yet.
export function SectionHeader({ title, actionLabel, onActionPress }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <ThemedText type="sectionHeading">{title}</ThemedText>
      {actionLabel && onActionPress && (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="tint">
            {actionLabel}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
});
