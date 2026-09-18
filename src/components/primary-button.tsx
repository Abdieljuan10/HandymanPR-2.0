import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrimaryButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
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

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? { backgroundColor: theme.tint } : styles.secondary,
        (pressed || disabled || loading) && styles.pressed,
        style as object,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : theme.tint} />
      ) : (
        <ThemedText
          type="smallBold"
          style={variant === 'primary' ? styles.primaryLabel : { color: theme.tint }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.two,
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
  primaryLabel: {
    color: '#ffffff',
  },
});
