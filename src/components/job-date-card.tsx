import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { DateInput } from '@/components/date-input';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type JobDateCardProps = {
  jobId: string;
  myId: string;
  agreedDate: string | null;
  proposedDate: string | null;
  proposedBy: string | null;
  otherPartyLabel: string;
  onChanged: () => void | Promise<void>;
};

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Minimal mutual agreed-date, not full scheduling -- see TODO.md. Mutuality
// is enforced server-side (confirm_job_date rejects confirming your own
// proposal); hiding the Confirm button when it's your own proposal is
// belt-and-suspenders on top of that.
export function JobDateCard({
  jobId,
  myId,
  agreedDate,
  proposedDate,
  proposedBy,
  otherPartyLabel,
  onChanged,
}: JobDateCardProps) {
  const { t } = useTranslation();
  const [proposing, setProposing] = useState(false);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMyProposal = proposedDate !== null && proposedBy === myId;
  const isTheirProposal = proposedDate !== null && proposedBy !== null && proposedBy !== myId;

  async function handlePropose() {
    if (!pendingDate) return;
    setSubmitting(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('propose_job_date', { p_job_id: jobId, p_date: pendingDate });
    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setProposing(false);
    setPendingDate(null);
    await onChanged();
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('confirm_job_date', { p_job_id: jobId });
    setConfirming(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await onChanged();
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{t('jobDate.title')}</ThemedText>

      {agreedDate && <ThemedText type="default">{t('jobDate.agreed', { date: formatDate(agreedDate) })}</ThemedText>}

      {proposedDate && proposedBy === myId && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('jobDate.yourProposal', { date: formatDate(proposedDate) })}
        </ThemedText>
      )}

      {proposedDate && proposedBy !== null && proposedBy !== myId && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('jobDate.theirProposal', { party: otherPartyLabel, date: formatDate(proposedDate) })}
        </ThemedText>
      )}

      {!agreedDate && !proposedDate && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('jobDate.none')}
        </ThemedText>
      )}

      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}

      {isTheirProposal && (
        <PrimaryButton label={t('jobDate.confirm')} loading={confirming} onPress={handleConfirm} />
      )}

      {!proposing ? (
        <PrimaryButton
          label={agreedDate || proposedDate ? t('jobDate.proposeDifferent') : t('jobDate.propose')}
          variant="secondary"
          onPress={() => setProposing(true)}
        />
      ) : (
        <ThemedView style={styles.proposeForm}>
          <DateInput onChange={setPendingDate} />
          <PrimaryButton label={t('jobDate.submitProposal')} loading={submitting} onPress={handlePropose} />
          <PrimaryButton
            label={t('jobDate.cancelPropose')}
            variant="secondary"
            onPress={() => {
              setProposing(false);
              setPendingDate(null);
            }}
          />
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  proposeForm: {
    gap: Spacing.one,
  },
  error: {
    color: '#d64545',
  },
});
