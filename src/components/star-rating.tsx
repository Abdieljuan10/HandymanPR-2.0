import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type StarRatingProps = {
  value: number | null;
  onChange: (value: number) => void;
};

const STARS = [1, 2, 3, 4, 5];

export function StarRating({ value, onChange }: StarRatingProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {STARS.map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} hitSlop={8}>
          <ThemedText type="subtitle" style={{ color: value !== null && star <= value ? '#f5a623' : theme.textSecondary }}>
            ★
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
});
