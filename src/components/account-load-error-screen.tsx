import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { signOutAndUnregister } from '@/lib/push-notifications';

// Shown by the root layout when there's a session but the account's role
// couldn't be determined. Always offers a way out -- retry or log out --
// instead of the blank screen that state used to render.
export function AccountLoadErrorScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">{t('accountLoadError.title')}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          {t('accountLoadError.message')}
        </ThemedText>
        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}
        <PrimaryButton label={t('accountLoadError.retry')} onPress={onRetry} />
        <PrimaryButton label={t('common.logOut')} variant="secondary" onPress={signOutAndUnregister} />
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
    justifyContent: 'center',
  },
});
