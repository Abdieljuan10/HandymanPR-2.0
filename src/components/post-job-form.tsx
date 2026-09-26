import { Image } from 'expo-image';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { MIN_BIDS, type Invite, usePostJobSubmission } from '@/hooks/use-post-job-submission';
import { MAX_JOB_PHOTOS } from '@/lib/job-photos';

// Shared by the Post Job tab (public job) and the invite screen reached
// from a handyman's public profile (invite_only job).
//
// 2026-09-26: this screen's own state/validation/submission logic moved to
// usePostJobSubmission (also used by post-job-wizard.tsx, the new wizard
// that replaced this component on the Post Job TAB only) -- this file's
// own JSX and behavior are otherwise untouched, so the invite flow that
// still renders this component is unaffected.
export function PostJobForm({ invite }: { invite?: Invite }) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);

  const {
    pueblos,
    pueblosError,
    title,
    setTitle,
    description,
    setDescription,
    address,
    setAddress,
    tradeIds,
    setTradeIds,
    puebloSlugs,
    setPuebloSlugs,
    maxBids,
    setMaxBids,
    photos,
    fieldErrors,
    setFieldErrors,
    submitError,
    submitting,
    handlePickPhotos,
    removePhoto,
    handleSubmit,
  } = usePostJobSubmission({
    invite,
    onValidationError: () => scrollRef.current?.scrollTo({ y: 0, animated: true }),
  });

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

  // Two contexts: the Post Job TAB (no invite -- AppHeader replaces the big
  // title, visual pass 2026-09-24) and the invite/[handymanId]/new PUSHED
  // stack screen (invite set -- already has its own native Stack header via
  // Stack.Screen's own `options.title`, so its inline subtitle stays
  // exactly as it was; not touched today).
  return (
    <ThemedView style={styles.container}>
      {!invite && (
        <SafeAreaView edges={['top', 'left', 'right']}>
          <AppHeader pageTitle={t('postJob.title')} />
        </SafeAreaView>
      )}
      <SafeAreaView {...(!invite ? { edges: ['left', 'right', 'bottom'] as const } : {})} style={styles.safeArea}>
        <KeyboardAvoidingScreen>
        <ScrollView showsVerticalScrollIndicator={false} ref={scrollRef} contentContainerStyle={styles.scrollContent}>
          {invite && <ThemedText type="subtitle">{t('postJob.inviteTitle')}</ThemedText>}
          {invite && (
            <ThemedView type="backgroundElement" style={styles.inviteBanner}>
              <ThemedText type="default">{t('postJob.inviteBanner', { name: invite.handymanName })}</ThemedText>
            </ThemedView>
          )}

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

          {/* Only one handyman can ever bid on an invite, so a bid cap means
              nothing there -- max_bids keeps its default (the column requires >= 3). */}
          {!invite && (
            <>
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
            </>
          )}

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
            label={submitting ? t('postJob.posting') : invite ? t('postJob.inviteSubmit') : t('postJob.submit')}
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
    paddingBottom: BottomTabInset,
  },
  inviteBanner: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
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
