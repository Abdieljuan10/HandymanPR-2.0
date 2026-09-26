import { Image, type ImageStyle } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type AvatarProps = {
  uri?: string | null;
  /** Used only to derive the fallback initial -- never fetched or persisted here. */
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

// Standardized profile-photo treatment: circular, with a consistent
// tint-wash + initial fallback instead of each screen inventing its own
// placeholder (8 screens currently render an avatar_url each their own way).
// Mirrors JobPhoto's failed-load handling so a broken avatar URL falls back
// the same way a missing one does, not a blank/broken image box.
// New in the 2026-09-25 design-system pass; not wired into any screen yet.
export function Avatar({ uri, name, size = 40, style }: AvatarProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (!uri || failed) {
    const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';
    return (
      <View style={[styles.fallback, dimensionStyle, { backgroundColor: theme.tintBackground }, style]}>
        <ThemedText type="smallBold" themeColor="tint" style={{ fontSize: size * 0.4 }}>
          {initial}
        </ThemedText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[dimensionStyle, style] as StyleProp<ImageStyle>}
      contentFit="cover"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
