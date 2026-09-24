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

export default function HandymanSignUpScreen() {
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
  } = useSignUp('handyman');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen style={styles.keyboardScreen}>
          <ThemedText type="subtitle" style={styles.title}>
            {t('handymanSignUp.title')}
          </ThemedText>

          {needsConfirmation ? (
            <ThemedText type="default">
              {t('handymanSignUp.confirmationSent', { email })}
            </ThemedText>
          ) : (
            <>
              <FormField label={t('handymanSignUp.fullName')} value={fullName} onChangeText={setFullName} />
              <FormField
                label={t('handymanSignUp.email')}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <PasswordField
                label={t('handymanSignUp.password')}
                value={password}
                onChangeText={setPassword}
                textContentType="newPassword"
              />
              <PasswordField
                label={t('handymanSignUp.confirmPassword')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                textContentType="newPassword"
              />

              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                {t('handymanSignUp.hint')}
              </ThemedText>

              {error && (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              )}

              <PrimaryButton label={t('handymanSignUp.submit')} onPress={submit} loading={loading} />
            </>
          )}

          <Link href="/welcome" style={styles.link}>
            <ThemedText type="link" themeColor="textSecondary">
              {t('handymanSignUp.back')}
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
  hint: {
    marginBottom: Spacing.three,
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
