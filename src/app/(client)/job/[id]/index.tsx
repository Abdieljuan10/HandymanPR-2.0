import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CompletionCard } from '@/components/completion-card';
import { JobDateCard } from '@/components/job-date-card';
import { JobPhoto } from '@/components/job-photo';
import { PhotoViewer } from '@/components/photo-viewer';
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
  title: string;
  description: string;
  status: 'open' | 'hired' | 'pending_completion' | 'completed' | 'cancelled' | 'expired';
  max_bids: number;
  created_at: string;
  agreed_date: string | null;
  proposed_date: string | null;
  proposed_by: string | null;
  completion_marked_by: string | null;
  visibility: 'public' | 'invite_only';
  // Hinted by column: jobs <-> handyman_profiles is otherwise ambiguous
  // (bids links them too, so PostgREST sees a second, many-to-many path).
  invited_handyman: { id: string; full_name: string } | null;
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
  'id, title, description, status, max_bids, created_at, agreed_date, proposed_date, proposed_by, completion_marked_by, visibility, invited_handyman:handyman_profiles!invited_handyman_id(id, full_name), pueblos(name), trades(name_es, name_en)';
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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
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
  // Parts of the screen that failed to (re)load, shown as a notice instead of
  // letting them render as empty (see applyResult).
  const [partialError, setPartialError] = useState<string | null>(null);
  // Handymen invited by name to this PUBLIC job (job_invitations). Fetched
  // on its own, not embedded in JOB_SELECT: an embed error fails the whole
  // job query, and this screen treats that as "job not found" -- so a
  // missing/unapplied job_invitations table must only cost this one line.
  const [invitedHandymen, setInvitedHandymen] = useState<{ id: string; full_name: string }[]>([]);

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

  // One place that applies a fetchAll() result, for the first load and every
  // refresh after an action. A failed part never overwrites what's on
  // screen with an empty value -- a failed bids query used to read as "no
  // bids yet" (a client could delete a job people had bid on), and a failed
  // refresh right after accepting/cancelling/renewing used to show "not
  // found". Failures are listed in partialError instead.
  type FetchAllResult = NonNullable<Awaited<ReturnType<typeof fetchAll>>>;
  const applyResult = useCallback((result: FetchAllResult, isRefresh: boolean) => {
    const failures: string[] = [];

    if (result.jobResult.error) {
      if (isRefresh) {
        failures.push(result.jobResult.error.message);
      } else {
        setLoadError(result.jobResult.error.message);
        setJob(null);
      }
    } else {
      setLoadError(null);
      setJob((result.jobResult.data as JobDetailRow | null) ?? null);
    }

    if (result.photosResult.error) failures.push(result.photosResult.error.message);
    else setPhotos(result.photosResult.data ?? []);

    if (result.addressResult.error) failures.push(result.addressResult.error.message);
    else setAddress(result.addressResult.data?.full_address ?? null);

    if (result.bidsResult.error) failures.push(result.bidsResult.error.message);
    else setBids((result.bidsResult.data as unknown as BidRow[] | null) ?? []);

    if (result.reviewsResult.error) failures.push(result.reviewsResult.error.message);
    else setReviews((result.reviewsResult.data as ReviewRow[] | null) ?? []);

    if (failures.length > 0) console.error('Job detail: some data failed to load:', failures);
    setPartialError(failures.length > 0 ? failures.join('; ') : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      fetchAll().then((result) => {
        if (!isMounted || !result) return;
        applyResult(result, false);
      });
      supabase
        .from('job_invitations')
        .select('handyman_profiles(id, full_name)')
        .eq('job_id', id)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (error) {
            console.error('Failed to load job invitations:', error.message);
            return;
          }
          const rows = (data as unknown as { handyman_profiles: { id: string; full_name: string } | null }[]) ?? [];
          setInvitedHandymen(
            rows.map((row) => row.handyman_profiles).filter((p): p is { id: string; full_name: string } => !!p)
          );
        });
      return () => {
        isMounted = false;
      };
    }, [fetchAll, applyResult, id])
  );

  async function confirmAccept(bid: BidRow) {
    const confirmed = await confirmAsync({
      title: t('bids.confirmTitle'),
      message: t('bids.confirmMessage', {
        name: bid.handyman_profiles?.full_name ?? '',
        price: bid.price.toFixed(2),
      }),
      confirmLabel: t('bids.confirmAccept'),
      cancelLabel: t('bids.confirmCancel'),
    });
    if (confirmed) acceptBid(bid.id);
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
    if (result) applyResult(result, true);
  }

  function confirmRemoveJob() {
    if (job?.status === 'open' || job?.status === 'cancelled' || job?.status === 'expired') {
      confirmDestructive({
        title: t('jobDelete.confirmDeleteTitle'),
        message: t('jobDelete.confirmDeleteMessage'),
        confirmLabel: t('jobDelete.confirm'),
        cancelLabel: t('jobDelete.cancelDialog'),
        onConfirm: handleDelete,
      });
    } else if (job?.status === 'hired') {
      confirmDestructive({
        title: t('jobDelete.confirmCancelTitle'),
        message: t('jobDelete.confirmCancelMessage'),
        confirmLabel: t('jobDelete.confirm'),
        cancelLabel: t('jobDelete.cancelDialog'),
        onConfirm: handleCancelJob,
      });
    }
  }

  async function handleDelete() {
    if (!id) return;
    setRemoving(true);
    setRemoveError(null);

    // Chat photos live at chat-photos/<conversation-id>/... -- same reason as
    // job-photos below, this has to run BEFORE the job row (and its
    // conversations, via on-delete cascade) are gone, since the bucket's own
    // delete policy checks that the conversation's job_conversations row
    // still exists.
    const { data: conversations, error: listConversationsError } = await supabase
      .from('job_conversations')
      .select('id')
      .eq('job_id', id);
    if (listConversationsError) {
      setRemoving(false);
      setRemoveError(`${t('jobDelete.error')} (${listConversationsError.message})`);
      return;
    }
    for (const conversation of conversations ?? []) {
      const { data: chatFiles, error: listChatError } = await supabase.storage
        .from('chat-photos')
        .list(conversation.id);
      if (listChatError) {
        setRemoving(false);
        setRemoveError(`${t('jobDelete.error')} (${listChatError.message})`);
        return;
      }
      if (chatFiles.length > 0) {
        const { error: removeChatError } = await supabase.storage
          .from('chat-photos')
          .remove(chatFiles.map((file) => `${conversation.id}/${file.name}`));
        if (removeChatError) {
          setRemoving(false);
          setRemoveError(`${t('jobDelete.error')} (${removeChatError.message})`);
          return;
        }
      }
    }

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

    // .select() so a delete the RLS policy silently skips (0 rows, no error)
    // is caught instead of navigating back as if it worked.
    const { data: deleted, error } = await supabase.from('jobs').delete().eq('id', id).select('id');
    setRemoving(false);

    if (error || !deleted || deleted.length === 0) {
      setRemoveError(`${t('jobDelete.error')} (${error?.message ?? t('common.nothingChanged')})`);
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
    if (result) applyResult(result, true);
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
    if (result) applyResult(result, true);
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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

          {partialError && (
            <ThemedText type="small" style={styles.partialError}>
              {t('common.partialLoadError', { error: partialError })}
            </ThemedText>
          )}

          {job.visibility === 'invite_only' && job.invited_handyman && (
            <Link href={`/handyman/${job.invited_handyman.id}`} asChild>
              <Pressable>
                <ThemedText type="small" themeColor="tint">
                  {t('jobDetail.invitedOnly', { name: job.invited_handyman.full_name })}
                </ThemedText>
              </Pressable>
            </Link>
          )}

          {invitedHandymen.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('jobDetail.invitedLabel')}{' '}
              {invitedHandymen.map((handyman, index) => (
                <ThemedText key={handyman.id} type="small" themeColor="tint">
                  <Link href={`/handyman/${handyman.id}`}>{handyman.full_name}</Link>
                  {index < invitedHandymen.length - 1 ? ', ' : ''}
                </ThemedText>
              ))}
            </ThemedText>
          )}

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
                if (result) applyResult(result, true);
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
                if (result) applyResult(result, true);
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
  partialError: {
    color: '#d64545',
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
