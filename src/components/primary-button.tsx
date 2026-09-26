import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrimaryButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  // 'destructive' added 2026-09-25 -- not wired into any screen yet. At
  // least 4 screens today hand-roll their own red delete/discard button
  // instead of this component (post-job-form, both portfolio screens, job
  // edit) -- this gives the next pass something real to switch them to,
  // instead of leaving each one to keep its own ad hoc styling.
  variant?: 'primary' | 'secondary' | 'destructive';
};

export function PrimaryButton({
  label,
  loading,
  variant = 'primary',
  style,
  disabled,
  ...rest
}: PrimaryButtonProps) {
  const theme = useTheme();
  const isFilled = variant === 'primary' || variant === 'destructive';

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isFilled
          ? { backgroundColor: variant === 'destructive' ? theme.error : theme.tint }
          : styles.secondary,
        (pressed || disabled || loading) && styles.pressed,
        style as object,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={isFilled ? '#ffffff' : theme.tint} />
      ) : (
        <ThemedText type="smallBold" style={isFilled ? styles.filledLabel : { color: theme.tint }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  secondary: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  filledLabel: {
    color: '#ffffff',
  },
});
