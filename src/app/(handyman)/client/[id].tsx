import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type ClientProfileRow = {
  full_name: string;
  avatar_url: string | null;
};

export default function ClientProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<ClientProfileRow | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    supabase
      .from('client_profiles')
      .select('full_name, avatar_url')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted) setProfile((data as ClientProfileRow | null) ?? null);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (profile === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (profile === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('clientProfile.notFound')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="subtitle" themeColor="textSecondary">
                {profile.full_name.trim().charAt(0).toUpperCase() || '?'}
              </ThemedText>
            </View>
          )}
          <ThemedText type="subtitle">{profile.full_name}</ThemedText>
        </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
