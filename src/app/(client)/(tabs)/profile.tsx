import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/providers/session-provider';

// Was a bare PlaceholderScreen (whose own subtitle WAS the page title);
// hand-rolled directly now so AppHeader can own the title instead, matching
// every other top-level tab screen (visual pass 2026-09-24).
export default function ClientProfileScreen() {
  const { t } = useTranslation();
  const { session } = useSession();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('clientProfile.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <ThemedText type="default" themeColor="textSecondary">
          {t('clientProfile.description', { email: session?.user.email })}
        </ThemedText>
        <Link href="/profile-settings" asChild>
          <PrimaryButton label={t('common.settings')} variant="secondary" />
        </Link>
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
    gap: Spacing.three,
  },
});
