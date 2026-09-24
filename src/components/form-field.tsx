import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  /**
   * An icon/button overlaid on the input's right edge, e.g. PasswordField's
   * show/hide toggle. Optional -- every existing call site with no
   * rightElement renders exactly as before.
   */
  rightElement?: React.ReactNode;
};

export function FormField({ label, error, style, rightElement, ...rest }: FormFieldProps) {
  const theme = useTheme();

  const input = (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.backgroundElement },
        error && styles.inputError,
        !!rightElement && styles.inputWithRightElement,
        !!rightElement && styles.noMargin,
        style,
      ]}
      {...rest}
    />
  );

  return (
    <>
      <ThemedText type="smallBold">{label}</ThemedText>
      {rightElement ? (
        <View style={[styles.row, error ? styles.rowMarginError : styles.rowMargin]}>
          {input}
          <View style={styles.rightElementSlot}>{rightElement}</View>
        </View>
      ) : (
        input
      )}
      {error && (
        <ThemedText type="small" style={styles.errorText}>
          {error}
        </ThemedText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    marginBottom: Spacing.three,
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#d64545',
    marginBottom: Spacing.one,
  },
  inputWithRightElement: {
    paddingRight: Spacing.four + Spacing.three,
  },
  noMargin: {
    marginBottom: 0,
  },
  row: {
    justifyContent: 'center',
  },
  rowMargin: {
    marginBottom: Spacing.three,
  },
  rowMarginError: {
    marginBottom: Spacing.one,
  },
  rightElementSlot: {
    position: 'absolute',
    right: Spacing.one,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  errorText: {
    color: '#d64545',
    marginBottom: Spacing.two,
    marginTop: -Spacing.one,
  },
});
