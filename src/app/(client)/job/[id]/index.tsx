import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CompletionCard } from '@/components/completion-card';
import { JobDateCard } from '@/components/job-date-card';
import { JobPhoto } from '@/components/job-photo';
import { PrimaryButton } from '@/components/primary-button';
import { ReviewsCard } from '@/components/reviews-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobDetailRow = {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'hired' | 'pending_completion' | 'completed' | 'cancelled' | 'expired';
  max_bids: number;
  created_at: string;
  agreed_date: string | null;
  proposed_date: string | null;
  proposed_by: string | null;
  completion_marked_by: string | null;
  pueblos: { name: string } | null;
  trades: { name_es: string; name_en: string } | null;
};

type BidRow = {
  id: string;
  price: number;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled';
  created_at: string;
  handyman_profiles: { id: string; full_name: string } | null;
};

type ReviewRow = {
  id: string;
  author_id: string | null;
  rating: number;
  comment: string | null;
  published_at: string | null;
};

const JOB_SELECT =
  'id, title, description, status, max_bids, created_at, agreed_date, proposed_date, proposed_by, completion_marked_by, pueblos(name), trades(name_es, name_en)';
const BID_SELECT = 'id, price, note, status, created_at, handyman_profiles(id, full_name)';
const REVIEW_SELECT = 'id, author_id, rating, comment, published_at';

export default function JobDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { session } = useSession();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<JobDetailRow | null | undefined>(undefined);
  const [photos, setPhotos] = useState<{ photo_url: string }[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!id) return null;
    const [jobResult, photosResult, addressResult, bidsResult, reviewsResult] = await Promise.all([
      supabase.from('jobs').select(JOB_SELECT).eq('id', id).maybeSingle(),
      supabase.from('job_photos').select('photo_url').eq('job_id', id).order('sort_order'),
      supabase.from('job_locations').select('full_address').eq('job_id', id).maybeSingle(),
      supabase.from('bids').select(BID_SELECT).eq('job_id', id).order('created_at', { ascending: true }),
      supabase.from('reviews').select(REVIEW_SELECT).eq('job_id', id),
    ]);
    return { jobResult, photosResult, addressResult, bidsResult, reviewsResult };
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      fetchAll().then((result) => {
        if (!isMounted || !result) return;
        setLoadError(result.jobResult.error ? result.jobResult.error.message : null);
        setJob(result.jobResult.error ? null : ((result.jobResult.data as JobDetailRow | null) ?? null));
        setPhotos(result.photosResult.data ?? []);
        setAddress(result.addressResult.data?.full_address ?? null);
        setBids((result.bidsResult.data as BidRow[] | null) ?? []);
        setReviews((result.reviewsResult.data as ReviewRow[] | null) ?? []);
      });
      return () => {
        isMounted = false;
      };
    }, [fetchAll])
  );

  function confirmAccept(bid: BidRow) {
    Alert.alert(
      t('bids.confirmTitle'),
      t('bids.confirmMessage', { name: bid.handyman_profiles?.full_name ?? '', price: bid.price.toFixed(2) }),
      [
        { text: t('bids.confirmCancel'), style: 'cancel' },
        { text: t('bids.confirmAccept'), onPress: () => acceptBid(bid.id) },
      ]
    );
  }

  async function acceptBid(bidId: string) {
    setAcceptingId(bidId);
    setAcceptError(null);

    const { error } = await supabase.from('bids').update({ status: 'accepted' }).eq('id', bidId);
    setAcceptingId(null);

    if (error) {
      setAcceptError(t('bids.acceptError'));
      return;
    }

    const result = await fetchAll();
    if (result) {
      setJob((result.jobResult.data as JobDetailRow | null) ?? null);
      setAddress(result.addressResult.data?.full_address ?? null);
      setBids((result.bidsResult.data as BidRow[] | null) ?? []);
    }
  }

  function confirmRemoveJob() {
    if (job?.status === 'open' || job?.status === 'cancelled' || job?.status === 'expired') {
      Alert.alert(t('jobDelete.confirmDeleteTitle'), t('jobDelete.confirmDeleteMessage'), [
        { text: t('jobDelete.cancelDialog'), style: 'cancel' },
        { text: t('jobDelete.confirm'), style: 'destructive', onPress: handleDelete },
      ]);
    } else if (job?.status === 'hired') {
      Alert.alert(t('jobDelete.confirmCancelTitle'), t('jobDelete.confirmCancelMessage'), [
        { text: t('jobDelete.cancelDialog'), style: 'cancel' },
        { text: t('jobDelete.confirm'), style: 'destructive', onPress: handleCancelJob },
      ]);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setRemoving(true);
    setRemoveError(null);

    // Photos live at job-photos/<job-id>/... in Storage. jobs.id's on-delete
    // cascade only clears the job_photos DB rows, not the actual files, so
    // this has to run BEFORE the job row is gone -- the bucket's own delete
    // policy checks that a jobs row with this id still exists.
    const { data: files, error: listStorageError } = await supabase.storage.from('job-photos').list(id);
    if (listStorageError) {
      setRemoving(false);
      setRemoveError(`${t('jobDelete.error')} (${listStorageError.message})`);
      return;
    }
    if (files.length > 0) {
      const { error: removeStorageError } = await supabase.storage
        .from('job-photos')
        .remove(files.map((file) => `${id}/${file.name}`));
      if (removeStorageError) {
        setRemoving(false);
        setRemoveError(`${t('jobDelete.error')} (${removeStorageError.message})`);
        return;
      }
    }

    const { error } = await supabase.from('jobs').delete().eq('id', id);
    setRemoving(false);

    if (error) {
      setRemoveError(`${t('jobDelete.error')} (${error.message})`);
      return;
    }
    router.back();
  }

  async function handleCancelJob() {
    if (!id) return;
    setRemoving(true);
    setRemoveError(null);

    const { error } = await supabase.rpc('cancel_hired_job', { p_job_id: id });
    setRemoving(false);

    if (error) {
      setRemoveError(`${t('jobDelete.error')} (${error.message})`);
      return;
    }
    const result = await fetchAll();
    if (result) {
      setJob((result.jobResult.data as JobDetailRow | null) ?? null);
      setBids((result.bidsResult.data as BidRow[] | null) ?? []);
    }
  }

  async function handleRenew() {
    if (!id) return;
    setRenewing(true);
    setRenewError(null);

    const { error } = await supabase.rpc('renew_job', { p_job_id: id });
    setRenewing(false);

    if (error) {
      setRenewError(`${t('jobDelete.error')} (${error.message})`);
      return;
    }
    const result = await fetchAll();
    if (result) {
      setJob((result.jobResult.data as JobDetailRow | null) ?? null);
    }
  }

  if (job === undefined) {
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photos.map((photo) => (
                <JobPhoto key={photo.photo_url} uri={photo.photo_url} style={styles.photo} />
              ))}
            </ScrollView>
          )}

          <ThemedText type="subtitle">{job.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {job.pueblos?.name} · {tradeName} · {t(`jobStatus.${job.status}`)} ·{' '}
            {formatRelativeTime(job.created_at, t)}
          </ThemedText>

          <ThemedText type="default">{job.description}</ThemedText>

          {address && (
            <ThemedView type="backgroundElement" style={styles.addressBox}>
              <ThemedText type="smallBold">{t('postJob.addressLabel')}</ThemedText>
              <ThemedText type="default">{address}</ThemedText>
            </ThemedView>
          )}

          {job.status === 'hired' && session && (
            <JobDateCard
              jobId={job.id}
              myId={session.user.id}
              agreedDate={job.agreed_date}
              proposedDate={job.proposed_date}
              proposedBy={job.proposed_by}
              otherPartyLabel={
                bids.find((b) => b.status === 'accepted')?.handyman_profiles?.full_name ?? t('jobDate.theHandyman')
              }
              onChanged={async () => {
                const result = await fetchAll();
                if (result) {
                  setJob((result.jobResult.data as JobDetailRow | null) ?? null);
                }
              }}
            />
          )}

          <ThemedText type="small" themeColor="textSecondary">
            {t('jobDetail.maxBids', { count: job.max_bids })}
          </ThemedText>

          {job.status === 'open' && (
            <Link href={`/job/${job.id}/edit`} asChild>
              <PrimaryButton label={t('jobDetail.edit')} variant="secondary" />
            </Link>
          )}

          {removeError && (
            <ThemedText type="small" style={styles.error}>
              {removeError}
            </ThemedText>
          )}

          {(job.status === 'open' ||
            job.status === 'cancelled' ||
            job.status === 'expired' ||
            job.status === 'hired') && (
            <PrimaryButton
              label={job.status === 'hired' ? t('jobDelete.cancelButton') : t('jobDelete.deleteButton')}
              variant="secondary"
              loading={removing}
              onPress={confirmRemoveJob}
            />
          )}

          {job.status === 'expired' && (
            <ThemedView type="backgroundElement" style={styles.addressBox}>
              <ThemedText type="default" themeColor="textSecondary">
                {t('jobExpiry.expiredMessage')}
              </ThemedText>
              {renewError && (
                <ThemedText type="small" style={styles.error}>
                  {renewError}
                </ThemedText>
              )}
              <PrimaryButton label={t('jobExpiry.renewButton')} loading={renewing} onPress={handleRenew} />
            </ThemedView>
          )}

          {(job.status === 'hired' || job.status === 'pending_completion') && session && (
            <CompletionCard
              jobId={job.id}
              myId={session.user.id}
              status={job.status}
              agreedDate={job.agreed_date}
              completionMarkedBy={job.completion_marked_by}
              otherPartyLabel={
                bids.find((b) => b.status === 'accepted')?.handyman_profiles?.full_name ?? t('jobDate.theHandyman')
              }
              onChanged={async () => {
                const result = await fetchAll();
                if (result) {
                  setJob((result.jobResult.data as JobDetailRow | null) ?? null);
                  setReviews((result.reviewsResult.data as ReviewRow[] | null) ?? []);
                }
              }}
            />
          )}

          {job.status === 'completed' && session && (
            <ReviewsCard
              jobId={job.id}
              myId={session.user.id}
              reviews={reviews}
              otherPartyLabel={
                bids.find((b) => b.status === 'accepted')?.handyman_profiles?.full_name ?? t('jobDate.theHandyman')
              }
            />
          )}

          <ThemedText type="smallBold" style={styles.bidsTitle}>
            {t('bids.title')}
          </ThemedText>

          {acceptError && (
            <ThemedText type="small" style={styles.error}>
              {acceptError}
            </ThemedText>
          )}

          {bids.length === 0 ? (
            <ThemedText type="default" themeColor="textSecondary">
              {t('bids.empty')}
            </ThemedText>
          ) : (
            bids.map((bid) => (
              <ThemedView key={bid.id} type="backgroundElement" style={styles.bidCard}>
                {bid.handyman_profiles && (
                  <Link href={`/handyman/${bid.handyman_profiles.id}`} asChild>
                    <Pressable>
                      <ThemedText type="linkPrimary">{bid.handyman_profiles.full_name}</ThemedText>
                    </Pressable>
                  </Link>
                )}
                <ThemedText type="default">${bid.price.toFixed(2)}</ThemedText>
                {bid.note && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {bid.note}
                  </ThemedText>
                )}
                <ThemedText type="small">{t(`bidStatus.${bid.status}`)}</ThemedText>

                {job.status === 'open' && bid.status === 'pending' && (
                  <PrimaryButton
                    label={t('bids.accept')}
                    loading={acceptingId === bid.id}
                    onPress={() => confirmAccept(bid)}
                  />
                )}
              </ThemedView>
            ))
          )}
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
  bidsTitle: {
    marginTop: Spacing.three,
  },
  bidCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  error: {
    color: '#d64545',
  },
});
