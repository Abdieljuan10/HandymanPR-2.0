import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CompletionCard } from '@/components/completion-card';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { JobDateCard } from '@/components/job-date-card';
import { JobPhoto } from '@/components/job-photo';
import { PhotoViewer } from '@/components/photo-viewer';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { LoadingState } from '@/components/loading-state';
import { PrimaryButton } from '@/components/primary-button';
import { ReviewsCard } from '@/components/reviews-card';
import { SectionHeader } from '@/components/section-header';
import { ServiceIcon } from '@/components/service-icon';
import { StatusBadge, type StatusTone } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAsync, confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobStatus = 'open' | 'hired' | 'pending_completion' | 'completed' | 'cancelled' | 'expired';
type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled';

type JobDetailRow = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  status: JobStatus;
  created_at: string;
  agreed_date: string | null;
  proposed_date: string | null;
  proposed_by: string | null;
  completion_marked_by: string | null;
  pueblos: { name: string } | null;
  trades: { slug: string; name_es: string; name_en: string } | null;
  client_profiles: { full_name: string } | null;
};

const JOB_SELECT =
  'id, client_id, title, description, status, created_at, agreed_date, proposed_date, proposed_by, completion_marked_by, pueblos(name), trades(slug, name_es, name_en), client_profiles(full_name)';

type MyBidRow = {
  id: string;
  price: number;
  note: string | null;
  status: BidStatus;
};

type ReviewRow = {
  id: string;
  author_id: string | null;
  rating: number;
  comment: string | null;
  published_at: string | null;
};

const REVIEW_SELECT = 'id, author_id, rating, comment, published_at';

// Presentation only -- purely maps an existing status value to a StatusBadge
// tone, same convention already used on Client Home and the client's own
// Job Details screen. Doesn't change what any status means or when it applies.
const JOB_STATUS_TONE: Record<JobStatus, StatusTone> = {
  open: 'info',
  hired: 'success',
  pending_completion: 'warning',
  completed: 'success',
  cancelled: 'error',
  expired: 'neutral',
};
const BID_STATUS_TONE: Record<BidStatus, StatusTone> = {
  pending: 'neutral',
  accepted: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
  cancelled: 'neutral',
};

export default function HandymanJobDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
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
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <LoadingState label={t('common.loading')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (job === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <EmptyState title={loadError ?? t('jobDetail.notFound')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const tradeName = job.trades ? (language === 'en' ? job.trades.name_en : job.trades.name_es) : '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <KeyboardAvoidingScreen>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photos.map((photo, index) => (
                <Pressable key={photo.photo_url} onPress={() => setViewerIndex(index)} style={styles.photoWrap}>
                  <JobPhoto uri={photo.photo_url} style={styles.photo} />
                  {index === 0 && photos.length > 1 && (
                    <View style={styles.photoCountBadge}>
                      <ThemedText type="metadata" style={styles.photoCountText}>
                        1/{photos.length}
                      </ThemedText>
                    </View>
                  )}
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

          <View style={styles.headerBlock}>
            <ThemedText type="screenTitle">{job.title}</ThemedText>
            <View style={styles.primaryRow}>
              <StatusBadge label={t(`jobStatus.${job.status}`)} tone={JOB_STATUS_TONE[job.status]} />
              {job.trades && tradeName.length > 0 && (
                <View style={styles.tradeChip}>
                  <ServiceIcon slug={job.trades.slug} size={20} />
                  <ThemedText type="smallBold" themeColor="tint">
                    {tradeName}
                  </ThemedText>
                </View>
              )}
            </View>
            <View style={styles.metaRow}>
              {job.pueblos?.name && (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={13} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {job.pueblos.name}
                  </ThemedText>
                </View>
              )}
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  {formatRelativeTime(job.created_at, t)}
                </ThemedText>
              </View>
            </View>
          </View>

          {Object.keys(partialErrors).length > 0 && (
            <ThemedText type="small" style={{ color: theme.error }}>
              {t('common.partialLoadError', { error: Object.values(partialErrors).join('; ') })}
            </ThemedText>
          )}

          <View style={styles.section}>
            <SectionHeader title={t('postJob.descriptionLabel')} />
            <ThemedText type="default">{job.description}</ThemedText>
          </View>

          <View style={[styles.transactionZone, { borderTopColor: theme.border }]}>
            <Pressable
              style={[styles.messageRow, { backgroundColor: theme.tintBackground }]}
              disabled={messaging}
              onPress={handleMessage}>
              {messaging ? (
                <ActivityIndicator color={theme.tint} />
              ) : (
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.tint} />
              )}
              <ThemedText type="smallBold" themeColor="tint">
                {t('conversation.messageClient')}
              </ThemedText>
            </Pressable>
            {messageError && (
              <ThemedText type="small" style={{ color: theme.error }}>
                {t('common.messageError', { error: messageError })}
              </ThemedText>
            )}

            {address && (
              <Card style={styles.card}>
                <ThemedText type="smallBold">{t('postJob.addressLabel')}</ThemedText>
                <ThemedText type="default">{address}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('myBid.hiredMessage')}
                </ThemedText>
              </Card>
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
              <ThemedText type="small" style={{ color: theme.error }}>
                {t('common.loadError', { error: bidLoadError })}
              </ThemedText>
            ) : myBid ? (
              <Card style={[styles.card, styles.accentCard, { borderLeftColor: theme.tint }]}>
                <View style={styles.bidStatusRow}>
                  <ThemedText type="smallBold">{t('myBid.title')}</ThemedText>
                  <StatusBadge label={t(`bidStatus.${myBid.status}`)} tone={BID_STATUS_TONE[myBid.status]} />
                </View>
                <ThemedText type="cardTitle">${myBid.price.toFixed(2)}</ThemedText>
                {myBid.note && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {myBid.note}
                  </ThemedText>
                )}
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
                  <ThemedText type="small" style={{ color: theme.error }}>
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
                  <ThemedText type="small" style={{ color: theme.error }}>
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
              </Card>
            ) : job.status === 'open' ? (
              <Card style={[styles.card, styles.accentCard, { borderLeftColor: theme.tint }]}>
                <SectionHeader title={t('bidForm.title')} />
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
                  <ThemedText type="small" style={{ color: theme.error }}>
                    {submitError}
                  </ThemedText>
                )}
                <PrimaryButton
                  label={submitting ? t('bidForm.submitting') : t('bidForm.submit')}
                  onPress={handleSubmitBid}
                  loading={submitting}
                />
              </Card>
            ) : (
              <EmptyState title={t('myBid.closedNoBid')} />
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
    padding: Spacing.four,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  photoScroll: {
    marginBottom: Spacing.one,
  },
  photoWrap: {
    marginRight: Spacing.two,
  },
  photo: {
    width: 300,
    height: 220,
    borderRadius: Radius.large,
  },
  photoCountBadge: {
    position: 'absolute',
    right: Spacing.one,
    bottom: Spacing.one,
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  photoCountText: {
    color: '#ffffff',
  },
  headerBlock: {
    gap: Spacing.two,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  tradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  section: {
    gap: Spacing.two,
  },
  transactionZone: {
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
  },
  card: {
    gap: Spacing.one,
  },
  accentCard: {
    borderLeftWidth: 3,
  },
  bidStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
