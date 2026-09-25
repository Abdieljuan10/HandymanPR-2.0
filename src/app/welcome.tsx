import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ScrollingToolsBackground } from '@/components/scrolling-tools-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.container}>
      <ScrollingToolsBackground />
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={[styles.hero, styles.transparent]}>
          <ThemedText type="title" style={[styles.centerText, styles.lockedText]}>
            {Constants.expoConfig?.name ?? 'Welcome'}
          </ThemedText>
          <ThemedText type="default" style={[styles.centerText, styles.lockedTextSecondary]}>
            {t('welcome.tagline')}
          </ThemedText>
        </ThemedView>

        <ThemedView style={[styles.actions, styles.transparent]}>
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
  transparent: {
    backgroundColor: 'transparent',
  },
  // This screen's background is always the light tools pattern regardless
  // of device color scheme (it's a fixed brand visual, not a themed
  // surface) -- theme.text/textSecondary would go white/light-grey in dark
  // mode and disappear against it, so these two text nodes lock to the
  // light palette's values instead of following the device theme.
  lockedText: {
    color: '#000000',
  },
  lockedTextSecondary: {
    color: '#60646C',
  },
  centerText: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
  },
});
