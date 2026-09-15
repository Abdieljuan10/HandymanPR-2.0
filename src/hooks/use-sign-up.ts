import { useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { AccountRole } from '@/providers/session-provider';

export function useSignUp(role: AccountRole) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function submit() {
    setError(null);
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
    fullName,
    setFullName,
    error,
    loading,
    needsConfirmation,
    submit,
  };
}
