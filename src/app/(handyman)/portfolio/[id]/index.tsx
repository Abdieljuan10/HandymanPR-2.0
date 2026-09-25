import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { JobPhoto } from '@/components/job-photo';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PhotoViewer } from '@/components/photo-viewer';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { confirmDestructive, notify } from '@/lib/confirm';
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

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
    confirmDestructive({
      title: t('portfolio.unsavedTitle'),
      message: t('portfolio.unsavedMessage'),
      confirmLabel: t('portfolio.discard'),
      cancelLabel: t('portfolio.keepEditing'),
      onConfirm: () => navigation.dispatch(data.action),
    });
  });

  // Waits for the pueblo list (same as job/[id]/edit.tsx) so pueblo_id can be
  // turned into a slug right here. This used to re-query pueblo_id in a
  // second effect and ignore its errors, so a failure left the pueblo blank
  // and Save then wrote null over the real one.
  useEffect(() => {
    if (!id || !pueblos) return;
    let isMounted = true;

    Promise.all([
      supabase.from('handyman_portfolio_projects').select('title, description, trade_id, pueblo_id').eq('id', id).maybeSingle(),
      supabase.from('handyman_portfolio_photos').select('id, photo_url').eq('project_id', id).order('sort_order'),
    ]).then(([projectResult, photosResult]) => {
      if (!isMounted) return;
      // Never open the form half-empty: a failed (or missing) load used to
      // show a blank project, and saving that would overwrite the real one.
      const failure =
        projectResult.error?.message ??
        photosResult.error?.message ??
        (projectResult.data ? null : t('portfolio.notFound'));
      if (failure) {
        console.error('Portfolio edit: failed to load:', failure);
        setLoadError(failure);
        return;
      }
      const project = projectResult.data;
      const loadedTitle = project?.title ?? '';
      const loadedDescription = project?.description ?? '';
      const loadedTradeIds = project?.trade_id ? [project.trade_id] : [];
      const loadedSlug = project?.pueblo_id ? pueblos.find((p) => p.id === project.pueblo_id)?.slug : undefined;
      const loadedPuebloSlugs = loadedSlug ? [loadedSlug] : [];

      setTitle(loadedTitle);
      setDescription(loadedDescription);
      setTradeIds(loadedTradeIds);
      setPuebloSlugs(loadedPuebloSlugs);
      setExistingPhotos(photosResult.data ?? []);
      setInitial({
        title: loadedTitle,
        description: loadedDescription,
        tradeIds: loadedTradeIds,
        puebloSlugs: loadedPuebloSlugs,
      });
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [id, pueblos, t]);

  async function handlePickPhotos() {
    if (totalPhotoCount >= MAX_PROJECT_PHOTOS) {
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

    const remainingSlots = MAX_PROJECT_PHOTOS - totalPhotoCount;
    const accepted = result.assets.slice(0, remainingSlots);
    setNewPhotos((prev) => [...prev, ...accepted]);

    if (result.assets.length > remainingSlots) {
      notify({ title: t('portfolio.photoLimitTitle'), message: t('portfolio.photoLimit', { max: MAX_PROJECT_PHOTOS }) });
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
    confirmDestructive({
      title: t('portfolio.deleteConfirmTitle'),
      message: t('portfolio.deleteConfirmMessage'),
      confirmLabel: t('portfolio.delete'),
      cancelLabel: t('portfolio.cancel'),
      onConfirm: async () => {
        setSubmitError(null);
        // Row first, confirmed with .select() (an RLS-skipped delete returns 0
        // rows and no error): this used to navigate back as if deleted no
        // matter what. Files after -- portfolio-photos is keyed by the
        // handyman's own folder, not the row, and a leftover file is
        // invisible, whereas deleting files first and then failing on the row
        // left a project with broken photos.
        const { data: deleted, error: deleteError } = await supabase
          .from('handyman_portfolio_projects')
          .delete()
          .eq('id', id)
          .select('id');
        if (deleteError || !deleted || deleted.length === 0) {
          setSubmitError(t('common.deleteError', { error: deleteError?.message ?? t('common.nothingChanged') }));
          return;
        }
        const paths = existingPhotos
          .map((p) => storagePathFromPortfolioUrl(p.photo_url))
          .filter((p): p is string => !!p);
        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage.from('portfolio-photos').remove(paths);
          if (storageError) console.warn('Portfolio photo file cleanup failed:', storageError.message);
        }
        justSavedRef.current = true;
        router.back();
      },
    });
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

    const failedPhotos = await applyPhotoChanges(session.user.id);
    if (failedPhotos > 0) {
      notify({
        title: t('common.photosFailedTitle'),
        message: t('common.photosFailed', { count: failedPhotos }),
      });
    }

    setSubmitting(false);
    justSavedRef.current = true;
    router.back();
  }

  // Returns how many photo changes didn't take, so Save can say so.
  async function applyPhotoChanges(userId: string): Promise<number> {
    let failed = 0;
    for (const photo of existingPhotos) {
      if (!removedPhotoIds.has(photo.id)) continue;
      const path = storagePathFromPortfolioUrl(photo.photo_url);
      if (path) {
        // A leftover file with no row is invisible to everyone -- log only.
        const { error: storageError } = await supabase.storage.from('portfolio-photos').remove([path]);
        if (storageError) console.warn('Photo file removal failed:', storageError.message);
      }
      const { error: rowError } = await supabase.from('handyman_portfolio_photos').delete().eq('id', photo.id);
      if (rowError) {
        console.warn('Photo removal failed:', rowError.message);
        failed += 1;
      }
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
          failed += 1;
          continue;
        }

        const { data: publicUrl } = supabase.storage.from('portfolio-photos').getPublicUrl(path);
        const { error: rowError } = await supabase
          .from('handyman_portfolio_photos')
          .insert({ project_id: id, photo_url: publicUrl.publicUrl, sort_order: nextSortOrder });
        if (rowError) {
          console.warn('Photo record failed:', rowError.message);
          failed += 1;
          continue;
        }
        nextSortOrder += 1;
      } catch (photoError) {
        console.warn('Photo upload failed:', photoError);
        failed += 1;
      }
    }
    return failed;
  }

  if (pueblosError || loadError !== null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="small" style={styles.error}>
            {t('common.loadError', { error: pueblosError ?? loadError })}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (loading || !pueblos) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
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
                {t('portfolio.photoCount', { count: totalPhotoCount })}
              </ThemedText>
            </View>
            <View style={styles.photoGrid}>
              {visibleExistingPhotos.map((photo, index) => (
                <View key={photo.id} style={styles.photoThumbWrapper}>
                  <Pressable onPress={() => setViewerIndex(index)}>
                    <JobPhoto uri={photo.photo_url} style={styles.photoThumb} />
                  </Pressable>
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
                  <Pressable onPress={() => setViewerIndex(visibleExistingPhotos.length + index)}>
                    <Image source={{ uri: asset.uri }} style={styles.photoThumb} />
                  </Pressable>
                  <Pressable style={styles.removeBadge} onPress={() => handleRemoveNewPhoto(index)}>
                    <ThemedText type="smallBold" style={styles.removeBadgeText}>
                      ×
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
            <PrimaryButton label={t('portfolio.addPhotos')} variant="secondary" onPress={handlePickPhotos} />

            <PhotoViewer
              photos={[...visibleExistingPhotos.map((p) => p.photo_url), ...newPhotos.map((p) => p.uri)]}
              initialIndex={viewerIndex ?? 0}
              visible={viewerIndex !== null}
              onClose={() => setViewerIndex(null)}
            />

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
