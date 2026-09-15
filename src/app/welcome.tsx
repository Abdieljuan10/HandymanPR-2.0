import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.hero}>
          <ThemedText type="title" style={styles.centerText}>
            {Constants.expoConfig?.name ?? 'Welcome'}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
            {t('welcome.tagline')}
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.actions}>
          <Link href="/client-sign-up" asChild>
            <PrimaryButton label={t('welcome.continueAsClient')} />
          </Link>
          <Link href="/handyman-sign-up" asChild>
            <PrimaryButton label={t('welcome.continueAsHandyman')} />
          </Link>
          <Link href="/sign-in" asChild>
            <PrimaryButton label={t('welcome.logIn')} variant="secondary" />
          </Link>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.six,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    gap: Spacing.two,
  },
  centerText: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
  },
});
