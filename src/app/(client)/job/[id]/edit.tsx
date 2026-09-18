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
import { compressJobPhoto, jobPhotoStoragePath, MAX_JOB_PHOTOS } from '@/lib/job-photos';
import { supabase } from '@/lib/supabase';

const MIN_BIDS = 3;

function storagePathFromJobPhotoUrl(url: string): string | null {
  const marker = '/object/public/job-photos/';
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

type FieldErrors = {
  title?: string;
  trade?: string;
  pueblo?: string;
  address?: string;
};

type InitialSnapshot = {
  title: string;
  description: string;
  address: string;
  tradeIds: number[];
  puebloSlugs: string[];
  maxBids: number;
};

export default function EditJobScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pueblos, error: pueblosError } = usePueblos();
  const scrollRef = useRef<ScrollView>(null);
  // Set right before a successful Save calls router.back() — lets the
  // unsaved-changes guard below wave that specific navigation through instead
  // of prompting, without depending on state having re-rendered in time (the
  // guard's callback reads this ref directly, not a value captured at render).
  const justSavedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [tradeIds, setTradeIds] = useState<number[]>([]);
  const [puebloSlugs, setPuebloSlugs] = useState<string[]>([]);
  const [maxBids, setMaxBids] = useState(MIN_BIDS);
  // Photos already saved to the job, as loaded from the DB.
  const [existingPhotos, setExistingPhotos] = useState<{ id: string; photo_url: string }[]>([]);
  // Ids of existingPhotos staged for removal — not deleted from Storage/the DB
  // until Save Changes, so backing out without saving leaves them untouched.
  const [removedPhotoIds, setRemovedPhotoIds] = useState<Set<string>>(new Set());
  // Newly picked photos staged for upload — not uploaded until Save Changes,
  // same reasoning as removedPhotoIds.
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
      address !== initial.address ||
      maxBids !== initial.maxBids ||
      tradeIds.join(',') !== initial.tradeIds.join(',') ||
      puebloSlugs.join(',') !== initial.puebloSlugs.join(','));
  const hasUnsavedChanges = hasFieldChanges || removedPhotoIds.size > 0 || newPhotos.length > 0;

  usePreventRemove(hasUnsavedChanges, ({ data }) => {
    if (justSavedRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(t('jobEdit.unsavedTitle'), t('jobEdit.unsavedMessage'), [
      { text: t('jobEdit.keepEditing'), style: 'cancel' },
      { text: t('jobEdit.discard'), style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  useEffect(() => {
    if (!id || !pueblos) return;
    let isMounted = true;

    Promise.all([
      supabase
        .from('jobs')
        .select('title, description, trade_id, pueblo_id, max_bids')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('job_locations').select('full_address').eq('job_id', id).maybeSingle(),
      supabase.from('job_photos').select('id, photo_url').eq('job_id', id).order('sort_order'),
    ]).then(([jobResult, locationResult, photosResult]) => {
      if (!isMounted) return;
      const job = jobResult.data;
      const loadedTitle = job?.title ?? '';
      const loadedDescription = job?.description ?? '';
      const loadedTradeIds = job?.trade_id ? [job.trade_id] : [];
      const loadedSlug = job ? pueblos.find((p) => p.id === job.pueblo_id)?.slug : undefined;
      const loadedPuebloSlugs = loadedSlug ? [loadedSlug] : [];
      const loadedMaxBids = job?.max_bids ?? MIN_BIDS;
      const loadedAddress = locationResult.data?.full_address ?? '';

      setTitle(loadedTitle);
      setDescription(loadedDescription);
      setTradeIds(loadedTradeIds);
      setPuebloSlugs(loadedPuebloSlugs);
      setMaxBids(loadedMaxBids);
      setAddress(loadedAddress);
      setExistingPhotos(photosResult.data ?? []);
      setInitial({
        title: loadedTitle,
        description: loadedDescription,
        address: loadedAddress,
        tradeIds: loadedTradeIds,
        puebloSlugs: loadedPuebloSlugs,
        maxBids: loadedMaxBids,
      });
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [id, pueblos]);

  async function handlePickPhotos() {
    if (totalPhotoCount >= MAX_JOB_PHOTOS) {
      Alert.alert(t('postJob.photoLimitTitle'), t('postJob.photoLimit', { max: MAX_JOB_PHOTOS }));
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

    const remainingSlots = MAX_JOB_PHOTOS - totalPhotoCount;
    const accepted = result.assets.slice(0, remainingSlots);
    setNewPhotos((prev) => [...prev, ...accepted]);

    if (result.assets.length > remainingSlots) {
      Alert.alert(t('postJob.photoLimitTitle'), t('postJob.photoLimit', { max: MAX_JOB_PHOTOS }));
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
    if (!title.trim()) errors.title = t('postJob.errors.title');
    if (tradeIds.length === 0) errors.trade = t('postJob.errors.trade');
    if (puebloSlugs.length === 0) errors.pueblo = t('postJob.errors.pueblo');
    if (!address.trim()) errors.address = t('postJob.errors.address');
    return errors;
  }

  function confirmMissingDescription(): Promise<boolean> {
    if (description.trim()) return Promise.resolve(true);
    return new Promise((resolve) => {
      Alert.alert(t('postJob.nudgeTitle'), t('postJob.nudgeDescription'), [
        { text: t('postJob.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('postJob.postAnyway'), onPress: () => resolve(true) },
      ]);
    });
  }

  async function handleSave() {
    const errors = validate();
    setFieldErrors(errors);
    setSubmitError(null);

    if (Object.keys(errors).length > 0) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const proceed = await confirmMissingDescription();
    if (!proceed) return;
    if (!pueblos || !id) return;

    setSubmitting(true);
    const puebloId = pueblos.find((p) => p.slug === puebloSlugs[0])?.id;

    const { data: updatedJob, error: jobError } = await supabase
      .from('jobs')
      .update({
        title: title.trim(),
        description: description.trim(),
        trade_id: tradeIds[0],
        pueblo_id: puebloId,
        max_bids: maxBids,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (jobError) {
      setSubmitError(jobError.message);
      setSubmitting(false);
      return;
    }
    // Postgres RLS lets an UPDATE that matches zero permitted rows "succeed"
    // with no error and no rows changed — so we check for a returned row
    // ourselves instead of trusting the absence of an error.
    if (!updatedJob) {
      setSubmitError(t('jobEdit.notAllowed'));
      setSubmitting(false);
      return;
    }

    const { data: updatedLocation, error: locationError } = await supabase
      .from('job_locations')
      .update({ full_address: address.trim() })
      .eq('job_id', id)
      .select('job_id')
      .maybeSingle();

    if (locationError) {
      setSubmitError(locationError.message);
      setSubmitting(false);
      return;
    }
    if (!updatedLocation) {
      setSubmitError(t('jobEdit.notAllowed'));
      setSubmitting(false);
      return;
    }

    // Core fields saved — now apply the queued photo removals and additions.
    await applyPhotoChanges(id);

    setSubmitting(false);
    justSavedRef.current = true;
    router.back();
  }

  async function applyPhotoChanges(jobId: string) {
    for (const photo of existingPhotos) {
      if (!removedPhotoIds.has(photo.id)) continue;
      const path = storagePathFromJobPhotoUrl(photo.photo_url);
      if (path) {
        await supabase.storage.from('job-photos').remove([path]);
      }
      await supabase.from('job_photos').delete().eq('id', photo.id);
    }

    let nextSortOrder = visibleExistingPhotos.length;
    for (const asset of newPhotos) {
      try {
        const compressed = await compressJobPhoto(asset.uri, asset.width, asset.height);
        const response = await fetch(compressed.uri);
        const arrayBuffer = await response.arrayBuffer();
        const path = jobPhotoStoragePath(jobId, nextSortOrder);

        const { error: uploadError } = await supabase.storage
          .from('job-photos')
          .upload(path, arrayBuffer, { contentType: compressed.mimeType });

        if (uploadError) {
          console.warn('Photo upload failed:', uploadError.message);
          continue;
        }

        const { data: publicUrl } = supabase.storage.from('job-photos').getPublicUrl(path);
        await supabase
          .from('job_photos')
          .insert({ job_id: jobId, photo_url: publicUrl.publicUrl, sort_order: nextSortOrder });
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
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>
          <FormField
            label={t('postJob.titleLabel')}
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
            }}
            error={fieldErrors.title}
          />
          <FormField
            label={t('postJob.descriptionLabel')}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={styles.multiline}
          />
          <FormField
            label={t('postJob.addressLabel')}
            value={address}
            onChangeText={(value) => {
              setAddress(value);
              if (fieldErrors.address) setFieldErrors((prev) => ({ ...prev, address: undefined }));
            }}
            error={fieldErrors.address}
          />

          <ThemedText type="smallBold">{t('postJob.tradeLabel')}</ThemedText>
          {fieldErrors.trade && (
            <ThemedText type="small" style={styles.error}>
              {fieldErrors.trade}
            </ThemedText>
          )}
          <TradePicker
            mode="single"
            selected={tradeIds}
            onChange={(ids) => {
              setTradeIds(ids);
              if (fieldErrors.trade) setFieldErrors((prev) => ({ ...prev, trade: undefined }));
            }}
          />

          <ThemedText type="smallBold">{t('postJob.puebloLabel')}</ThemedText>
          {fieldErrors.pueblo && (
            <ThemedText type="small" style={styles.error}>
              {fieldErrors.pueblo}
            </ThemedText>
          )}
          <PuebloPicker
            mode="single"
            selected={puebloSlugs}
            onChange={(slugs) => {
              setPuebloSlugs(slugs);
              if (fieldErrors.pueblo) setFieldErrors((prev) => ({ ...prev, pueblo: undefined }));
            }}
          />

          <ThemedText type="smallBold">{t('postJob.maxBidsLabel')}</ThemedText>
          <View style={styles.stepperRow}>
            <PrimaryButton
              label="−"
              variant="secondary"
              style={styles.stepperButton}
              onPress={() => setMaxBids((n) => Math.max(MIN_BIDS, n - 1))}
            />
            <ThemedText type="subtitle">{maxBids}</ThemedText>
            <PrimaryButton
              label="+"
              variant="secondary"
              style={styles.stepperButton}
              onPress={() => setMaxBids((n) => n + 1)}
            />
          </View>

          <View style={styles.photoLabelRow}>
            <ThemedText type="smallBold">{t('postJob.photosLabel')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('postJob.photoCount', { count: totalPhotoCount, max: MAX_JOB_PHOTOS })}
            </ThemedText>
          </View>
          <View style={styles.photoRow}>
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
          <PrimaryButton label={t('postJob.addPhotos')} variant="secondary" onPress={handlePickPhotos} />

          {submitError && (
            <ThemedText type="small" style={styles.error}>
              {submitError}
            </ThemedText>
          )}

          <PrimaryButton
            label={submitting ? t('postJob.posting') : t('jobEdit.save')}
            onPress={handleSave}
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
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  stepperButton: {
    width: 48,
  },
  photoLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photoThumbWrapper: {
    position: 'relative',
  },
  photoThumb: {
    width: 72,
    height: 72,
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
