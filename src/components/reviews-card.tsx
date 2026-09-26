import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { SectionHeader } from '@/components/section-header';
import { StarDisplay } from '@/components/star-display';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type ReviewRow = {
  id: string;
  author_id: string | null;
  rating: number;
  comment: string | null;
  published_at: string | null;
};

type ReviewsCardProps = {
  jobId: string;
  myId: string;
  reviews: ReviewRow[];
  otherPartyLabel: string;
};

// Blind until both sides submit or the 7-day window closes -- see
// TODO.md's "Reviews" entry. myReview/otherReview both come from the same
// query; RLS (reviews_select) already hides the other party's row unless
// published_at is set, so "otherReview is missing" and "not published yet"
// are the same signal from the client's point of view.
//
// 2026-09-26: visual restyle only (Job Details redesign) -- review
// submission/publication logic is untouched; this component doesn't submit
// anything itself, only links to the existing review screen.
export function ReviewsCard({ jobId, myId, reviews, otherPartyLabel }: ReviewsCardProps) {
  const { t } = useTranslation();

  const myReview = reviews.find((r) => r.author_id === myId);
  const otherReview = reviews.find((r) => r.author_id !== myId);

  return (
    <Card style={styles.card}>
      <SectionHeader title={t('reviews.cardTitle')} />

      {!myReview && (
        <Link href={`/job/${jobId}/review`} asChild>
          <PrimaryButton label={t('reviews.leaveButton')} />
        </Link>
      )}

      {myReview && (
        <>
          <View style={styles.ratingRow}>
            <ThemedText type="default">{t('reviews.yourReview')}</ThemedText>
            <StarDisplay rating={myReview.rating} />
          </View>
          {myReview.comment && (
            <ThemedText type="small" themeColor="textSecondary">
              {myReview.comment}
            </ThemedText>
          )}

          {!myReview.published_at && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('reviews.pending')}
            </ThemedText>
          )}

          {myReview.published_at && otherReview && (
            <>
              <View style={styles.ratingRow}>
                <ThemedText type="default">{t('reviews.theirReview', { party: otherPartyLabel })}</ThemedText>
                <StarDisplay rating={otherReview.rating} />
              </View>
              {otherReview.comment && (
                <ThemedText type="small" themeColor="textSecondary">
                  {otherReview.comment}
                </ThemedText>
              )}
            </>
          )}

          {myReview.published_at && !otherReview && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('reviews.noOtherReview')}
            </ThemedText>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
