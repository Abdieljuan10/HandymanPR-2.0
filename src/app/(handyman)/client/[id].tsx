import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StarDisplay } from '@/components/star-display';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/utils/relative-time';

type ClientProfileRow = {
  full_name: string;
  avatar_url: string | null;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  published_at: string;
  author_first_name: string | null;
};

// Blind reviews of a CLIENT, visible only to handymen -- client's call:
// useful when deciding whether to bid, never public and never visible to
// other clients. Mirrors the handyman public profile's review section
// exactly (same cap/expand, same StarDisplay, same "first name only, no
// link to the reviewer" rule); enforcement of "handyman-only" lives in
// client_public_reviews() itself (20261014000000), not just this screen.
const REVIEWS_CAP = 3;

export default function ClientProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<ClientProfileRow | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    supabase
      .from('client_profiles')
      .select('full_name, avatar_url')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        // Genuinely "not found" is expected here when there's no connection
        // to this client (client_profiles RLS, 20261012000000) -- but a failed
        // query must still say it failed.
        if (error) {
          console.error('Client profile failed to load:', error.message);
          setLoadError(error.message);
        }
        setProfile(error ? null : ((data as ClientProfileRow | null) ?? null));
      });

    supabase.rpc('client_public_reviews', { p_client_id: id }).then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        console.error('Client reviews failed to load:', error.message);
        setReviewsError(error.message);
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
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (profile === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="default">
            {loadError !== null ? t('common.loadError', { error: loadError }) : t('clientProfile.notFound')}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const averageRating =
    reviews && reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
              {reviews && reviews.length > 0 && (
                <View style={styles.ratingRow}>
                  <StarDisplay rating={averageRating} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('clientPublicProfile.ratingSummary', {
                      average: averageRating.toFixed(1),
                      count: reviews.length,
                    })}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>

          {reviewsError !== null && (
            <ThemedText type="small" style={styles.errorText}>
              {t('common.partialLoadError', { error: reviewsError })}
            </ThemedText>
          )}

          {reviews !== null && (
            <View style={styles.section}>
              <ThemedText type="smallBold">{t('clientPublicProfile.reviewsTitle')}</ThemedText>
              {reviews.length === 0 ? (
                <ThemedText type="default" themeColor="textSecondary">
                  {t('clientPublicProfile.noReviews')}
                </ThemedText>
              ) : (
                <>
                  {(showAllReviews ? reviews : reviews.slice(0, REVIEWS_CAP)).map((review) => (
                    <ThemedView key={review.id} type="backgroundElement" style={styles.reviewCard}>
                      {/* Plain text on purpose -- never a Link or Pressable to
                          the reviewer's profile (same rule as handyman
                          reviews: first name only, no way to trace it back). */}
                      <ThemedText type="smallBold">
                        {review.author_first_name ?? t('clientPublicProfile.reviewerFallback')}
                      </ThemedText>
                      <View style={styles.ratingRow}>
                        <StarDisplay rating={review.rating} />
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatRelativeTime(review.published_at, t)}
                        </ThemedText>
                      </View>
                      {review.comment && <ThemedText type="default">{review.comment}</ThemedText>}
                    </ThemedView>
                  ))}
                  {reviews.length > REVIEWS_CAP && (
                    <Pressable onPress={() => setShowAllReviews((prev) => !prev)}>
                      <ThemedText type="small" themeColor="tint">
                        {showAllReviews
                          ? t('clientPublicProfile.showFewerReviews')
                          : t('clientPublicProfile.showAllReviews', { count: reviews.length })}
                      </ThemedText>
                    </Pressable>
                  )}
                </>
              )}
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
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  // flex: 1 -- without a bounded width here, a long name has nothing to
  // wrap against and just overflows past the screen edge instead (seen in
  // the client's own confirmation screenshot: "Juan Rios Cardona" running
  // off-screen). Text wraps on its own once its container is bounded; no
  // numberOfLines/truncation needed for a name, unlike the chat header.
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  section: {
    gap: Spacing.one,
  },
  reviewCard: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  errorText: {
    color: '#d64545',
  },
});
