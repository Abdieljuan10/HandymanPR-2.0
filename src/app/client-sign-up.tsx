import { Link } from 'expo-router';
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
import { useSignUp } from '@/hooks/use-sign-up';

export default function ClientSignUpScreen() {
  const { t } = useTranslation();
  const {
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    fullName,
    setFullName,
    error,
    loading,
    needsConfirmation,
    submit,
  } = useSignUp('client');

  return (
    <ThemedView style={styles.container}>
      <ScrollingToolsBackground />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen style={styles.keyboardScreen}>
          <ThemedText type="subtitle" style={[styles.title, styles.lockedText]}>
            {t('clientSignUp.title')}
          </ThemedText>

          {needsConfirmation ? (
            <ThemedText type="default" style={styles.lockedText}>
              {t('clientSignUp.confirmationSent', { email })}
            </ThemedText>
          ) : (
            <>
              <FormField
                label={t('clientSignUp.fullName')}
                labelColor="#000000"
                style={styles.fieldBox}
                value={fullName}
                onChangeText={setFullName}
              />
              <FormField
                label={t('clientSignUp.email')}
                labelColor="#000000"
                style={styles.fieldBox}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <PasswordField
                label={t('clientSignUp.password')}
                labelColor="#000000"
                style={styles.fieldBox}
                value={password}
                onChangeText={setPassword}
                textContentType="newPassword"
              />
              <PasswordField
                label={t('clientSignUp.confirmPassword')}
                labelColor="#000000"
                style={styles.fieldBox}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                textContentType="newPassword"
              />

              {error && (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              )}

              <PrimaryButton label={t('clientSignUp.submit')} onPress={submit} loading={loading} />
            </>
          )}

          <Link href="/welcome" style={styles.link}>
            <ThemedText type="link" style={styles.lockedTextSecondary}>
              {t('clientSignUp.back')}
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
    marginTop: Spacing.four,
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
