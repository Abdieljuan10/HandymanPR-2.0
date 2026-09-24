import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PasswordField } from '@/components/password-field';
import { PrimaryButton } from '@/components/primary-button';
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
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen style={styles.keyboardScreen}>
          <ThemedText type="subtitle" style={styles.title}>
            {t('clientSignUp.title')}
          </ThemedText>

          {needsConfirmation ? (
            <ThemedText type="default">
              {t('clientSignUp.confirmationSent', { email })}
            </ThemedText>
          ) : (
            <>
              <FormField label={t('clientSignUp.fullName')} value={fullName} onChangeText={setFullName} />
              <FormField
                label={t('clientSignUp.email')}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <PasswordField
                label={t('clientSignUp.password')}
                value={password}
                onChangeText={setPassword}
                textContentType="newPassword"
              />
              <PasswordField
                label={t('clientSignUp.confirmPassword')}
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
            <ThemedText type="link" themeColor="textSecondary">
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
});
