import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobPhoto } from '@/components/job-photo';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobDetailRow = {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'hired' | 'completed' | 'cancelled';
  max_bids: number;
  created_at: string;
  pueblos: { name: string } | null;
  trades: { name_es: string; name_en: string } | null;
};

type BidRow = {
  id: string;
  price: number;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  created_at: string;
  handyman_profiles: { id: string; full_name: string } | null;
};

const JOB_SELECT = 'id, title, description, status, max_bids, created_at, pueblos(name), trades(name_es, name_en)';
const BID_SELECT = 'id, price, note, status, created_at, handyman_profiles(id, full_name)';

export default function JobDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
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

  const fetchAll = useCallback(async () => {
    if (!id) return null;
    const [jobResult, photosResult, addressResult, bidsResult] = await Promise.all([
      supabase.from('jobs').select(JOB_SELECT).eq('id', id).maybeSingle(),
      supabase.from('job_photos').select('photo_url').eq('job_id', id).order('sort_order'),
      supabase.from('job_locations').select('full_address').eq('job_id', id).maybeSingle(),
      supabase.from('bids').select(BID_SELECT).eq('job_id', id).order('created_at', { ascending: true }),
    ]);
    return { jobResult, photosResult, addressResult, bidsResult };
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      fetchAll().then((result) => {
        if (!isMounted || !result) return;
        setJob((result.jobResult.data as JobDetailRow | null) ?? null);
        setPhotos(result.photosResult.data ?? []);
        setAddress(result.addressResult.data?.full_address ?? null);
        setBids((result.bidsResult.data as BidRow[] | null) ?? []);
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
    if (job?.status === 'open') {
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

    const { error } = await supabase.from('jobs').delete().eq('id', id);
    setRemoving(false);

    if (error) {
      setRemoveError(t('jobDelete.error'));
      return;
    }
    router.back();
  }

  async function handleCancelJob() {
    if (!id) return;
    setRemoving(true);
    setRemoveError(null);

    const { error } = await supabase.from('jobs').update({ status: 'cancelled' }).eq('id', id);
    setRemoving(false);

    if (error) {
      setRemoveError(t('jobDelete.error'));
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
          <ThemedText type="default">{t('jobDetail.notFound')}</ThemedText>
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

          {(job.status === 'open' || job.status === 'hired') && (
            <PrimaryButton
              label={job.status === 'open' ? t('jobDelete.deleteButton') : t('jobDelete.cancelButton')}
              variant="secondary"
              loading={removing}
              onPress={confirmRemoveJob}
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
