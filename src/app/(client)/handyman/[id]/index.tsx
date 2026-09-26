import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadingState } from '@/components/loading-state';
import { PhotoViewer } from '@/components/photo-viewer';
import { PrimaryButton } from '@/components/primary-button';
import { PuebloMapThumbnail } from '@/components/pueblo-map-thumbnail';
import { SectionHeader } from '@/components/section-header';
import { ServiceIcon } from '@/components/service-icon';
import { StarDisplay } from '@/components/star-display';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
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

type TradeRow = { trades: { slug: string; name_es: string; name_en: string } | null };
type PuebloRow = { pueblos: { slug: string; name: string } | null };
type ProjectPhoto = { photo_url: string; sort_order: number };
type ProjectRow = {
  id: string;
  title: string;
  trades: { name_es: string; name_en: string } | null;
  pueblos: { name: string } | null;
  handyman_portfolio_photos: ProjectPhoto[];
};
type CertificationRow = { id: string; title: string; issuing_org: string | null };
type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  published_at: string;
  author_first_name: string | null;
};

// handyman_public_reviews() fetches every published review in one go (fine
// at pilot scale, same "filter/cap client-side" convention as the rest of
// this app -- see browse.tsx) -- this is only a render cap, so a popular
// handyman's profile doesn't grow forever. Ordered newest-first server-side,
// so the visible ones are always the most recent.
const REVIEWS_CAP = 3;

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
  // null = not loaded, or the load failed -- the whole Reviews section is
  // hidden then, rather than wrongly claiming "No reviews yet".
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  // Local presentation state only, same pattern as showAllReviews above --
  // no query, no persisted preference. bioTruncated only flips true once
  // onTextLayout reports more lines than the 3-line clamp actually shows, so
  // a short bio never gets a pointless "Read more" that does nothing.
  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioTruncated, setBioTruncated] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Sections that failed to load. They used to just disappear, which on a
  // page clients use to decide who to hire reads as "no reviews", "no
  // portfolio", "no certifications".
  const [partialErrors, setPartialErrors] = useState<Record<string, string>>({});

  const notePartial = useCallback((key: string, message: string | null) => {
    if (message) console.error(`Handyman profile: ${key} failed to load:`, message);
    setPartialErrors((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }, []);

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
      .then(({ data, error }) => {
        if (!isMounted) return;
        // A failure used to read as "Handyman not found".
        if (error) {
          console.error('Handyman profile failed to load:', error.message);
          setLoadError(error.message);
        }
        setProfile(error ? null : ((data as HandymanProfileRow | null) ?? null));
      });

    supabase
      .from('handyman_trades')
      .select('trades(slug, name_es, name_en)')
      .eq('handyman_id', id)
      .then(({ data, error }) => {
        if (!isMounted) return;
        notePartial('trades', error?.message ?? null);
        if (!error) setTrades((data as unknown as TradeRow[] | null) ?? []);
      });

    supabase
      .from('handyman_pueblos')
      .select('pueblos(slug, name)')
      .eq('handyman_id', id)
      .then(({ data, error }) => {
        if (!isMounted) return;
        notePartial('pueblos', error?.message ?? null);
        if (!error) setPueblos((data as unknown as PuebloRow[] | null) ?? []);
      });

    supabase
      .from('handyman_portfolio_projects')
      .select(
        'id, title, trades(name_es, name_en), pueblos(name), handyman_portfolio_photos(photo_url, sort_order)'
      )
      .eq('handyman_id', id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isMounted) return;
        notePartial('portfolio', error?.message ?? null);
        if (!error) setProjects((data as unknown as ProjectRow[] | null) ?? []);
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
      .then(({ data, error }) => {
        if (!isMounted) return;
        notePartial('certifications', error?.message ?? null);
        if (!error) setCertifications(data ?? []);
      });

    // Published client reviews of this handyman, with the reviewer's FIRST
    // name only -- handyman_public_reviews() does the split server-side, so
    // the last name never reaches the device (20261011000000). It also
    // filters on published_at: reviews_select alone would still let an
    // author see their own unpublished review before the blind window
    // closes. No author id comes back, so nothing here can link to the
    // reviewer's profile.
    supabase.rpc('handyman_public_reviews', { p_handyman_id: id }).then(({ data, error }) => {
      if (!isMounted) return;
      notePartial('reviews', error?.message ?? null);
      if (error) return;
      setReviews((data as ReviewRow[] | null) ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [id, notePartial]);

  if (profile === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <LoadingState label={t('common.loading')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (profile === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <EmptyState
            icon="alert-circle-outline"
            title={loadError !== null ? t('common.loadError', { error: loadError }) : t('handymanPublicProfile.notFound')}
          />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const averageRating =
    reviews && reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const tradeItems = trades
    .map((row) =>
      row.trades
        ? { slug: row.trades.slug, name: language === 'en' ? row.trades.name_en : row.trades.name_es }
        : null
    )
    .filter((item): item is { slug: string; name: string } => !!item);
  const puebloNames = pueblos
    .map((row) => row.pueblos?.name)
    .filter((name): name is string => !!name);
  const puebloSlugs = new Set(pueblos.map((row) => row.pueblos?.slug).filter((slug): slug is string => !!slug));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerColumn}>
            <View style={styles.heroWrapper}>
              {profile.avatar_url ? (
                <Pressable onPress={() => setAvatarViewerOpen(true)} style={styles.avatarTouchable}>
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" />
                </Pressable>
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="screenTitle" themeColor="textSecondary">
                    {profile.full_name.trim().charAt(0).toUpperCase() || '?'}
                  </ThemedText>
                </View>
              )}
              {/* Same coral verified treatment as before -- only its position
                  changed (overlaid on the photo, mockup-style, bottom-left)
                  per client request. Still gated on the exact same
                  `profile.is_verified` flag; never turned green. */}
              {profile.is_verified && (
                <View style={[styles.verifiedBadge, { backgroundColor: theme.background }]}>
                  <Ionicons name="shield-checkmark" size={13} color={theme.accent} />
                  <ThemedText type="smallBold" themeColor="accent">
                    {t('handymanPublicProfile.verified')}
                  </ThemedText>
                </View>
              )}
            </View>

            <ThemedText type="subtitle" style={styles.centeredText} numberOfLines={2}>
              {profile.full_name}
            </ThemedText>
            {reviews && reviews.length > 0 && (
              <View style={[styles.ratingRow, styles.centerRow]}>
                <StarDisplay rating={averageRating} />
                <ThemedText type="small" themeColor="textSecondary">
                  {t('handymanPublicProfile.ratingSummary', {
                    average: averageRating.toFixed(1),
                    count: reviews.length,
                  })}
                </ThemedText>
              </View>
            )}

            {/* Quick-glance stat row, in ADDITION to (not instead of) the
                full PuebloMapThumbnail section further down -- that section
                keeps its map + See list/Hide list toggle exactly as it was.
                Same data already computed below (years_experience,
                puebloNames), no new query. Either side hides independently
                if that data isn't there; the whole row hides if neither is. */}
            {(profile.years_experience !== null || puebloNames.length > 0) && (
              <View style={styles.infoRow}>
                {puebloNames.length > 0 && (
                  <View style={styles.infoItem}>
                    <Ionicons name="location-outline" size={15} color={theme.textSecondary} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('handymanPublicProfile.puebloCount', { count: puebloNames.length })}
                    </ThemedText>
                  </View>
                )}
                {profile.years_experience !== null && (
                  <View style={styles.infoItem}>
                    <Ionicons name="briefcase-outline" size={15} color={theme.textSecondary} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('handymanPublicProfile.yearsExperience', { count: profile.years_experience })}
                    </ThemedText>
                  </View>
                )}
              </View>
            )}
          </View>

          {Object.keys(partialErrors).length > 0 && (
            <ThemedText type="small" style={[styles.errorText, { color: theme.error }]}>
              {t('common.partialLoadError', { error: Object.values(partialErrors).join('; ') })}
            </ThemedText>
          )}

          <View style={styles.actionsRow}>
            <PrimaryButton
              style={styles.inviteButton}
              label={t('handymanPublicProfile.inviteToQuote')}
              onPress={() => router.push(`/invite/${profile.id}`)}
            />
            {saved !== null && (
              <Pressable
                onPress={toggleSaved}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={saved ? t('handymanPublicProfile.unsave') : t('handymanPublicProfile.save')}
                style={[styles.heartButton, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons
                  name={saved ? 'heart' : 'heart-outline'}
                  size={24}
                  color={saved ? theme.error : theme.textSecondary}
                />
              </Pressable>
            )}
          </View>

          {profile.bio && (
            <View style={styles.section}>
              <SectionHeader title={t('handymanPublicProfile.aboutTitle')} />
              <ThemedText
                type="default"
                numberOfLines={bioExpanded ? undefined : 3}
                onTextLayout={(e) => {
                  if (!bioExpanded && e.nativeEvent.lines.length > 3) setBioTruncated(true);
                }}>
                {profile.bio}
              </ThemedText>
              {bioTruncated && (
                <Pressable onPress={() => setBioExpanded((v) => !v)}>
                  <ThemedText type="small" themeColor="tint">
                    {bioExpanded ? t('handymanPublicProfile.readLess') : t('handymanPublicProfile.readMore')}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          )}

          {(profile.instagram_url || profile.facebook_url) && (
            <View style={styles.socialRow}>
              {profile.instagram_url && (
                <Pressable
                  onPress={() => Linking.openURL(profile.instagram_url!)}
                  accessibilityRole="link"
                  accessibilityLabel={t('handymanPublicProfile.instagram')}
                  style={[styles.socialButton, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="logo-instagram" size={24} color="#E4405F" />
                </Pressable>
              )}
              {profile.facebook_url && (
                <Pressable
                  onPress={() => Linking.openURL(profile.facebook_url!)}
                  accessibilityRole="link"
                  accessibilityLabel={t('handymanPublicProfile.facebook')}
                  style={[styles.socialButton, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="logo-facebook" size={24} color="#1877F2" />
                </Pressable>
              )}
            </View>
          )}

          {tradeItems.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title={t('handymanPublicProfile.tradesTitle')} />
              <View style={styles.tradeGrid}>
                {tradeItems.map((item) => (
                  <Card key={item.slug} style={styles.tradeCard}>
                    <ServiceIcon slug={item.slug} size={36} />
                    <ThemedText type="smallBold" style={styles.tradeLabel}>
                      {item.name}
                    </ThemedText>
                  </Card>
                ))}
              </View>
            </View>
          )}

          {puebloNames.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title={t('handymanPublicProfile.pueblosTitle')} />
              <PuebloMapThumbnail selectedSlugs={puebloSlugs} names={puebloNames} />
            </View>
          )}

          {reviews !== null && (
            <View style={styles.section}>
              <SectionHeader title={t('handymanPublicProfile.reviewsTitle')} />
              {reviews.length === 0 ? (
                <ThemedText type="default" themeColor="textSecondary">
                  {t('handymanPublicProfile.noReviews')}
                </ThemedText>
              ) : (
                <>
                  {(showAllReviews ? reviews : reviews.slice(0, REVIEWS_CAP)).map((review) => (
                    <Card key={review.id} style={styles.reviewCard}>
                      {/* Plain text on purpose -- never a Link or Pressable to
                          the reviewer's profile (client's rule). */}
                      <ThemedText type="smallBold">
                        {review.author_first_name ?? t('handymanPublicProfile.reviewerFallback')}
                      </ThemedText>
                      <View style={styles.ratingRow}>
                        <StarDisplay rating={review.rating} />
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatRelativeTime(review.published_at, t)}
                        </ThemedText>
                      </View>
                      {review.comment && <ThemedText type="default">{review.comment}</ThemedText>}
                    </Card>
                  ))}
                  {reviews.length > REVIEWS_CAP && (
                    <Pressable onPress={() => setShowAllReviews((prev) => !prev)}>
                      <ThemedText type="small" themeColor="tint">
                        {showAllReviews
                          ? t('handymanPublicProfile.showFewerReviews')
                          : t('handymanPublicProfile.showAllReviews', { count: reviews.length })}
                      </ThemedText>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          )}

          {projects.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title={t('handymanPublicProfile.portfolioTitle')} />
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
                    <Pressable>
                      <Card style={styles.projectCard}>
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
                          <ThemedText type="smallBold" numberOfLines={1}>
                            {project.title}
                          </ThemedText>
                          {subtitle.length > 0 && (
                            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                              {subtitle}
                            </ThemedText>
                          )}
                          <View style={styles.metaRow}>
                            <Ionicons name="images-outline" size={12} color={theme.textSecondary} />
                            <ThemedText type="small" themeColor="textSecondary">
                              {t('portfolio.photoCount', { count: project.handyman_portfolio_photos.length })}
                            </ThemedText>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                      </Card>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          )}

          {certifications.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title={t('handymanPublicProfile.certificationsTitle')} />
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
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  // Vertical, centered header per client feedback 2026-09-25: large photo on
  // top, identity stacked and centered underneath (name -> rating ->
  // verified -> experience), replacing the earlier horizontal
  // photo-beside-info row.
  headerColumn: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  centeredText: {
    textAlign: 'center',
  },
  // Merged onto ratingRow/verifiedRow/metaRow ONLY in this header context --
  // metaRow is also used left-aligned inside portfolio project rows below,
  // so the shared style itself stays untouched.
  centerRow: {
    justifyContent: 'center',
  },
  // Wide landscape hero photo, not a circle or a small square, per client
  // feedback 2026-09-25 -- a Facebook-cover-photo-style focal point spanning
  // the same width as everything else on the screen (this View's own
  // padding, from `safeArea` below, already gives it the normal side
  // margins -- no separate margin needed here).
  // Wraps the photo/placeholder so the verified badge (position: absolute)
  // can overlay it. The negative horizontal margin cancels safeArea's own
  // `padding: Spacing.four` for this one element only, so the photo reaches
  // the true screen edges (Facebook-cover-photo style) while every other
  // section keeps the normal padded content width -- this app is
  // portrait-only (app.json), so there's no nonzero left/right safe-area
  // inset to worry about clipping into here.
  heroWrapper: {
    width: '100%',
    marginHorizontal: -Spacing.four,
    position: 'relative',
  },
  avatarTouchable: {
    width: '100%',
  },
  avatar: {
    width: '100%',
    aspectRatio: 16 / 9,
    // No radius -- a rounded corner flush against the screen's true edge
    // doesn't read as "rounded", it reads as a gap. Edge-to-edge means
    // square corners.
    borderRadius: 0,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same coral pill as verifiedRow used to be, just overlaid bottom-left on
  // the photo instead of stacked below it. Solid theme.background (not a
  // translucent tint) so the coral text stays legible over any photo.
  verifiedBadge: {
    position: 'absolute',
    left: Spacing.two,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    ...CardShadow,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  // Invite to Quote + the favorite heart, side by side -- the heart's own
  // marginTop is zeroed so it lines up with PrimaryButton's, whose default
  // marginTop otherwise sits Spacing.two lower than a plain View.
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  inviteButton: {
    flex: 1,
    marginTop: 0,
  },
  heartButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  socialButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  tradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // 2-column rectangular cards, per client feedback 2026-09-25: the earlier
  // compact icon-above-label chip truncated long trade names ("HVAC / Air
  // Conditioning", "Concrete / Masonry") with an ellipsis. No numberOfLines
  // and no fixed height here on purpose -- the card grows to fit however
  // many lines a trade name needs, so nothing can ever truncate again.
  tradeCard: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tradeLabel: {
    flex: 1,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  projectCover: {
    width: 64,
    height: 64,
    borderRadius: Radius.small,
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
  errorText: {
    // color set inline via theme.error
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  reviewCard: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  certRow: {
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
});
