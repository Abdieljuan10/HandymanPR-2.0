import { Image } from 'expo-image';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export default function JobDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<JobDetailRow | null | undefined>(undefined);
  const [photos, setPhotos] = useState<{ photo_url: string }[]>([]);
  const [address, setAddress] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let isMounted = true;

      supabase
        .from('jobs')
        .select('id, title, description, status, max_bids, created_at, pueblos(name), trades(name_es, name_en)')
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

      return () => {
        isMounted = false;
      };
    }, [id])
  );

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
                <Image key={photo.photo_url} source={{ uri: photo.photo_url }} style={styles.photo} />
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

          <ThemedText type="default" themeColor="textSecondary">
            {t('jobDetail.bidsComingSoon')}
          </ThemedText>

          {job.status === 'open' && (
            <Link href={`/job/${job.id}/edit`} asChild>
              <PrimaryButton label={t('jobDetail.edit')} variant="secondary" />
            </Link>
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
});
