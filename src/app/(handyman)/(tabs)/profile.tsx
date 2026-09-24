import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { PhotoViewer } from '@/components/photo-viewer';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

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
          <View style={styles.headerRow}>
            {profile?.avatar_url ? (
              <Pressable onPress={() => setAvatarViewerOpen(true)}>
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              </Pressable>
            ) : (
              <View
                style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="title" themeColor="textSecondary">
                  {profile?.full_name?.trim().charAt(0).toUpperCase() || '?'}
                </ThemedText>
              </View>
            )}
            <View style={styles.headerText}>
              <ThemedText type="subtitle">{profile?.full_name ?? (loadError !== null ? '' : t('common.loading'))}</ThemedText>
              {profile?.is_verified && (
                <ThemedText type="small" themeColor="tint">
                  {t('handymanPublicProfile.verified')}
                </ThemedText>
              )}
              {profile?.years_experience != null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('handymanPublicProfile.yearsExperience', { count: profile.years_experience })}
                </ThemedText>
              )}
            </View>
          </View>

          {loadError !== null ? (
            <ThemedText type="small" style={styles.error}>
              {t('common.loadError', { error: loadError })}
            </ThemedText>
          ) : (
            <ThemedText type="default" themeColor={profile?.bio ? 'text' : 'textSecondary'}>
              {profile?.bio || t('handymanProfile.noBio')}
            </ThemedText>
          )}

          <View style={styles.actions}>
            <Link href="/profile-edit" asChild>
              <PrimaryButton label={t('handymanProfile.editProfile')} />
            </Link>
            <Link href="/portfolio" asChild>
              <PrimaryButton label={t('handymanProfile.portfolio')} variant="secondary" />
            </Link>
            <Link href="/certifications" asChild>
              <PrimaryButton label={t('handymanProfile.certifications')} variant="secondary" />
            </Link>
            <Link href="/trades" asChild>
              <PrimaryButton label={t('handymanProfile.editTrades')} variant="secondary" />
            </Link>
            <Link href="/pueblos" asChild>
              <PrimaryButton label={t('handymanProfile.editPueblos')} variant="secondary" />
            </Link>
            <Link href="/profile-settings" asChild>
              <PrimaryButton label={t('common.settings')} variant="secondary" />
            </Link>
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
    gap: Spacing.three,
    paddingBottom: BottomTabInset,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    gap: Spacing.half,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  error: {
    color: '#d64545',
  },
});
