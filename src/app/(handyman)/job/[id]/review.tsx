import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/primary-button';
import { StarRating } from '@/components/star-rating';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function HandymanReviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!id) return;
    if (!rating) {
      setError(t('reviews.errors.rating'));
      return;
    }
    setError(null);
    setSubmitting(true);

    const { error: insertError } = await supabase
      .from('reviews')
      .insert({ job_id: id, author_role: 'handyman', rating, comment: comment.trim() || null });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <ThemedText type="subtitle">{t('reviews.title')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('reviews.blindNotice')}
            </ThemedText>

            <StarRating value={rating} onChange={setRating} />

            <FormField
              label={t('reviews.commentLabel')}
              value={comment}
              onChangeText={setComment}
              placeholder={t('reviews.commentPlaceholder')}
              multiline
              numberOfLines={4}
              style={styles.multiline}
            />

            {error && (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            )}

            <PrimaryButton label={t('reviews.submit')} loading={submitting} onPress={handleSubmit} />
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
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  error: {
    color: '#d64545',
  },
});
