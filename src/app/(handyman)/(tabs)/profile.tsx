import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { PhotoViewer } from '@/components/photo-viewer';
import { SectionHeader } from '@/components/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, CardShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

// Local to this screen only -- a "management hub" tappable row (icon, label,
// chevron) for the PROFILE/SHOWCASE/ACCOUNT sections below. Not a shared
// component: nothing else in the app needs this exact icon+label+chevron
// shape yet, and the client Profile tab inlines its own two rows directly.
type AccountRowProps = {
  href: Parameters<typeof Link>[0]['href'];
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function AccountRow({ href, icon, label }: AccountRowProps) {
  const theme = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable style={({ pressed }) => pressed && styles.rowPressed}>
        <Card style={styles.actionRow}>
          <View style={styles.actionRowLeft}>
            <Ionicons name={icon} size={20} color={theme.tint} />
            <ThemedText type="default">{label}</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </Card>
      </Pressable>
    </Link>
  );
}

type OwnProfile = {
  full_name: string;
  bio: string | null;
  years_experience: number | null;
  avatar_url: string | null;
  is_verified: boolean;
};

export default function HandymanProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useSession();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refetch on focus (not just mount) so coming back from Edit Profile shows
  // the change immediately, without needing a whole list/pull-to-refresh setup.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let isMounted = true;

      supabase
        .from('handyman_profiles')
        .select('full_name, bio, years_experience, avatar_url, is_verified')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!isMounted) return;
          // A failure used to leave the name reading "Loading..." forever.
          // Keep whatever was shown before and say what went wrong.
          if (error) {
            console.error('Own profile failed to load:', error.message);
            setLoadError(error.message);
            return;
          }
          setLoadError(null);
          setProfile((data as OwnProfile | null) ?? null);
        });

      return () => {
        isMounted = false;
      };
    }, [session])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('handymanProfile.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Card style={styles.identityCard}>
            {profile?.avatar_url ? (
              <Pressable onPress={() => setAvatarViewerOpen(true)}>
                <Avatar uri={profile.avatar_url} name={profile?.full_name} size={100} />
              </Pressable>
            ) : (
              <Avatar uri={null} name={profile?.full_name} size={100} />
            )}
            <ThemedText type="cardTitle" style={styles.centeredText}>
              {profile?.full_name ?? (loadError !== null ? '' : t('common.loading'))}
            </ThemedText>

            {profile?.is_verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="shield-checkmark" size={13} color={theme.accent} />
                <ThemedText type="smallBold" themeColor="accent">
                  {t('handymanPublicProfile.verified')}
                </ThemedText>
              </View>
            )}

            {profile?.years_experience != null && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('handymanPublicProfile.yearsExperience', { count: profile.years_experience })}
              </ThemedText>
            )}

            {loadError !== null ? (
              <ThemedText type="small" style={{ color: theme.error }}>
                {t('common.loadError', { error: loadError })}
              </ThemedText>
            ) : (
              <ThemedText
                type="default"
                themeColor={profile?.bio ? 'text' : 'textSecondary'}
                style={styles.centeredText}>
                {profile?.bio || t('handymanProfile.noBio')}
              </ThemedText>
            )}
          </Card>

          <View style={styles.section}>
            <SectionHeader title={t('handymanProfile.profileSection')} />
            <View style={styles.actionList}>
              <AccountRow href="/profile-edit" icon="pencil-outline" label={t('handymanProfile.editProfile')} />
              <AccountRow href="/trades" icon="hammer-outline" label={t('handymanProfile.editTrades')} />
              <AccountRow href="/pueblos" icon="location-outline" label={t('handymanProfile.editPueblos')} />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title={t('handymanProfile.showcaseSection')} />
            <View style={styles.actionList}>
              <AccountRow href="/portfolio" icon="images-outline" label={t('handymanProfile.portfolio')} />
              <AccountRow
                href="/certifications"
                icon="ribbon-outline"
                label={t('handymanProfile.certifications')}
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title={t('handymanProfile.accountSection')} />
            <View style={styles.actionList}>
              <AccountRow href="/profile-settings" icon="settings-outline" label={t('common.settings')} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {profile?.avatar_url && (
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
    paddingBottom: BottomTabInset,
  },
  identityCard: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  centeredText: {
    textAlign: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    ...CardShadow,
  },
  section: {
    gap: Spacing.one,
  },
  actionList: {
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowPressed: {
    opacity: 0.7,
  },
});
