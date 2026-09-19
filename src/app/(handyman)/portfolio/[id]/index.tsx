import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { JobPhoto } from '@/components/job-photo';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { compressJobPhoto } from '@/lib/job-photos';
import { MAX_PROJECT_PHOTOS, portfolioPhotoStoragePath, storagePathFromPortfolioUrl } from '@/lib/portfolio-photos';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type ExistingPhoto = { id: string; photo_url: string };

type InitialSnapshot = {
  title: string;
  description: string;
  tradeIds: number[];
  puebloSlugs: string[];
};

type FieldErrors = { title?: string };

export default function EditPortfolioProjectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { pueblos, error: pueblosError } = usePueblos();
  // Same reasoning as job/[id]/edit.tsx: lets a successful Save's own
  // navigation through the unsaved-changes guard without depending on state
  // having re-rendered in time.
  const justSavedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tradeIds, setTradeIds] = useState<number[]>([]);
  const [puebloSlugs, setPuebloSlugs] = useState<string[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<Set<string>>(new Set());
  const [newPhotos, setNewPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [initial, setInitial] = useState<InitialSnapshot | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const visibleExistingPhotos = existingPhotos.filter((p) => !removedPhotoIds.has(p.id));
  const totalPhotoCount = visibleExistingPhotos.length + newPhotos.length;

  const hasFieldChanges =
    initial !== null &&
    (title !== initial.title ||
      description !== initial.description ||
      tradeIds.join(',') !== initial.tradeIds.join(',') ||
      puebloSlugs.join(',') !== initial.puebloSlugs.join(','));
  const hasUnsavedChanges = hasFieldChanges || removedPhotoIds.size > 0 || newPhotos.length > 0;

  usePreventRemove(hasUnsavedChanges, ({ data }) => {
    if (justSavedRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(t('portfolio.unsavedTitle'), t('portfolio.unsavedMessage'), [
      { text: t('portfolio.keepEditing'), style: 'cancel' },
      { text: t('portfolio.discard'), style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    Promise.all([
      supabase.from('handyman_portfolio_projects').select('title, description, trade_id, pueblo_id').eq('id', id).maybeSingle(),
      supabase.from('handyman_portfolio_photos').select('id, photo_url').eq('project_id', id).order('sort_order'),
    ]).then(([projectResult, photosResult]) => {
      if (!isMounted) return;
      const project = projectResult.data;
      const loadedTitle = project?.title ?? '';
      const loadedDescription = project?.description ?? '';
      const loadedTradeIds = project?.trade_id ? [project.trade_id] : [];
      const loadedPuebloSlugs: string[] = [];

      setTitle(loadedTitle);
      setDescription(loadedDescription);
      setTradeIds(loadedTradeIds);
      setExistingPhotos(photosResult.data ?? []);
      setInitial({
        title: loadedTitle,
        description: loadedDescription,
        tradeIds: loadedTradeIds,
        puebloSlugs: loadedPuebloSlugs,
      });
      // pueblo_id -> slug needs the pueblos list, resolved in the effect
      // below once it's loaded.
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [id]);

  // pueblo_id on the project only resolves to a slug once usePueblos() has
  // loaded -- runs once both the project and the pueblo list are ready.
  useEffect(() => {
    if (!id || !pueblos) return;
    let isMounted = true;

    supabase
      .from('handyman_portfolio_projects')
      .select('pueblo_id')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!isMounted || !data?.pueblo_id) return;
        const slug = pueblos.find((p) => p.id === data.pueblo_id)?.slug;
        if (slug) {
          setPuebloSlugs([slug]);
          setInitial((prev) => (prev ? { ...prev, puebloSlugs: [slug] } : prev));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id, pueblos]);

  async function handlePickPhotos() {
    if (totalPhotoCount >= MAX_PROJECT_PHOTOS) {
      Alert.alert(t('portfolio.photoLimitTitle'), t('portfolio.photoLimit', { max: MAX_PROJECT_PHOTOS }));
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

    const remainingSlots = MAX_PROJECT_PHOTOS - totalPhotoCount;
    const accepted = result.assets.slice(0, remainingSlots);
    setNewPhotos((prev) => [...prev, ...accepted]);

    if (result.assets.length > remainingSlots) {
      Alert.alert(t('portfolio.photoLimitTitle'), t('portfolio.photoLimit', { max: MAX_PROJECT_PHOTOS }));
    }
  }

  function handleRemoveExistingPhoto(photoId: string) {
    setRemovedPhotoIds((prev) => new Set(prev).add(photoId));
  }

  function handleRemoveNewPhoto(index: number) {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = t('portfolio.errors.title');
    return errors;
  }

  function handleDeleteProject() {
    Alert.alert(t('portfolio.deleteConfirmTitle'), t('portfolio.deleteConfirmMessage'), [
      { text: t('portfolio.cancel'), style: 'cancel' },
      {
        text: t('portfolio.delete'),
        style: 'destructive',
        onPress: async () => {
          const paths = existingPhotos
            .map((p) => storagePathFromPortfolioUrl(p.photo_url))
            .filter((p): p is string => !!p);
          if (paths.length > 0) {
            await supabase.storage.from('portfolio-photos').remove(paths);
          }
          await supabase.from('handyman_portfolio_projects').delete().eq('id', id);
          justSavedRef.current = true;
          router.back();
        },
      },
    ]);
  }

  async function handleSave() {
    const errors = validate();
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0 || !id || !session) return;

    setSubmitting(true);
    const puebloId = pueblos?.find((p) => p.slug === puebloSlugs[0])?.id ?? null;

    const { data: updated, error: updateError } = await supabase
      .from('handyman_portfolio_projects')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        trade_id: tradeIds[0] ?? null,
        pueblo_id: puebloId,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (updateError) {
      setSubmitError(updateError.message);
      setSubmitting(false);
      return;
    }
    if (!updated) {
      setSubmitError(t('portfolio.notAllowed'));
      setSubmitting(false);
      return;
    }

    await applyPhotoChanges(session.user.id);

    setSubmitting(false);
    justSavedRef.current = true;
    router.back();
  }

  async function applyPhotoChanges(userId: string) {
    for (const photo of existingPhotos) {
      if (!removedPhotoIds.has(photo.id)) continue;
      const path = storagePathFromPortfolioUrl(photo.photo_url);
      if (path) {
        await supabase.storage.from('portfolio-photos').remove([path]);
      }
      await supabase.from('handyman_portfolio_photos').delete().eq('id', photo.id);
    }

    let nextSortOrder = visibleExistingPhotos.length;
    for (const asset of newPhotos) {
      try {
        const compressed = await compressJobPhoto(asset.uri, asset.width, asset.height);
        const response = await fetch(compressed.uri);
        const arrayBuffer = await response.arrayBuffer();
        const path = portfolioPhotoStoragePath(userId, nextSortOrder);

        const { error: uploadError } = await supabase.storage
          .from('portfolio-photos')
          .upload(path, arrayBuffer, { contentType: compressed.mimeType });
        if (uploadError) {
          console.warn('Photo upload failed:', uploadError.message);
          continue;
        }

        const { data: publicUrl } = supabase.storage.from('portfolio-photos').getPublicUrl(path);
        await supabase
          .from('handyman_portfolio_photos')
          .insert({ project_id: id, photo_url: publicUrl.publicUrl, sort_order: nextSortOrder });
        nextSortOrder += 1;
      } catch (photoError) {
        console.warn('Photo upload failed:', photoError);
      }
    }
  }

  if (pueblosError) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="small" style={styles.error}>
            {t('common.loadError', { error: pueblosError })}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (loading || !pueblos) {
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
        <KeyboardAvoidingScreen>
          <ScrollView contentContainerStyle={styles.scrollContent}>
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
                {t('portfolio.photoCount', { count: totalPhotoCount })}
              </ThemedText>
            </View>
            <View style={styles.photoGrid}>
              {visibleExistingPhotos.map((photo) => (
                <View key={photo.id} style={styles.photoThumbWrapper}>
                  <JobPhoto uri={photo.photo_url} style={styles.photoThumb} />
                  <Pressable
                    style={styles.removeBadge}
                    onPress={() => handleRemoveExistingPhoto(photo.id)}>
                    <ThemedText type="smallBold" style={styles.removeBadgeText}>
                      ×
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
              {newPhotos.map((asset, index) => (
                <View key={asset.uri} style={styles.photoThumbWrapper}>
                  <Image source={{ uri: asset.uri }} style={styles.photoThumb} />
                  <Pressable style={styles.removeBadge} onPress={() => handleRemoveNewPhoto(index)}>
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
              label={submitting ? t('portfolio.saving') : t('portfolio.save')}
              onPress={handleSave}
              loading={submitting}
            />

            <Pressable onPress={handleDeleteProject} style={styles.deleteButton}>
              <ThemedText type="smallBold" style={styles.deleteText}>
                {t('portfolio.delete')}
              </ThemedText>
            </Pressable>
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
  deleteButton: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  deleteText: {
    color: '#d64545',
  },
  error: {
    color: '#d64545',
  },
});
