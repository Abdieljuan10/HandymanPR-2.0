import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { PhotoViewer } from '@/components/photo-viewer';
import { SectionHeader } from '@/components/section-header';
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
        <Card style={styles.identityCard}>
          {profile?.avatar_url ? (
            <Pressable onPress={() => setAvatarViewerOpen(true)}>
              <Avatar uri={profile.avatar_url} name={profile?.full_name} size={100} />
            </Pressable>
          ) : (
            <Avatar uri={null} name={profile?.full_name} size={100} />
          )}
          <ThemedText type="cardTitle">
            {profile?.full_name ?? (loadError !== null ? '' : t('common.loading'))}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {session?.user.email}
          </ThemedText>
        </Card>

        {loadError !== null && (
          <ThemedText type="small" style={{ color: theme.error }}>
            {t('common.loadError', { error: loadError })}
          </ThemedText>
        )}

        <View style={styles.section}>
          <SectionHeader title={t('clientProfile.accountSection')} />
          <View style={styles.actionList}>
            <Link href="/profile-edit" asChild>
              <Pressable style={({ pressed }) => pressed && styles.rowPressed}>
                <Card style={styles.actionRow}>
                  <View style={styles.actionRowLeft}>
                    <Ionicons name="pencil-outline" size={20} color={theme.tint} />
                    <ThemedText type="default">{t('clientProfile.editProfile')}</ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                </Card>
              </Pressable>
            </Link>
            <Link href="/profile-settings" asChild>
              <Pressable style={({ pressed }) => pressed && styles.rowPressed}>
                <Card style={styles.actionRow}>
                  <View style={styles.actionRowLeft}>
                    <Ionicons name="settings-outline" size={20} color={theme.tint} />
                    <ThemedText type="default">{t('common.settings')}</ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                </Card>
              </Pressable>
            </Link>
          </View>
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
    gap: Spacing.four,
  },
  identityCard: {
    alignItems: 'center',
    gap: Spacing.one,
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
