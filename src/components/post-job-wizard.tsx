import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/card';
import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { LoadingState } from '@/components/loading-state';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ServiceIcon } from '@/components/service-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MIN_BIDS, type PostJobFieldErrors, usePostJobSubmission } from '@/hooks/use-post-job-submission';
import { useTrades } from '@/hooks/use-trades';
import { MAX_JOB_PHOTOS } from '@/lib/job-photos';

const STEP_COUNT = 6;
// Which of validateRequiredFields()'s keys belong to each step -- used only
// to decide which error(s) to surface when gating "Next". The validation
// RULE itself lives in one place, usePostJobSubmission.validateRequiredFields;
// this is purely "where does this field live in the wizard".
const STEP_FIELD_KEYS: (keyof PostJobFieldErrors)[][] = [
  ['title', 'address'],
  ['trade'],
  ['pueblo'],
  [],
  [],
  [],
];

// Post Job TAB only -- see the invite screen (invite/[handymanId]/new.tsx),
// which still renders the original single-page PostJobForm unchanged. Both
// this wizard and that form share exactly one submission implementation via
// usePostJobSubmission; this component owns only the wizard's own
// step/navigation state and its per-step presentation.
export function PostJobWizard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const { trades, error: tradesError } = useTrades();

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
    submitSucceeded,
    setSubmitSucceeded,
    handlePickPhotos,
    removePhoto,
    validateRequiredFields,
    handleSubmit,
  } = usePostJobSubmission({
    // Never invite here -- the wizard only ever posts a public job. See
    // post-job-form.tsx for the invite_only path.
    onValidationError: (errors) => {
      if (errors.title || errors.address) setCurrentStep(0);
      else if (errors.trade) setCurrentStep(1);
      else if (errors.pueblo) setCurrentStep(2);
    },
  });

  // This screen is a tab underneath the job-detail screen pushed after a
  // successful submit -- it's never unmounted by that navigation, so
  // nothing else would ever clear submitSucceeded or rewind currentStep.
  // Only fires the reset once the user actually comes back to this tab
  // (a genuine focus event), never merely because submitSucceeded changed
  // while already focused -- so it can't undo its own flag the instant
  // handleSubmit sets it. Ordinary tab-switching mid-fill-out never touches
  // this (submitSucceeded stays false), so in-progress steps are still
  // preserved exactly as before.
  useFocusEffect(
    useCallback(() => {
      if (submitSucceeded) {
        setSubmitSucceeded(false);
        setCurrentStep(0);
      }
    }, [submitSucceeded, setSubmitSucceeded])
  );

  const stepLabels = [
    t('postJob.stepDetails'),
    t('postJob.stepTrade'),
    t('postJob.stepLocation'),
    t('postJob.stepPhotos'),
    t('postJob.stepQuotes'),
    t('postJob.stepReview'),
  ];

  function goNext() {
    const errors = validateRequiredFields();
    const relevant = STEP_FIELD_KEYS[currentStep];
    const stepErrors: PostJobFieldErrors = {};
    for (const key of relevant) {
      if (errors[key]) stepErrors[key] = errors[key];
    }
    if (Object.keys(stepErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...stepErrors }));
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of relevant) delete next[key];
      return next;
    });
    setCurrentStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  }

  function goBack() {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  if (pueblosError) {
    return <PlaceholderScreen title={t('postJob.title')} description={t('common.loadError', { error: pueblosError })} />;
  }
  if (!pueblos) {
    return <PlaceholderScreen title={t('postJob.title')} description={t('common.loading')} />;
  }

  // The instant a submission succeeds, stop rendering step content entirely
  // -- handleSubmit's field resets land in this exact same render (React
  // batches them together), so without this guard the still-mounted wizard
  // would show an emptied Review for a moment before router.push's
  // transition finishes covering it. This is the fix for that bug; nothing
  // about the submission sequence itself changed.
  if (submitSucceeded) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
          <LoadingState label={t('postJob.posting')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const selectedTrade = trades?.find((trade) => trade.id === tradeIds[0]);
  // usePueblos() only carries {id, slug} (it's just for resolving pueblo_id
  // on submit) -- PUEBLO_SHAPES already has the display name PuebloList
  // itself sources names from, so this needs no new query.
  const selectedPuebloName = PUEBLO_SHAPES.find((pueblo) => pueblo.slug === puebloSlugs[0])?.name;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('postJob.title')} />
      </SafeAreaView>

      <View style={styles.stepperWrap}>
        <View style={styles.stepperRow}>
          {Array.from({ length: STEP_COUNT }).map((_, index) => {
            const done = index < currentStep;
            const current = index === currentStep;
            const size = current ? 26 : 22;
            return (
              <Fragment key={index}>
                <View
                  style={[
                    styles.stepCircle,
                    {
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      backgroundColor: done || current ? theme.tint : 'transparent',
                      borderColor: done || current ? theme.tint : theme.border,
                    },
                  ]}>
                  {done ? (
                    <Ionicons name="checkmark" size={12} color="#ffffff" />
                  ) : (
                    <ThemedText
                      type="metadata"
                      style={[styles.stepNumber, { color: current ? '#ffffff' : theme.textSecondary }]}>
                      {index + 1}
                    </ThemedText>
                  )}
                </View>
                {index < STEP_COUNT - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: done ? theme.tint : theme.border }]} />
                )}
              </Fragment>
            );
          })}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.stepIndicatorText}>
          {t('postJob.stepIndicator', { current: currentStep + 1, total: STEP_COUNT })} · {stepLabels[currentStep]}
        </ThemedText>
      </View>

      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingScreen>
          {/* key={currentStep} deliberately remounts the ScrollView on every
              step change, so each new step starts scrolled to the top --
              none of the actual form data lives here, it's all in
              usePostJobSubmission's state, so this never loses anything. */}
          <ScrollView
            key={currentStep}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            {currentStep === 0 && (
              <>
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
              </>
            )}

            {currentStep === 1 && (
              <>
                {fieldErrors.trade && (
                  <ThemedText type="small" style={styles.error}>
                    {fieldErrors.trade}
                  </ThemedText>
                )}
                {tradesError && (
                  <ThemedText type="small" style={styles.error}>
                    {t('common.loadError', { error: tradesError })}
                  </ThemedText>
                )}
                {!trades && !tradesError && <LoadingState label={t('common.loading')} fullScreen={false} />}
                {trades && (
                  <View style={styles.tradeGrid}>
                    {trades.map((trade) => {
                      const isSelected = tradeIds.includes(trade.id);
                      return (
                        <Pressable
                          key={trade.id}
                          style={styles.tradeCardPressable}
                          onPress={() => {
                            setTradeIds(isSelected ? [] : [trade.id]);
                            if (fieldErrors.trade) setFieldErrors((prev) => ({ ...prev, trade: undefined }));
                          }}>
                          <Card style={[styles.tradeCard, isSelected && { borderColor: theme.tint, borderWidth: 2 }]}>
                            <ServiceIcon slug={trade.slug} size={36} />
                            <ThemedText type="smallBold" style={styles.tradeCardLabel}>
                              {trade.name}
                            </ThemedText>
                            {isSelected && (
                              <View style={styles.tradeCheck}>
                                <Ionicons name="checkmark-circle" size={20} color={theme.tint} />
                              </View>
                            )}
                          </Card>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {currentStep === 2 && (
              <>
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
              </>
            )}

            {currentStep === 3 && (
              <>
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
              </>
            )}

            {currentStep === 4 && (
              <>
                <ThemedText type="smallBold">{t('postJob.maxBidsLabel')}</ThemedText>
                <View style={styles.stepperControlRow}>
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

            {currentStep === 5 && (
              <>
                <ThemedText type="sectionHeading">{t('postJob.reviewTitle')}</ThemedText>

                <Card style={styles.reviewCard}>
                  <View style={styles.reviewSectionHeader}>
                    <ThemedText type="cardTitle">{t('postJob.titleLabel')}</ThemedText>
                    <Pressable onPress={() => setCurrentStep(0)}>
                      <ThemedText type="small" themeColor="tint">
                        {t('postJob.edit')}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <ThemedText type="default">{title || '—'}</ThemedText>
                  {!!description && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.reviewSecondaryLine}>
                      {description}
                    </ThemedText>
                  )}
                  <ThemedText type="small" themeColor="textSecondary" style={styles.reviewSecondaryLine}>
                    {address || '—'}
                  </ThemedText>
                </Card>

                <Card style={styles.reviewCard}>
                  <View style={styles.reviewSectionHeader}>
                    <ThemedText type="cardTitle">{t('postJob.tradeLabel')}</ThemedText>
                    <Pressable onPress={() => setCurrentStep(1)}>
                      <ThemedText type="small" themeColor="tint">
                        {t('postJob.edit')}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <View style={styles.reviewTradeRow}>
                    {selectedTrade && <ServiceIcon slug={selectedTrade.slug} size={28} />}
                    <ThemedText type="default">{selectedTrade?.name ?? '—'}</ThemedText>
                  </View>
                </Card>

                <Card style={styles.reviewCard}>
                  <View style={styles.reviewSectionHeader}>
                    <ThemedText type="cardTitle">{t('postJob.puebloLabel')}</ThemedText>
                    <Pressable onPress={() => setCurrentStep(2)}>
                      <ThemedText type="small" themeColor="tint">
                        {t('postJob.edit')}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <ThemedText type="default">{selectedPuebloName ?? '—'}</ThemedText>
                </Card>

                <Card style={styles.reviewCard}>
                  <View style={styles.reviewSectionHeader}>
                    <ThemedText type="cardTitle">{t('postJob.photosLabel')}</ThemedText>
                    <Pressable onPress={() => setCurrentStep(3)}>
                      <ThemedText type="small" themeColor="tint">
                        {t('postJob.edit')}
                      </ThemedText>
                    </Pressable>
                  </View>
                  {photos.length > 0 ? (
                    <View style={styles.photoRow}>
                      {photos.map((photo) => (
                        <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.reviewPhotoThumb} />
                      ))}
                    </View>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('postJob.photoCount', { count: 0, max: MAX_JOB_PHOTOS })}
                    </ThemedText>
                  )}
                </Card>

                <Card style={styles.reviewCard}>
                  <View style={styles.reviewSectionHeader}>
                    <ThemedText type="cardTitle">{t('postJob.maxBidsLabel')}</ThemedText>
                    <Pressable onPress={() => setCurrentStep(4)}>
                      <ThemedText type="small" themeColor="tint">
                        {t('postJob.edit')}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <ThemedText type="default">{maxBids}</ThemedText>
                </Card>

                {submitError && (
                  <ThemedText type="small" style={styles.error}>
                    {submitError}
                  </ThemedText>
                )}
              </>
            )}

            <View style={styles.navRow}>
              {currentStep > 0 && (
                <PrimaryButton
                  label={t('postJob.back')}
                  variant="secondary"
                  style={styles.navButton}
                  onPress={goBack}
                />
              )}
              {currentStep < STEP_COUNT - 1 ? (
                <PrimaryButton label={t('postJob.next')} style={styles.navButton} onPress={goNext} />
              ) : (
                <PrimaryButton
                  label={submitting ? t('postJob.posting') : t('postJob.submit')}
                  style={styles.navButton}
                  onPress={handleSubmit}
                  loading={submitting}
                />
              )}
            </View>
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
  },
  stepperWrap: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 2,
  },
  stepIndicatorText: {
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  scrollContent: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: {
    marginTop: -Spacing.one,
  },
  tradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tradeCardPressable: {
    width: '47%',
  },
  tradeCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    position: 'relative',
  },
  tradeCardLabel: {
    flex: 1,
  },
  tradeCheck: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
  },
  stepperControlRow: {
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
    borderRadius: Radius.small,
  },
  reviewPhotoThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.small,
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
  reviewCard: {
    gap: Spacing.one,
  },
  reviewSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewSecondaryLine: {
    marginTop: Spacing.half,
  },
  reviewTradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  navRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  navButton: {
    flex: 1,
  },
  error: {
    color: '#d64545',
  },
});
