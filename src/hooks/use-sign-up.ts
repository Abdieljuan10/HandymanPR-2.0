import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';
import type { AccountRole } from '@/providers/session-provider';

export function useSignUp(role: AccountRole) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function submit() {
    setError(null);

    // Client-side only -- Supabase never sees a "confirm" field, so nothing
    // server-side can catch a typo between the two here.
    if (password !== confirmPassword) {
      setError(t('common.passwordMismatch'));
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { pending_role: role, full_name: fullName } },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // If Supabase requires email confirmation, there's no session yet and
    // nothing more to do here. If a session came back immediately, the
    // SessionProvider's listener creates the profile row and the root
    // layout routes to the right home screen on its own.
    if (!data.session) {
      setNeedsConfirmation(true);
    }
  }

  return {
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
  };
}
