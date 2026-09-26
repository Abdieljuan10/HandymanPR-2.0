import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  description?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

// Standardized "nothing here" panel. At least 12 screens today render their
// own ad hoc centered text block for this, each slightly different
// (different spacing, some with an icon, most without).
// New in the 2026-09-25 design-system pass; not wired into any screen yet.
export function EmptyState({
  icon = 'file-tray-outline',
  title,
  description,
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name={icon} size={28} color={theme.textSecondary} />
      </View>
      <ThemedText type="cardTitle" style={styles.title}>
        {title}
      </ThemedText>
      {description && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
          {description}
        </ThemedText>
      )}
      {actionLabel && onActionPress && (
        <PrimaryButton
          label={actionLabel}
          variant="secondary"
          onPress={onActionPress}
          style={styles.action}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  description: {
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.three,
    minWidth: 160,
  },
});
