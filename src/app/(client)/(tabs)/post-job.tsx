import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { compressJobPhoto, jobPhotoStoragePath, MAX_JOB_PHOTOS } from '@/lib/job-photos';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const MIN_BIDS = 3;
const DEFAULT_BIDS = 5;

type FieldErrors = {
  title?: string;
  trade?: string;
  pueblo?: string;
  address?: string;
};

export default function PostJobScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { pueblos, error: pueblosError } = usePueblos();
  const scrollRef = useRef<ScrollView>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [tradeIds, setTradeIds] = useState<number[]>([]);
  const [puebloSlugs, setPuebloSlugs] = useState<string[]>([]);
  const [maxBids, setMaxBids] = useState(DEFAULT_BIDS);
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePickPhotos() {
    if (photos.length >= MAX_JOB_PHOTOS) {
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

    const remainingSlots = MAX_JOB_PHOTOS - photos.length;
    const accepted = result.assets.slice(0, remainingSlots);
    setPhotos((prev) => [...prev, ...accepted]);

    if (result.assets.length > remainingSlots) {
      Alert.alert(t('postJob.photoLimitTitle'), t('postJob.photoLimit', { max: MAX_JOB_PHOTOS }));
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function validateRequiredFields(): FieldErrors {
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = t('postJob.errors.title');
    if (tradeIds.length === 0) errors.trade = t('postJob.errors.trade');
    if (puebloSlugs.length === 0) errors.pueblo = t('postJob.errors.pueblo');
    if (!address.trim()) errors.address = t('postJob.errors.address');
    return errors;
  }

  function confirmOptionalFields(missingDescription: boolean, missingPhotos: boolean): Promise<boolean> {
    if (!missingDescription && !missingPhotos) return Promise.resolve(true);

    const message =
      missingDescription && missingPhotos
        ? t('postJob.nudgeBoth')
        : missingPhotos
          ? t('postJob.nudgePhotos')
          : t('postJob.nudgeDescription');

    return new Promise((resolve) => {
      Alert.alert(t('postJob.nudgeTitle'), message, [
        { text: t('postJob.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('postJob.postAnyway'), onPress: () => resolve(true) },
      ]);
    });
  }

  async function handleSubmit() {
    const errors = validateRequiredFields();
    setFieldErrors(errors);
    setSubmitError(null);

    if (Object.keys(errors).length > 0) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const shouldProceed = await confirmOptionalFields(!description.trim(), photos.length === 0);
    if (!shouldProceed) return;

    if (!session || !pueblos) return;

    setSubmitting(true);

    const puebloId = pueblos.find((p) => p.slug === puebloSlugs[0])?.id;

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        client_id: session.user.id,
        trade_id: tradeIds[0],
        pueblo_id: puebloId,
        title: title.trim(),
        description: description.trim(),
        max_bids: maxBids,
      })
      .select('id')
      .single();

    if (jobError || !job) {
      setSubmitError(jobError?.message ?? 'Unknown error');
      setSubmitting(false);
      return;
    }

    const { error: locationError } = await supabase
      .from('job_locations')
      .insert({ job_id: job.id, full_address: address.trim() });

    if (locationError) {
      setSubmitError(locationError.message);
      setSubmitting(false);
      return;
    }

    for (const [index, photo] of photos.entries()) {
      try {
        const compressed = await compressJobPhoto(photo.uri, photo.width, photo.height);
        const response = await fetch(compressed.uri);
        const arrayBuffer = await response.arrayBuffer();
        const path = jobPhotoStoragePath(job.id, index);

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
          .insert({ job_id: job.id, photo_url: publicUrl.publicUrl, sort_order: index });
      } catch (photoError) {
        console.warn('Photo upload failed:', photoError);
      }
    }

    setSubmitting(false);
    setTitle('');
    setDescription('');
    setAddress('');
    setTradeIds([]);
    setPuebloSlugs([]);
    setMaxBids(DEFAULT_BIDS);
    setPhotos([]);
    // push (not replace): replace would drop the tab navigator from history,
    // leaving no way back to the tab bar after viewing the new job.
    router.push(`/job/${job.id}`);
  }

  if (pueblosError) {
    return (
      <PlaceholderScreen
        title={t('postJob.title')}
        description={t('common.loadError', { error: pueblosError })}
      />
    );
  }

  if (!pueblos) {
    return <PlaceholderScreen title={t('postJob.title')} description={t('common.loading')} />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>
          <ThemedText type="subtitle">{t('postJob.title')}</ThemedText>

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
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {t('postJob.addressHint')}
          </ThemedText>

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
              {t('postJob.photoCount', { count: photos.length, max: MAX_JOB_PHOTOS })}
            </ThemedText>
          </View>
          <View style={styles.photoRow}>
            {photos.map((photo, index) => (
              <View key={photo.uri} style={styles.photoThumbWrapper}>
                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                <Pressable style={styles.removeBadge} onPress={() => removePhoto(index)}>
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
            label={submitting ? t('postJob.posting') : t('postJob.submit')}
            onPress={handleSubmit}
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
  hint: {
    marginTop: -Spacing.one,
    marginBottom: Spacing.two,
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
