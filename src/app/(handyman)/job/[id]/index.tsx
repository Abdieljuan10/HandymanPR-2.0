import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CompletionCard } from '@/components/completion-card';
import { FormField } from '@/components/form-field';
import { JobDateCard } from '@/components/job-date-card';
import { JobPhoto } from '@/components/job-photo';
import { PhotoViewer } from '@/components/photo-viewer';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/primary-button';
import { ReviewsCard } from '@/components/reviews-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { confirmAsync, confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobDetailRow = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  status: 'open' | 'hired' | 'pending_completion' | 'completed' | 'cancelled' | 'expired';
  created_at: string;
  agreed_date: string | null;
  proposed_date: string | null;
  proposed_by: string | null;
  completion_marked_by: string | null;
  pueblos: { name: string } | null;
  trades: { name_es: string; name_en: string } | null;
  client_profiles: { full_name: string } | null;
};

const JOB_SELECT =
  'id, client_id, title, description, status, created_at, agreed_date, proposed_date, proposed_by, completion_marked_by, pueblos(name), trades(name_es, name_en), client_profiles(full_name)';

type MyBidRow = {
  id: string;
  price: number;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled';
};

type ReviewRow = {
  id: string;
  author_id: string | null;
  rating: number;
  comment: string | null;
  published_at: string | null;
};

const REVIEW_SELECT = 'id, author_id, rating, comment, published_at';

export default function HandymanJobDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { session } = useSession();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [job, setJob] = useState<JobDetailRow | null | undefined>(undefined);
  const [photos, setPhotos] = useState<{ photo_url: string }[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [myBid, setMyBid] = useState<MyBidRow | null | undefined>(undefined);

  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [priceError, setPriceError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Side queries that failed, shown as one notice instead of rendering as
  // empty: a failed reviews load used to offer "Leave a review" for a
  // review already written, and a failed address load hid it from the hired
  // handyman.
  const [partialErrors, setPartialErrors] = useState<Record<string, string>>({});
  // Separate from partialErrors: if we can't tell whether this handyman
  // already bid, the bid form must not be shown at all -- it used to appear
  // as if they never had.
  const [bidLoadError, setBidLoadError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  const notePartial = useCallback((key: string, message: string | null) => {
    if (message) console.error(`Job detail: ${key} failed to load:`, message);
    setPartialErrors((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }, []);

  const fetchJob = useCallback(async () => {
    if (!id) return null;
    const { data, error } = await supabase.from('jobs').select(JOB_SELECT).eq('id', id).maybeSingle();
    setLoadError(error ? error.message : null);
    return error ? null : ((data as JobDetailRow | null) ?? null);
  }, [id]);

  // For refreshes after an action: keeps the job on screen if the refresh
  // fails, instead of fetchJob()'s null turning a successful action into
  // "not found".
  const refreshJob = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('jobs').select(JOB_SELECT).eq('id', id).maybeSingle();
    notePartial('job', error ? error.message : null);
    if (!error) setJob((data as JobDetailRow | null) ?? null);
  }, [id, notePartial]);

  const fetchReviews = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('reviews').select(REVIEW_SELECT).eq('job_id', id);
    notePartial('reviews', error ? error.message : null);
    if (!error) setReviews((data as ReviewRow[] | null) ?? []);
  }, [id, notePartial]);

  useFocusEffect(
    useCallback(() => {
      if (!id || !session) return;
      let isMounted = true;

      fetchJob().then((data) => {
        if (isMounted) setJob(data);
      });

      fetchReviews();

      supabase
        .from('job_photos')
        .select('photo_url')
        .eq('job_id', id)
        .order('sort_order')
        .then(({ data, error }) => {
          if (!isMounted) return;
          notePartial('photos', error ? error.message : null);
          if (!error) setPhotos(data ?? []);
        });

      supabase
        .from('job_locations')
        .select('full_address')
        .eq('job_id', id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!isMounted) return;
          notePartial('address', error ? error.message : null);
          if (!error) setAddress(data?.full_address ?? null);
        });

      supabase
        .from('bids')
        .select('id, price, note, status')
        .eq('job_id', id)
        .eq('handyman_id', session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (error) {
            console.error('Job detail: own bid failed to load:', error.message);
            setBidLoadError(error.message);
            return;
          }
          setBidLoadError(null);
          setMyBid((data as MyBidRow | null) ?? null);
        });

      return () => {
        isMounted = false;
      };
    }, [id, session, fetchJob, fetchReviews, notePartial])
  );

  function confirmMissingNote(): Promise<boolean> {
    if (note.trim()) return Promise.resolve(true);
    return confirmAsync({
      title: t('bidForm.nudgeTitle'),
      message: t('bidForm.nudgeNote'),
      confirmLabel: t('bidForm.submitAnyway'),
      cancelLabel: t('bidForm.cancel'),
    });
  }

  async function handleSubmitBid() {
    if (!id || !session) return;

    const parsedPrice = Number(price);
    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setPriceError(t('bidForm.errors.price'));
      return;
    }
    setPriceError(undefined);

    const proceed = await confirmMissingNote();
    if (!proceed) return;

    setSubmitError(null);
    setSubmitting(true);

    const { data, error } = await supabase
      .from('bids')
      .insert({
        job_id: id,
        handyman_id: session.user.id,
        price: parsedPrice,
        note: note.trim() || null,
      })
      .select('id, price, note, status')
      .single();

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }
    setMyBid(data as MyBidRow);
  }

  function confirmWithdraw() {
    confirmDestructive({
      title: t('myBid.confirmWithdrawTitle'),
      message: t('myBid.confirmWithdrawMessage'),
      confirmLabel: t('myBid.withdraw'),
      cancelLabel: t('bids.confirmCancel'),
      onConfirm: handleWithdraw,
    });
  }

  async function handleWithdraw() {
    if (!myBid) return;
    setWithdrawing(true);
    setWithdrawError(null);

    const { error } = await supabase.from('bids').update({ status: 'withdrawn' }).eq('id', myBid.id);
    setWithdrawing(false);

    if (error) {
      setWithdrawError(error.message);
      return;
    }
    setMyBid({ ...myBid, status: 'withdrawn' });
  }

  function confirmCancelJob() {
    confirmDestructive({
      title: t('myBid.confirmCancelJobTitle'),
      message: t('myBid.confirmCancelJobMessage'),
      confirmLabel: t('jobDelete.confirm'),
      cancelLabel: t('jobDelete.cancelDialog'),
      onConfirm: handleCancelJob,
    });
  }

  async function handleCancelJob() {
    if (!id || !job) return;
    setCancelling(true);
    setCancelError(null);

    const { error } = await supabase.rpc('cancel_hired_job', { p_job_id: id });
    setCancelling(false);

    if (error) {
      setCancelError(`${t('jobDelete.error')} (${error.message})`);
      return;
    }
    await refreshJob();
  }

  // Every failure path here used to just stop, so the button did nothing.
  async function handleMessage() {
    if (!id || !session || !job) return;
    setMessaging(true);
    setMessageError(null);

    const { data: existing, error: lookupError } = await supabase
      .from('job_conversations')
      .select('id')
      .eq('job_id', id)
      .eq('handyman_id', session.user.id)
      .maybeSingle();

    // Don't guess "no conversation yet" from a failed lookup -- creating one
    // would hit the (job, handyman) unique key and fail anyway.
    if (lookupError) {
      setMessageError(lookupError.message);
      setMessaging(false);
      return;
    }

    let conversationId = existing?.id as string | undefined;

    if (!conversationId) {
      const { data: created, error } = await supabase
        .from('job_conversations')
        .insert({ job_id: id, client_id: job.client_id, handyman_id: session.user.id })
        .select('id')
        .single();

      if (error || !created) {
        setMessageError(error?.message ?? t('common.nothingChanged'));
        setMessaging(false);
        return;
      }
      conversationId = created.id;
    }

    setMessaging(false);
    router.push(`/conversation/${conversationId}`);
  }

  if (job === undefined || (myBid === undefined && bidLoadError === null)) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (job === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{loadError ?? t('jobDetail.notFound')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const tradeName = job.trades ? (language === 'en' ? job.trades.name_en : job.trades.name_es) : '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photos.map((photo, index) => (
                <Pressable key={photo.photo_url} onPress={() => setViewerIndex(index)}>
                  <JobPhoto uri={photo.photo_url} style={styles.photo} />
                </Pressable>
              ))}
            </ScrollView>
          )}

          <PhotoViewer
            photos={photos.map((photo) => photo.photo_url)}
            initialIndex={viewerIndex ?? 0}
            visible={viewerIndex !== null}
            onClose={() => setViewerIndex(null)}
          />

          <ThemedText type="subtitle">{job.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {job.pueblos?.name} · {tradeName} · {t(`jobStatus.${job.status}`)} ·{' '}
            {formatRelativeTime(job.created_at, t)}
          </ThemedText>

          {Object.keys(partialErrors).length > 0 && (
            <ThemedText type="small" style={styles.error}>
              {t('common.partialLoadError', { error: Object.values(partialErrors).join('; ') })}
            </ThemedText>
          )}

          <ThemedText type="default">{job.description}</ThemedText>

          <PrimaryButton
            label={t('conversation.messageClient')}
            variant="secondary"
            loading={messaging}
            onPress={handleMessage}
          />
          {messageError && (
            <ThemedText type="small" style={styles.error}>
              {t('common.messageError', { error: messageError })}
            </ThemedText>
          )}

          {address && (
            <ThemedView type="backgroundElement" style={styles.addressBox}>
              <ThemedText type="smallBold">{t('postJob.addressLabel')}</ThemedText>
              <ThemedText type="default">{address}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('myBid.hiredMessage')}
              </ThemedText>
            </ThemedView>
          )}

          {job.status === 'hired' && session && (
            <JobDateCard
              jobId={job.id}
              myId={session.user.id}
              agreedDate={job.agreed_date}
              proposedDate={job.proposed_date}
              proposedBy={job.proposed_by}
              otherPartyLabel={job.client_profiles?.full_name ?? t('jobDate.theClient')}
              onChanged={refreshJob}
            />
          )}

          {(job.status === 'hired' || job.status === 'pending_completion') && session && (
            <CompletionCard
              jobId={job.id}
              myId={session.user.id}
              status={job.status}
              agreedDate={job.agreed_date}
              completionMarkedBy={job.completion_marked_by}
              otherPartyLabel={job.client_profiles?.full_name ?? t('jobDate.theClient')}
              onChanged={async () => {
                await Promise.all([refreshJob(), fetchReviews()]);
              }}
            />
          )}

          {job.status === 'completed' && session && (
            <ReviewsCard
              jobId={job.id}
              myId={session.user.id}
              reviews={reviews}
              otherPartyLabel={job.client_profiles?.full_name ?? t('jobDate.theClient')}
            />
          )}

          {bidLoadError !== null ? (
            <ThemedText type="small" style={styles.error}>
              {t('common.loadError', { error: bidLoadError })}
            </ThemedText>
          ) : myBid ? (
            <ThemedView type="backgroundElement" style={styles.bidStatusBox}>
              <ThemedText type="smallBold">{t('myBid.title')}</ThemedText>
              <ThemedText type="default">${myBid.price.toFixed(2)}</ThemedText>
              {myBid.note && (
                <ThemedText type="small" themeColor="textSecondary">
                  {myBid.note}
                </ThemedText>
              )}
              <ThemedText type="small">{t(`bidStatus.${myBid.status}`)}</ThemedText>
              {myBid.status === 'rejected' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('myBid.rejectedMessage')}
                </ThemedText>
              )}
              {myBid.status === 'cancelled' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('myBid.jobCancelledMessage')}
                </ThemedText>
              )}
              {withdrawError && (
                <ThemedText type="small" style={styles.error}>
                  {withdrawError}
                </ThemedText>
              )}
              {myBid.status === 'pending' && (
                <PrimaryButton
                  label={t('myBid.withdraw')}
                  variant="secondary"
                  loading={withdrawing}
                  onPress={confirmWithdraw}
                />
              )}
              {cancelError && (
                <ThemedText type="small" style={styles.error}>
                  {cancelError}
                </ThemedText>
              )}
              {myBid.status === 'accepted' && job.status === 'hired' && (
                <PrimaryButton
                  label={t('myBid.cancelJob')}
                  variant="secondary"
                  loading={cancelling}
                  onPress={confirmCancelJob}
                />
              )}
            </ThemedView>
          ) : job.status === 'open' ? (
            <ThemedView type="backgroundElement" style={styles.bidForm}>
              <ThemedText type="smallBold">{t('bidForm.title')}</ThemedText>
              <FormField
                label={t('bidForm.priceLabel')}
                value={price}
                onChangeText={(value) => {
                  setPrice(value);
                  if (priceError) setPriceError(undefined);
                }}
                keyboardType="decimal-pad"
                error={priceError}
              />
              <FormField
                label={t('bidForm.noteLabel')}
                value={note}
                onChangeText={setNote}
                placeholder={t('bidForm.notePlaceholder')}
                multiline
                numberOfLines={4}
                style={styles.multiline}
              />
              {submitError && (
                <ThemedText type="small" style={styles.error}>
                  {submitError}
                </ThemedText>
              )}
              <PrimaryButton
                label={submitting ? t('bidForm.submitting') : t('bidForm.submit')}
                onPress={handleSubmitBid}
                loading={submitting}
              />
            </ThemedView>
          ) : (
            <ThemedText type="default" themeColor="textSecondary">
              {t('myBid.closedNoBid')}
            </ThemedText>
          )}
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
  photoScroll: {
    marginBottom: Spacing.two,
  },
  photo: {
    width: 220,
    height: 160,
    borderRadius: Spacing.two,
    marginRight: Spacing.two,
  },
  addressBox: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  bidStatusBox: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  bidForm: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  error: {
    color: '#d64545',
  },
});
