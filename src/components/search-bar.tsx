import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SearchBarProps = Omit<TextInputProps, 'style'> & {
  onClear?: () => void;
};

// Standardized search input: a pill-shaped field with a leading icon and an
// optional clear button. Distinct from FormField, which is for a labeled
// form field, not a chrome-less search box -- no screen has a real search
// bar today (browse.tsx filters by trade/pueblo pickers, not free-text
// search), so this has nothing to replace yet.
// New in the 2026-09-25 design-system pass; not wired into any screen yet.
export function SearchBar({ value, onClear, ...rest }: SearchBarProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Ionicons name="search" size={18} color={theme.textSecondary} />
      <TextInput
        value={value}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
        {...rest}
      />
      {!!value && onClear && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
          <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
  },
});
