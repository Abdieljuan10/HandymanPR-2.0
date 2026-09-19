import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { RatingColor } from '@/constants/theme';

type StarDisplayProps = {
  rating: number;
  size?: number;
};

const STARS = [1, 2, 3, 4, 5];

// Rounds to the nearest half star so a fractional rating (e.g. a future
// average across reviews) still renders sensibly, even though a single
// review's rating is always a whole number today.
export function StarDisplay({ rating, size = 16 }: StarDisplayProps) {
  const rounded = Math.round(rating * 2) / 2;

  return (
    <View style={styles.row}>
      {STARS.map((star) => {
        const name = star <= rounded ? 'star' : star - 0.5 === rounded ? 'star-half' : 'star-outline';
        return <Ionicons key={star} name={name} size={size} color={RatingColor} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
  },
});
