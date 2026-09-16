import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { JobPhoto } from '@/components/job-photo';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type JobDetailRow = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  status: 'open' | 'hired' | 'completed' | 'cancelled' | 'expired';
  created_at: string;
  pueblos: { name: string } | null;
  trades: { name_es: string; name_en: string } | null;
};

type MyBidRow = {
  id: string;
  price: number;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled';
};

export default function HandymanJobDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { session } = useSession();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [job, setJob] = useState<JobDetailRow | null | undefined>(undefined);
  const [photos, setPhotos] = useState<{ photo_url: string }[]>([]);
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

  useFocusEffect(
    useCallback(() => {
      if (!id || !session) return;
      let isMounted = true;

      supabase
        .from('jobs')
        .select('id, client_id, title, description, status, created_at, pueblos(name), trades(name_es, name_en)')
        .eq('id', id)
        .maybeSingle()
        .then(({ data }) => {
          if (isMounted) setJob((data as JobDetailRow | null) ?? null);
        });

      supabase
        .from('job_photos')
        .select('photo_url')
        .eq('job_id', id)
        .order('sort_order')
        .then(({ data }) => {
          if (isMounted) setPhotos(data ?? []);
        });

      supabase
        .from('job_locations')
        .select('full_address')
        .eq('job_id', id)
        .maybeSingle()
        .then(({ data }) => {
          if (isMounted) setAddress(data?.full_address ?? null);
        });

      supabase
        .from('bids')
        .select('id, price, note, status')
        .eq('job_id', id)
        .eq('handyman_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (isMounted) setMyBid((data as MyBidRow | null) ?? null);
        });

      return () => {
        isMounted = false;
      };
    }, [id, session])
  );

  function confirmMissingNote(): Promise<boolean> {
    if (note.trim()) return Promise.resolve(true);
    return new Promise((resolve) => {
      Alert.alert(t('bidForm.nudgeTitle'), t('bidForm.nudgeNote'), [
        { text: t('bidForm.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('bidForm.submitAnyway'), onPress: () => resolve(true) },
      ]);
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
    Alert.alert(t('myBid.confirmWithdrawTitle'), t('myBid.confirmWithdrawMessage'), [
      { text: t('bids.confirmCancel'), style: 'cancel' },
      { text: t('myBid.withdraw'), style: 'destructive', onPress: handleWithdraw },
    ]);
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
    Alert.alert(t('myBid.confirmCancelJobTitle'), t('myBid.confirmCancelJobMessage'), [
      { text: t('jobDelete.cancelDialog'), style: 'cancel' },
      { text: t('jobDelete.confirm'), style: 'destructive', onPress: handleCancelJob },
    ]);
  }

  async function handleCancelJob() {
    if (!id || !job) return;
    setCancelling(true);
    setCancelError(null);

    const { error } = await supabase.rpc('cancel_hired_job', { p_job_id: id });
    setCancelling(false);

    if (error) {
      setCancelError(t('jobDelete.error'));
      return;
    }
    setJob({ ...job, status: 'open' });
  }

  async function handleMessage() {
    if (!id || !session || !job) return;
    setMessaging(true);

    const { data: existing } = await supabase
      .from('job_conversations')
      .select('id')
      .eq('job_id', id)
      .eq('handyman_id', session.user.id)
      .maybeSingle();

    let conversationId = existing?.id as string | undefined;

    if (!conversationId) {
      const { data: created, error } = await supabase
        .from('job_conversations')
        .insert({ job_id: id, client_id: job.client_id, handyman_id: session.user.id })
        .select('id')
        .single();

      if (error || !created) {
        setMessaging(false);
        return;
      }
      conversationId = created.id;
    }

    setMessaging(false);
    router.push(`/conversation/${conversationId}`);
  }

  if (job === undefined || myBid === undefined) {
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
        <KeyboardAvoidingScreen>
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

          <PrimaryButton
            label={t('conversation.messageClient')}
            variant="secondary"
            loading={messaging}
            onPress={handleMessage}
          />

          {address && (
            <ThemedView type="backgroundElement" style={styles.addressBox}>
              <ThemedText type="smallBold">{t('postJob.addressLabel')}</ThemedText>
              <ThemedText type="default">{address}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('myBid.hiredMessage')}
              </ThemedText>
            </ThemedView>
          )}

          {myBid ? (
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
