import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { notify } from '@/lib/confirm';
import { compressJobPhoto } from '@/lib/job-photos';
import { MAX_PROJECT_PHOTOS, portfolioPhotoStoragePath } from '@/lib/portfolio-photos';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type FieldErrors = { title?: string };

export default function NewPortfolioProjectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { pueblos, error: pueblosError } = usePueblos();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tradeIds, setTradeIds] = useState<number[]>([]);
  const [puebloSlugs, setPuebloSlugs] = useState<string[]>([]);
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePickPhotos() {
    if (photos.length >= MAX_PROJECT_PHOTOS) {
      notify({ title: t('portfolio.photoLimitTitle'), message: t('portfolio.photoLimit', { max: MAX_PROJECT_PHOTOS }) });
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

    const remainingSlots = MAX_PROJECT_PHOTOS - photos.length;
    const accepted = result.assets.slice(0, remainingSlots);
    setPhotos((prev) => [...prev, ...accepted]);

    if (result.assets.length > remainingSlots) {
      notify({ title: t('portfolio.photoLimitTitle'), message: t('portfolio.photoLimit', { max: MAX_PROJECT_PHOTOS }) });
    }
  }

  function handleRemovePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = t('portfolio.errors.title');
    return errors;
  }

  async function handleCreate() {
    const errors = validate();
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0 || !session) return;

    setSubmitting(true);

    const puebloId = pueblos?.find((p) => p.slug === puebloSlugs[0])?.id ?? null;

    const { data: project, error: insertError } = await supabase
      .from('handyman_portfolio_projects')
      .insert({
        handyman_id: session.user.id,
        title: title.trim(),
        description: description.trim() || null,
        trade_id: tradeIds[0] ?? null,
        pueblo_id: puebloId,
      })
      .select('id')
      .single();

    if (insertError || !project) {
      setSubmitError(insertError?.message ?? t('portfolio.notAllowed'));
      setSubmitting(false);
      return;
    }

    let sortOrder = 0;
    let failedPhotos = 0;
    for (const asset of photos) {
      try {
        const compressed = await compressJobPhoto(asset.uri, asset.width, asset.height);
        const response = await fetch(compressed.uri);
        const arrayBuffer = await response.arrayBuffer();
        const path = portfolioPhotoStoragePath(session.user.id, sortOrder);

        const { error: uploadError } = await supabase.storage
          .from('portfolio-photos')
          .upload(path, arrayBuffer, { contentType: compressed.mimeType });
        if (uploadError) {
          console.warn('Photo upload failed:', uploadError.message);
          failedPhotos += 1;
          continue;
        }

        const { data: publicUrl } = supabase.storage.from('portfolio-photos').getPublicUrl(path);
        const { error: rowError } = await supabase
          .from('handyman_portfolio_photos')
          .insert({ project_id: project.id, photo_url: publicUrl.publicUrl, sort_order: sortOrder });
        if (rowError) {
          console.warn('Photo record failed:', rowError.message);
          failedPhotos += 1;
          continue;
        }
        sortOrder += 1;
      } catch (photoError) {
        console.warn('Photo upload failed:', photoError);
        failedPhotos += 1;
      }
    }

    // Photo failures used to go into submitError right before router.back()
    // closed this screen, so nobody ever saw them. notify() survives it.
    if (failedPhotos > 0) {
      notify({
        title: t('common.photosFailedTitle'),
        message: t('common.photosFailed', { count: failedPhotos }),
      });
    }

    setSubmitting(false);
    router.back();
  }

  if (pueblosError) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="small" style={styles.error}>
            {t('common.loadError', { error: pueblosError })}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <KeyboardAvoidingScreen>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <FormField
              label={t('portfolio.titleLabel')}
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
              }}
              placeholder={t('portfolio.titlePlaceholder')}
              error={fieldErrors.title}
            />

            <FormField
              label={t('portfolio.descriptionLabel')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('portfolio.descriptionPlaceholder')}
              multiline
              numberOfLines={4}
              style={styles.multiline}
            />

            <ThemedText type="smallBold">{t('portfolio.tradeLabel')}</ThemedText>
            <TradePicker mode="single" selected={tradeIds} onChange={setTradeIds} />

            <ThemedText type="smallBold">{t('portfolio.puebloLabel')}</ThemedText>
            <PuebloPicker mode="single" selected={puebloSlugs} onChange={setPuebloSlugs} />

            <View style={styles.labelRow}>
              <ThemedText type="smallBold">{t('portfolio.photosLabel')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('portfolio.photoCount', { count: photos.length })}
              </ThemedText>
            </View>
            <View style={styles.photoGrid}>
              {photos.map((asset, index) => (
                <View key={asset.uri} style={styles.photoThumbWrapper}>
                  <Image source={{ uri: asset.uri }} style={styles.photoThumb} />
                  <Pressable style={styles.removeBadge} onPress={() => handleRemovePhoto(index)}>
                    <ThemedText type="smallBold" style={styles.removeBadgeText}>
                      ×
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
            <PrimaryButton label={t('portfolio.addPhotos')} variant="secondary" onPress={handlePickPhotos} />

            {submitError && (
              <ThemedText type="small" style={styles.error}>
                {submitError}
              </ThemedText>
            )}

            <PrimaryButton
              label={submitting ? t('portfolio.creating') : t('portfolio.create')}
              onPress={handleCreate}
              loading={submitting}
            />
          </ScrollView>
        </KeyboardAvoidingScreen>
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
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
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
    width: 88,
    height: 88,
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
