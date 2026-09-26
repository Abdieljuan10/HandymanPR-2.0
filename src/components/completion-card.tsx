import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
//
// 2026-09-26: visual restyle only (Job Details redesign) -- every RPC call
// and status-gating condition below is unchanged from before.
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
  const theme = useTheme();
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
      <View style={styles.wrap}>
        {error && (
          <ThemedText type="small" style={{ color: theme.error }}>
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
      </View>
    );
  }

  if (status === 'pending_completion') {
    const isMine = completionMarkedBy === myId;
    return (
      <Card style={styles.card}>
        <SectionHeader title={t('jobCompletion.cardTitle')} />
        <ThemedText type="default">
          {isMine
            ? t('jobCompletion.pendingMine', { party: otherPartyLabel })
            : t('jobCompletion.pendingTheirs', { party: otherPartyLabel })}
        </ThemedText>

        {error && (
          <ThemedText type="small" style={{ color: theme.error }}>
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
      </Card>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  card: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
