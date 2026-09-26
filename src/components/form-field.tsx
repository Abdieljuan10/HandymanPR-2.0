import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
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
  /**
   * Overrides the label's color. Only needed on screens whose background is
   * a fixed, non-themed visual (e.g. sign-in's tools pattern) where the
   * default theme.text would go white-on-light in dark mode.
   */
  labelColor?: string;
};

export function FormField({ label, error, style, rightElement, labelColor, ...rest }: FormFieldProps) {
  const theme = useTheme();

  const input = (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      style={[
        styles.input,
        // White surface + a subtle border, not a flat gray fill -- 2026-09-25
        // design-system pass ("avoid huge gray boxes"). Border color alone
        // carries the error state; backgroundColor never changes.
        { color: theme.text, backgroundColor: theme.background, borderColor: error ? theme.error : theme.border },
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
      <ThemedText type="smallBold" style={labelColor && { color: labelColor }}>
        {label}
      </ThemedText>
      {rightElement ? (
        <View style={[styles.row, error ? styles.rowMarginError : styles.rowMargin]}>
          {input}
          <View style={styles.rightElementSlot}>{rightElement}</View>
        </View>
      ) : (
        input
      )}
      {error && (
        <ThemedText type="small" style={[styles.errorText, { color: theme.error }]}>
          {error}
        </ThemedText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    marginBottom: Spacing.three,
  },
  inputError: {
    borderWidth: 1.5,
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
    marginBottom: Spacing.two,
    marginTop: -Spacing.one,
  },
});
