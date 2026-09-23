import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from '@/lib/push-notifications';

export type AccountRole = 'client' | 'handyman';

type SessionContextValue = {
  session: Session | null;
  role: AccountRole | null;
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  role: null,
  isLoading: true,
});

export function useSession() {
  return useContext(SessionContext);
}

async function lookUpRole(userId: string): Promise<AccountRole | null> {
  const [{ data: client }, { data: handyman }] = await Promise.all([
    supabase.from('client_profiles').select('id').eq('id', userId).maybeSingle(),
    supabase.from('handyman_profiles').select('id').eq('id', userId).maybeSingle(),
  ]);

  if (client) return 'client';
  if (handyman) return 'handyman';
  return null;
}

// Sign-up screens stash { pending_role, full_name } in the auth user's own
// metadata when they call supabase.auth.signUp(). If Supabase is configured
// to require email confirmation, there's no session (and so no way to pass
// an RLS check) until the user actually confirms and logs in later — so the
// profile row can't be created at sign-up time. Instead, the FIRST time we
// ever see a session for this user with no matching profile row yet, we
// create it here from that stashed metadata. Works whether or not email
// confirmation is turned on.
async function ensureProfile(session: Session): Promise<AccountRole | null> {
  const existingRole = await lookUpRole(session.user.id);
  if (existingRole) return existingRole;

  const pendingRole = session.user.user_metadata?.pending_role as AccountRole | undefined;
  if (!pendingRole) return null;

  const fullName = (session.user.user_metadata?.full_name as string | undefined) ?? '';
  const table = pendingRole === 'client' ? 'client_profiles' : 'handyman_profiles';
  const { error } = await supabase.from(table).insert({ id: session.user.id, full_name: fullName });

  if (error) {
    console.warn('Could not create profile from pending sign-up metadata:', error.message);
    return null;
  }
  return pendingRole;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      const nextRole = data.session ? await ensureProfile(data.session) : null;
      if (!isMounted) return;
      setRole(nextRole);
      setIsLoading(false);
      if (data.session) {
        registerForPushNotifications().catch((err) =>
          console.error('Push registration failed:', err)
        );
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;
      setIsLoading(true);
      setSession(nextSession);
      const nextRole = nextSession ? await ensureProfile(nextSession) : null;
      if (!isMounted) return;
      setRole(nextRole);
      setIsLoading(false);
      if (nextSession) {
        registerForPushNotifications().catch((err) =>
          console.error('Push registration failed:', err)
        );
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, role, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}
