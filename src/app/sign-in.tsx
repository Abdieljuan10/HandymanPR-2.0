import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PasswordField } from '@/components/password-field';
import { PrimaryButton } from '@/components/primary-button';
import { ScrollingToolsBackground } from '@/components/scrolling-tools-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    }
    // On success, the root layout's session listener picks up the new
    // session and routes to the right (client) or (handyman) tabs.
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollingToolsBackground />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen style={styles.keyboardScreen}>
          <Image style={styles.logo} source={require('@/assets/images/icon.png')} />

          <ThemedText type="subtitle" style={[styles.title, styles.lockedText]}>
            {t('signIn.title')}
          </ThemedText>

          <FormField
            label={t('signIn.email')}
            labelColor="#000000"
            style={styles.fieldBox}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <PasswordField
            label={t('signIn.password')}
            labelColor="#000000"
            style={styles.fieldBox}
            value={password}
            onChangeText={setPassword}
            textContentType="password"
          />

          {error && (
            <ThemedText type="small" themeColor="text" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <PrimaryButton label={t('signIn.submit')} onPress={handleSignIn} loading={loading} />

          <Link href="/forgot-password" style={styles.link}>
            <ThemedText type="linkPrimary">{t('signIn.forgotPassword')}</ThemedText>
          </Link>

          <Link href="/welcome" style={styles.link}>
            <ThemedText type="link" style={styles.lockedTextSecondary}>
              {t('signIn.back')}
            </ThemedText>
          </Link>
        </KeyboardAvoidingScreen>
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
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  keyboardScreen: {
    justifyContent: 'center',
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    marginBottom: Spacing.four,
  },
  error: {
    color: '#d64545',
    marginBottom: Spacing.two,
  },
  link: {
    marginTop: Spacing.three,
    alignSelf: 'center',
  },
  // This screen's background is always the light tools pattern regardless
  // of device color scheme -- see the matching comment in welcome.tsx.
  lockedText: {
    color: '#000000',
  },
  lockedTextSecondary: {
    color: '#60646C',
  },
  // The default input fill (theme.backgroundElement, a near-white grey) is
  // too close in tone to the pattern's own pale mint base to read as a
  // distinct box -- white + a visible border fixes that on this background
  // specifically without touching FormField's default look everywhere else.
  fieldBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: 'rgba(14, 122, 130, 0.35)',
  },
});
