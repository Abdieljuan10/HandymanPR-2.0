import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobPhoto } from '@/components/job-photo';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { compressJobPhoto } from '@/lib/job-photos';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const MAX_PORTFOLIO_PHOTOS = 12;

type PortfolioPhoto = {
  id: string;
  photo_url: string;
  sort_order: number;
};

function storagePathFromPortfolioUrl(url: string): string | null {
  const marker = '/object/public/portfolio-photos/';
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

export default function PortfolioPhotosScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let isMounted = true;

    supabase
      .from('handyman_portfolio_photos')
      .select('id, photo_url, sort_order')
      .eq('handyman_id', session.user.id)
      .order('sort_order')
      .then(({ data, error: fetchError }) => {
        if (!isMounted) return;
        if (fetchError) setError(fetchError.message);
        setPhotos(data ?? []);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  async function handleAddPhotos() {
    if (!session) return;
    if (photos.length >= MAX_PORTFOLIO_PHOTOS) {
      Alert.alert(t('portfolio.photoLimitTitle'), t('portfolio.photoLimit', { max: MAX_PORTFOLIO_PHOTOS }));
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (result.canceled) return;

    const remainingSlots = MAX_PORTFOLIO_PHOTOS - photos.length;
    const accepted = result.assets.slice(0, remainingSlots);
    if (result.assets.length > remainingSlots) {
      Alert.alert(t('portfolio.photoLimitTitle'), t('portfolio.photoLimit', { max: MAX_PORTFOLIO_PHOTOS }));
    }

    setError(null);
    setUploading(true);

    let nextSortOrder = photos.length;
    for (const asset of accepted) {
      try {
        const compressed = await compressJobPhoto(asset.uri, asset.width, asset.height);
        const response = await fetch(compressed.uri);
        const arrayBuffer = await response.arrayBuffer();
        const path = `${session.user.id}/${Date.now()}-${nextSortOrder}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('portfolio-photos')
          .upload(path, arrayBuffer, { contentType: compressed.mimeType });
        if (uploadError) {
          setError(uploadError.message);
          continue;
        }

        const { data: publicUrl } = supabase.storage.from('portfolio-photos').getPublicUrl(path);
        const { data: inserted, error: insertError } = await supabase
          .from('handyman_portfolio_photos')
          .insert({ handyman_id: session.user.id, photo_url: publicUrl.publicUrl, sort_order: nextSortOrder })
          .select('id, photo_url, sort_order')
          .single();

        if (insertError || !inserted) {
          setError(insertError?.message ?? null);
          continue;
        }

        setPhotos((prev) => [...prev, inserted]);
        nextSortOrder += 1;
      } catch (photoError) {
        setError(photoError instanceof Error ? photoError.message : String(photoError));
      }
    }

    setUploading(false);
  }

  function handleRemove(photo: PortfolioPhoto) {
    Alert.alert(t('portfolio.removeConfirmTitle'), t('portfolio.removeConfirmMessage'), [
      { text: t('portfolio.cancel'), style: 'cancel' },
      {
        text: t('portfolio.remove'),
        style: 'destructive',
        onPress: async () => {
          const path = storagePathFromPortfolioUrl(photo.photo_url);
          if (path) {
            await supabase.storage.from('portfolio-photos').remove([path]);
          }
          await supabase.from('handyman_portfolio_photos').delete().eq('id', photo.id);
          setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        },
      },
    ]);
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="default" themeColor="textSecondary">
            {t('portfolio.intro')}
          </ThemedText>

          <View style={styles.labelRow}>
            <ThemedText type="smallBold">{t('portfolio.title')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('portfolio.photoCount', { count: photos.length, max: MAX_PORTFOLIO_PHOTOS })}
            </ThemedText>
          </View>

          {photos.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('portfolio.empty')}
            </ThemedText>
          )}

          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.photoThumbWrapper}>
                <JobPhoto uri={photo.photo_url} style={styles.photoThumb} />
                <Pressable style={styles.removeBadge} onPress={() => handleRemove(photo)}>
                  <ThemedText type="smallBold" style={styles.removeBadgeText}>
                    ×
                  </ThemedText>
                </Pressable>
              </View>
            ))}
          </View>

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <PrimaryButton
            label={uploading ? t('portfolio.uploading') : t('portfolio.addPhotos')}
            onPress={handleAddPhotos}
            loading={uploading}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photoThumbWrapper: {
    position: 'relative',
  },
  photoThumb: {
    width: 104,
    height: 104,
    borderRadius: Spacing.two,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#d64545',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    color: '#ffffff',
  },
  error: {
    color: '#d64545',
  },
});
