import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/primary-button';
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
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen style={styles.keyboardScreen}>
          <ThemedText type="subtitle" style={styles.title}>
            {t('signIn.title')}
          </ThemedText>

          <FormField
            label={t('signIn.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <FormField
            label={t('signIn.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
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
            <ThemedText type="link" themeColor="textSecondary">
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
});
