import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type OpenJobRow = {
  id: string;
  title: string;
  created_at: string;
  pueblos: { name: string } | null;
  job_invitations: { handyman_id: string }[];
  bids: { handyman_id: string }[];
};

// Reached from "Invite to Quote" on a handyman's public profile. Two ways
// to invite: to one of the client's already-posted public jobs (a
// job_invitations row -- the job stays public for everyone else, see
// 20261009000000_job_invitations.sql), or a brand-new private job
// (invite/[handymanId]/new, posted invite_only). The server re-checks every
// rule below (open, public, not already bid, one per handyman, cap of 10);
// the states shown here are just so the client doesn't tap into an error.
export default function InviteChooserScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { handymanId } = useLocalSearchParams<{ handymanId: string }>();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [jobs, setJobs] = useState<OpenJobRow[] | null>(null);
  const [invitingJobId, setInvitingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !handymanId) return;
    const [{ data: profile, error: profileError }, { data: jobsData, error: jobsError }] = await Promise.all([
      supabase.from('handyman_profiles').select('full_name').eq('id', handymanId).maybeSingle(),
      supabase
        .from('jobs')
        // bids!job_id: jobs <-> bids is linked twice (bids.job_id and
        // jobs.hired_bid_id), so an unhinted bids(...) embed is ambiguous.
        .select('id, title, created_at, pueblos(name), job_invitations(handyman_id), bids!job_id(handyman_id)')
        .eq('client_id', session.user.id)
        .eq('status', 'open')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false }),
    ]);
    if (profileError) console.error('Failed to load handyman:', profileError.message);
    if (jobsError) {
      console.error('Failed to load open jobs:', jobsError.message);
      setError(jobsError.message);
    }
    setName(profile?.full_name ?? null);
    setJobs((jobsData as unknown as OpenJobRow[] | null) ?? []);
  }, [session, handymanId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleInvite(jobId: string) {
    setError(null);
    setInvitingJobId(jobId);
    const { error: insertError } = await supabase
      .from('job_invitations')
      .insert({ job_id: jobId, handyman_id: handymanId });
    setInvitingJobId(null);
    if (insertError) {
      console.error('Failed to invite handyman:', insertError.message);
      setError(insertError.message);
      return;
    }
    await load();
  }

  if (name === undefined || jobs === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (name === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="default">{t('handymanPublicProfile.notFound')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <FlatList
          showsVerticalScrollIndicator={false}
          data={jobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="subtitle">{t('inviteChooser.title', { name })}</ThemedText>
              <PrimaryButton
                label={t('inviteChooser.newPrivateJob')}
                variant="secondary"
                onPress={() => router.push(`/invite/${handymanId}/new`)}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {t('inviteChooser.newPrivateJobHint', { name })}
              </ThemedText>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                {t('inviteChooser.openJobsTitle')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('inviteChooser.openJobsHint', { name })}
              </ThemedText>
              {error && (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              )}
            </View>
          }
          ListEmptyComponent={
            <ThemedText type="default" themeColor="textSecondary">
              {t('inviteChooser.noOpenJobs')}
            </ThemedText>
          }
          renderItem={({ item }) => {
            const alreadyInvited = item.job_invitations.some((row) => row.handyman_id === handymanId);
            const alreadyBid = item.bids.some((row) => row.handyman_id === handymanId);
            const disabled = alreadyInvited || alreadyBid || invitingJobId !== null;
            const status = alreadyInvited
              ? t('inviteChooser.invited')
              : alreadyBid
                ? t('inviteChooser.alreadyBid')
                : invitingJobId === item.id
                  ? t('inviteChooser.inviting')
                  : t('inviteChooser.invite');
            return (
              <Pressable disabled={disabled} onPress={() => handleInvite(item.id)}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <View style={styles.cardText}>
                    <ThemedText type="default">{item.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.pueblos?.name} · {formatRelativeTime(item.created_at, t)}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" themeColor={alreadyInvited || alreadyBid ? 'textSecondary' : 'tint'}>
                    {status}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            );
          }}
        />
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
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
  error: {
    color: '#d64545',
  },
});
