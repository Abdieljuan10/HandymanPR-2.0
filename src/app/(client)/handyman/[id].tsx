import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobPhoto } from '@/components/job-photo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';

type HandymanProfileRow = {
  id: string;
  full_name: string;
  bio: string | null;
  years_experience: number | null;
  avatar_url: string | null;
  is_verified: boolean;
};

type TradeRow = { trades: { name_es: string; name_en: string } | null };
type PuebloRow = { pueblos: { name: string } | null };
type PortfolioPhotoRow = { id: string; photo_url: string };
type CertificationRow = { id: string; title: string; issuing_org: string | null; is_verified: boolean };

export default function PublicHandymanProfileScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<HandymanProfileRow | null | undefined>(undefined);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [pueblos, setPueblos] = useState<PuebloRow[]>([]);
  const [portfolioPhotos, setPortfolioPhotos] = useState<PortfolioPhotoRow[]>([]);
  const [certifications, setCertifications] = useState<CertificationRow[]>([]);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    supabase
      .from('handyman_profiles')
      .select('id, full_name, bio, years_experience, avatar_url, is_verified')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted) setProfile((data as HandymanProfileRow | null) ?? null);
      });

    supabase
      .from('handyman_trades')
      .select('trades(name_es, name_en)')
      .eq('handyman_id', id)
      .then(({ data }) => {
        if (isMounted) setTrades((data as TradeRow[] | null) ?? []);
      });

    supabase
      .from('handyman_pueblos')
      .select('pueblos(name)')
      .eq('handyman_id', id)
      .then(({ data }) => {
        if (isMounted) setPueblos((data as PuebloRow[] | null) ?? []);
      });

    supabase
      .from('handyman_portfolio_photos')
      .select('id, photo_url')
      .eq('handyman_id', id)
      .order('sort_order')
      .then(({ data }) => {
        if (isMounted) setPortfolioPhotos(data ?? []);
      });

    // Row metadata is public (title/org/verified) even though the
    // certifications Storage bucket itself is owner-only private -- the
    // underlying file is never shown here, only the claim and its badge.
    supabase
      .from('handyman_certifications')
      .select('id, title, issuing_org, is_verified')
      .eq('handyman_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (isMounted) setCertifications(data ?? []);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (profile === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (profile === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('handymanPublicProfile.notFound')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const tradeNames = trades
    .map((row) => (row.trades ? (language === 'en' ? row.trades.name_en : row.trades.name_es) : null))
    .filter((name): name is string => !!name);
  const puebloNames = pueblos
    .map((row) => row.pueblos?.name)
    .filter((name): name is string => !!name);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerRow}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="subtitle" themeColor="textSecondary">
                  {profile.full_name.trim().charAt(0).toUpperCase() || '?'}
                </ThemedText>
              </View>
            )}
            <View style={styles.headerText}>
              <ThemedText type="subtitle">{profile.full_name}</ThemedText>
              {profile.is_verified && (
                <ThemedText type="small" themeColor="tint">
                  {t('handymanPublicProfile.verified')}
                </ThemedText>
              )}
              {profile.years_experience !== null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('handymanPublicProfile.yearsExperience', { count: profile.years_experience })}
                </ThemedText>
              )}
            </View>
          </View>

          {profile.bio && <ThemedText type="default">{profile.bio}</ThemedText>}

          {tradeNames.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="smallBold">{t('handymanPublicProfile.tradesTitle')}</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                {tradeNames.join(', ')}
              </ThemedText>
            </View>
          )}

          {puebloNames.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="smallBold">{t('handymanPublicProfile.pueblosTitle')}</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                {puebloNames.join(', ')}
              </ThemedText>
            </View>
          )}

          {portfolioPhotos.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="smallBold">{t('handymanPublicProfile.portfolioTitle')}</ThemedText>
              <View style={styles.photoGrid}>
                {portfolioPhotos.map((photo) => (
                  <JobPhoto key={photo.id} uri={photo.photo_url} style={styles.photoThumb} />
                ))}
              </View>
            </View>
          )}

          {certifications.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="smallBold">{t('handymanPublicProfile.certificationsTitle')}</ThemedText>
              {certifications.map((certification) => (
                <View key={certification.id} style={styles.certRow}>
                  <ThemedText type="default">{certification.title}</ThemedText>
                  {certification.issuing_org && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {certification.issuing_org}
                    </ThemedText>
                  )}
                  {certification.is_verified && (
                    <ThemedText type="small" themeColor="tint">
                      {t('handymanPublicProfile.verified')}
                    </ThemedText>
                  )}
                </View>
              ))}
            </View>
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
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    gap: Spacing.half,
  },
  section: {
    gap: Spacing.one,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photoThumb: {
    width: 104,
    height: 104,
    borderRadius: Spacing.two,
  },
  certRow: {
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
});
