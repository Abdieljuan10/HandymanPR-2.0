import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { PhotoViewer } from '@/components/photo-viewer';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

// Was a stub (session email + a link to Settings, description text
// literally promising "name/phone/photo editing comes later"). Real look,
// matching the handyman side's own profile tab -- avatar + name up top,
// actions below. Simpler than that screen since client_profiles has no
// bio/years/trades/pueblos to show, just full_name and avatar_url.
type OwnProfile = {
  full_name: string;
  avatar_url: string | null;
};

export default function ClientProfileScreen() {
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
        .from('client_profiles')
        .select('full_name, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!isMounted) return;
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
        <AppHeader pageTitle={t('clientProfile.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.headerRow}>
          {profile?.avatar_url ? (
            <Pressable onPress={() => setAvatarViewerOpen(true)}>
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            </Pressable>
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="title" themeColor="textSecondary">
                {profile?.full_name?.trim().charAt(0).toUpperCase() || '?'}
              </ThemedText>
            </View>
          )}
          <View style={styles.headerText}>
            <ThemedText type="subtitle">
              {profile?.full_name ?? (loadError !== null ? '' : t('common.loading'))}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {session?.user.email}
            </ThemedText>
          </View>
        </View>

        {loadError !== null && (
          <ThemedText type="small" style={styles.error}>
            {t('common.loadError', { error: loadError })}
          </ThemedText>
        )}

        <View style={styles.actions}>
          <Link href="/profile-edit" asChild>
            <PrimaryButton label={t('clientProfile.editProfile')} />
          </Link>
          <Link href="/profile-settings" asChild>
            <PrimaryButton label={t('common.settings')} variant="secondary" />
          </Link>
        </View>
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
    gap: Spacing.three,
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
  // flex: 1 -- without a bounded width here, a long name has nothing to
  // wrap against and overflows past the screen edge instead (same bug as
  // the chat header and the handyman-side client profile, both already
  // fixed the same way).
  headerText: {
    flex: 1,
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
