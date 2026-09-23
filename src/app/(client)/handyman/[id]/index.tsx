import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoViewer } from '@/components/photo-viewer';
import { PrimaryButton } from '@/components/primary-button';
import { StarDisplay } from '@/components/star-display';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { saveHandyman, unsaveHandyman } from '@/lib/saved-handymen';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type HandymanProfileRow = {
  id: string;
  full_name: string;
  bio: string | null;
  years_experience: number | null;
  avatar_url: string | null;
  is_verified: boolean;
  instagram_url: string | null;
  facebook_url: string | null;
};

type TradeRow = { trades: { name_es: string; name_en: string } | null };
type PuebloRow = { pueblos: { name: string } | null };
type ProjectPhoto = { photo_url: string; sort_order: number };
type ProjectRow = {
  id: string;
  title: string;
  trades: { name_es: string; name_en: string } | null;
  pueblos: { name: string } | null;
  handyman_portfolio_photos: ProjectPhoto[];
};
type CertificationRow = { id: string; title: string; issuing_org: string | null };
type ReviewRow = { id: string; rating: number; comment: string | null; published_at: string };

export default function PublicHandymanProfileScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  // null = unknown (not loaded, or the lookup failed) -- the heart is hidden
  // rather than guessing, so it can never show the wrong state.
  const [saved, setSaved] = useState<boolean | null>(null);

  const [profile, setProfile] = useState<HandymanProfileRow | null | undefined>(undefined);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [pueblos, setPueblos] = useState<PuebloRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [certifications, setCertifications] = useState<CertificationRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);

  useEffect(() => {
    if (!id || !session) return;
    let isMounted = true;
    supabase
      .from('client_saved_handymen')
      .select('handyman_id')
      .eq('client_id', session.user.id)
      .eq('handyman_id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error('Failed to load saved state:', error.message);
          return;
        }
        setSaved(!!data);
      });
    return () => {
      isMounted = false;
    };
  }, [id, session]);

  async function toggleSaved() {
    if (!session || !id || saved === null) return;
    const next = !saved;
    setSaved(next);
    const { error } = next ? await saveHandyman(session.user.id, id) : await unsaveHandyman(session.user.id, id);
    if (error) {
      console.error('Failed to update saved handyman:', error);
      setSaved(!next);
    }
  }

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    supabase
      .from('handyman_profiles')
      .select('id, full_name, bio, years_experience, avatar_url, is_verified, instagram_url, facebook_url')
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
      .from('handyman_portfolio_projects')
      .select(
        'id, title, trades(name_es, name_en), pueblos(name), handyman_portfolio_photos(photo_url, sort_order)'
      )
      .eq('handyman_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (isMounted) setProjects((data as ProjectRow[] | null) ?? []);
      });

    // Row metadata is public (title/org/verified) even though the
    // certifications Storage bucket itself is owner-only private -- the
    // underlying file is never shown here, only the claim and its badge.
    // Only verified ones are fetched at all -- an unverified certification
    // is just an unverified claim, and listing it (even without a badge)
    // would make the Verified badge meaningless. Pending review is a
    // handyman-facing concept only, shown on the management screen instead.
    supabase
      .from('handyman_certifications')
      .select('id, title, issuing_org')
      .eq('handyman_id', id)
      .eq('is_verified', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (isMounted) setCertifications(data ?? []);
      });

    // Clients' reviews of this handyman. published_at is filtered here even
    // though reviews_select already hides unpublished ones from everyone
    // else: that policy still lets an author read their OWN unpublished
    // review, so a client who reviewed this handyman would otherwise see it
    // (and have it counted in the average) before the blind window closes.
    // No reviewer name on purpose -- this page is visible to every client,
    // and naming reviewers would reveal who hired whom.
    supabase
      .from('reviews')
      .select('id, rating, comment, published_at')
      .eq('subject_id', id)
      .eq('author_role', 'client')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error('Failed to load reviews:', error.message);
          return;
        }
        setReviews((data as ReviewRow[] | null) ?? []);
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

  const averageRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
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
              <Pressable onPress={() => setAvatarViewerOpen(true)}>
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              </Pressable>
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
              {reviews.length > 0 && (
                <View style={styles.ratingRow}>
                  <StarDisplay rating={averageRating} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('handymanPublicProfile.ratingSummary', {
                      average: averageRating.toFixed(1),
                      count: reviews.length,
                    })}
                  </ThemedText>
                </View>
              )}
            </View>
            {saved !== null && (
              <Pressable
                onPress={toggleSaved}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={saved ? t('handymanPublicProfile.unsave') : t('handymanPublicProfile.save')}>
                <Ionicons
                  name={saved ? 'heart' : 'heart-outline'}
                  size={28}
                  color={saved ? '#d64545' : theme.textSecondary}
                />
              </Pressable>
            )}
          </View>

          <PrimaryButton
            label={t('handymanPublicProfile.inviteToQuote')}
            onPress={() => router.push(`/invite/${profile.id}`)}
          />

          {profile.bio && <ThemedText type="default">{profile.bio}</ThemedText>}

          {(profile.instagram_url || profile.facebook_url) && (
            <View style={styles.socialRow}>
              {profile.instagram_url && (
                <Pressable onPress={() => Linking.openURL(profile.instagram_url!)}>
                  <ThemedText type="linkPrimary">{t('handymanPublicProfile.instagram')}</ThemedText>
                </Pressable>
              )}
              {profile.facebook_url && (
                <Pressable onPress={() => Linking.openURL(profile.facebook_url!)}>
                  <ThemedText type="linkPrimary">{t('handymanPublicProfile.facebook')}</ThemedText>
                </Pressable>
              )}
            </View>
          )}

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

          <View style={styles.section}>
            <ThemedText type="smallBold">{t('handymanPublicProfile.reviewsTitle')}</ThemedText>
            {reviews.length === 0 ? (
              <ThemedText type="default" themeColor="textSecondary">
                {t('handymanPublicProfile.noReviews')}
              </ThemedText>
            ) : (
              reviews.map((review) => (
                <ThemedView key={review.id} type="backgroundElement" style={styles.reviewCard}>
                  <View style={styles.ratingRow}>
                    <StarDisplay rating={review.rating} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatRelativeTime(review.published_at, t)}
                    </ThemedText>
                  </View>
                  {review.comment && <ThemedText type="default">{review.comment}</ThemedText>}
                </ThemedView>
              ))
            )}
          </View>

          {projects.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="smallBold">{t('handymanPublicProfile.portfolioTitle')}</ThemedText>
              {projects.map((project) => {
                const sortedPhotos = [...project.handyman_portfolio_photos].sort(
                  (a, b) => a.sort_order - b.sort_order
                );
                const cover = sortedPhotos[0];
                const tradeName = project.trades
                  ? language === 'en'
                    ? project.trades.name_en
                    : project.trades.name_es
                  : null;
                const subtitle = [tradeName, project.pueblos?.name].filter(Boolean).join(' · ');

                return (
                  <Link key={project.id} href={`/handyman/${id}/project/${project.id}`} asChild>
                    <Pressable
                      style={StyleSheet.flatten([styles.projectCard, { borderColor: theme.backgroundElement }])}>
                      {cover ? (
                        <Image source={{ uri: cover.photo_url }} style={styles.projectCover} />
                      ) : (
                        <View
                          style={[
                            styles.projectCover,
                            { backgroundColor: theme.backgroundElement },
                          ]}
                        />
                      )}
                      <View style={styles.cardText}>
                        <ThemedText type="smallBold">{project.title}</ThemedText>
                        {subtitle.length > 0 && (
                          <ThemedText type="small" themeColor="textSecondary">
                            {subtitle}
                          </ThemedText>
                        )}
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('portfolio.photoCount', { count: project.handyman_portfolio_photos.length })}
                        </ThemedText>
                      </View>
                    </Pressable>
                  </Link>
                );
              })}
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
                  <ThemedText type="small" themeColor="tint">
                    {t('handymanPublicProfile.verified')}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {profile.avatar_url && (
        <PhotoViewer
          photos={[profile.avatar_url]}
          initialIndex={0}
          visible={avatarViewerOpen}
          onClose={() => setAvatarViewerOpen(false)}
        />
      )}
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
    flex: 1,
    gap: Spacing.half,
  },
  socialRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.one,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    marginBottom: Spacing.two,
  },
  projectCover: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  reviewCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  certRow: {
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
});
