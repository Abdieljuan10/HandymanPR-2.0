import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PasswordField } from '@/components/password-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { notify } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

// Shared by both (client) and (handyman) Settings -- same Supabase auth
// call either way, no role-specific behavior.
//
// Supabase's own updateUser({ password }) doesn't check the OLD password at
// all -- it trusts whatever session is already active. Without re-verifying
// the current password first, anyone with an unlocked, already-signed-in
// phone could change the account's password (and lock the real owner out)
// without ever having to know it. Re-auth via a fresh signInWithPassword
// call is the standard way to check it, since Supabase has no separate
// "verify password" endpoint.
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);

    // Client-side only -- Supabase never sees a "confirm" field.
    if (newPassword !== confirmPassword) {
      setError(t('common.passwordMismatch'));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t('changePassword.samePassword'));
      return;
    }
    if (!session?.user.email) {
      setError(t('changePassword.noEmail'));
      return;
    }

    setLoading(true);

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });
    if (reauthError) {
      setLoading(false);
      setError(t('changePassword.wrongCurrentPassword'));
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    notify({ title: t('changePassword.successTitle'), message: t('changePassword.successMessage') });
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingScreen style={styles.keyboardScreen}>
          <PasswordField
            label={t('changePassword.current')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            textContentType="password"
          />
          <PasswordField
            label={t('changePassword.new')}
            value={newPassword}
            onChangeText={setNewPassword}
            textContentType="newPassword"
          />
          <PasswordField
            label={t('changePassword.confirm')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            textContentType="newPassword"
          />

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <PrimaryButton label={t('changePassword.submit')} onPress={handleSubmit} loading={loading} />
        </KeyboardAvoidingScreen>
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
  keyboardScreen: {
    justifyContent: 'flex-start',
  },
  error: {
    color: '#d64545',
    marginBottom: Spacing.two,
  },
});
