import { Image, type ImageStyle } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type JobPhotoProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
};

export function JobPhoto({ uri, style }: JobPhotoProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.backgroundElement }, style]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fallbackText}>
          {t('common.imageLoadError')}
        </ThemedText>
      </View>
    );
  }

  return (
    <Image source={{ uri }} style={style as StyleProp<ImageStyle>} onError={() => setFailed(true)} />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  fallbackText: {
    textAlign: 'center',
  },
});
