import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type CompletionCardProps = {
  jobId: string;
  myId: string;
  status: 'hired' | 'pending_completion' | 'completed' | 'open' | 'cancelled' | 'expired';
  agreedDate: string | null;
  completionMarkedBy: string | null;
  otherPartyLabel: string;
  onChanged: () => void | Promise<void>;
};

// Mutual, like the agreed date -- one side marks it, the other confirms or
// disputes, and it auto-confirms after 7 days if nobody acts. See
// TODO.md's "Job completion" entry for why: a one-sided mark-complete let
// either party lock the job and start the review window alone.
export function CompletionCard({
  jobId,
  myId,
  status,
  agreedDate,
  completionMarkedBy,
  otherPartyLabel,
  onChanged,
}: CompletionCardProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(fn: string) {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc(fn, { p_job_id: jobId });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await onChanged();
  }

  if (status === 'hired') {
    if (!agreedDate) return null;
    return (
      <ThemedView style={styles.wrap}>
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
        {new Date(agreedDate) <= new Date() ? (
          <PrimaryButton label={t('jobCompletion.markComplete')} loading={busy} onPress={() => call('mark_job_complete')} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {t('jobCompletion.hint', { date: agreedDate })}
          </ThemedText>
        )}
      </ThemedView>
    );
  }

  if (status === 'pending_completion') {
    const isMine = completionMarkedBy === myId;
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('jobCompletion.cardTitle')}</ThemedText>
        <ThemedText type="default">
          {isMine
            ? t('jobCompletion.pendingMine', { party: otherPartyLabel })
            : t('jobCompletion.pendingTheirs', { party: otherPartyLabel })}
        </ThemedText>

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        {isMine ? (
          <PrimaryButton label={t('jobCompletion.undo')} variant="secondary" loading={busy} onPress={() => call('undo_job_completion')} />
        ) : (
          <>
            <PrimaryButton label={t('jobCompletion.confirm')} loading={busy} onPress={() => call('confirm_job_completion')} />
            <PrimaryButton
              label={t('jobCompletion.dispute')}
              variant="secondary"
              loading={busy}
              onPress={() => call('dispute_job_completion')}
            />
          </>
        )}
      </ThemedView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  error: {
    color: '#d64545',
  },
});
