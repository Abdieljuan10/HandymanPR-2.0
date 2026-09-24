import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from '@/lib/push-notifications';

export type AccountRole = 'client' | 'handyman';

type SessionContextValue = {
  session: Session | null;
  role: AccountRole | null;
  isLoading: boolean;
  // Set when there IS a session but its role couldn't be determined (a
  // failed lookup, or a profile that couldn't be created). The root layout
  // shows a retry/log-out screen for it -- with a session and no role, no
  // route guard matches and the app would otherwise render a blank screen
  // with no way out.
  roleError: string | null;
  retryRole: () => void;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  role: null,
  isLoading: true,
  roleError: null,
  retryRole: () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

type RoleResult = { role: AccountRole | null; error: string | null };

// A failed lookup must never read as "no profile": ensureProfile() would
// then try to create one from the sign-up metadata. Errors are returned, not
// swallowed.
async function lookUpRole(userId: string): Promise<RoleResult> {
  const [clientResult, handymanResult] = await Promise.all([
    supabase.from('client_profiles').select('id').eq('id', userId).maybeSingle(),
    supabase.from('handyman_profiles').select('id').eq('id', userId).maybeSingle(),
  ]);

  if (clientResult.data) return { role: 'client', error: null };
  if (handymanResult.data) return { role: 'handyman', error: null };
  const error = clientResult.error ?? handymanResult.error;
  return { role: null, error: error ? error.message : null };
}

// Sign-up screens stash { pending_role, full_name } in the auth user's own
// metadata when they call supabase.auth.signUp(). If Supabase is configured
// to require email confirmation, there's no session (and so no way to pass
// an RLS check) until the user actually confirms and logs in later — so the
// profile row can't be created at sign-up time. Instead, the FIRST time we
// ever see a session for this user with no matching profile row yet, we
// create it here from that stashed metadata. Works whether or not email
// confirmation is turned on.
async function ensureProfile(session: Session): Promise<RoleResult> {
  const existing = await lookUpRole(session.user.id);
  if (existing.role || existing.error) return existing;

  const pendingRole = session.user.user_metadata?.pending_role as AccountRole | undefined;
  if (!pendingRole) return { role: null, error: 'No profile found for this account.' };

  const fullName = (session.user.user_metadata?.full_name as string | undefined) ?? '';
  const table = pendingRole === 'client' ? 'client_profiles' : 'handyman_profiles';
  const { error } = await supabase.from(table).insert({ id: session.user.id, full_name: fullName });

  if (error) {
    // Usually a race, not a real failure: registration runs ensureProfile()
    // twice at once on login (getSession + the auth listener), so on a
    // brand-new account both can find no profile and both insert -- one hits
    // the primary key. If the profile exists now, that's success.
    const retry = await lookUpRole(session.user.id);
    if (retry.role) return retry;
    console.warn('Could not create profile from pending sign-up metadata:', error.message);
    return { role: null, error: error.message };
  }
  return { role: pendingRole, error: null };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);

  const applyRole = useCallback((result: RoleResult | null) => {
    setRole(result?.role ?? null);
    setRoleError(result?.error ?? null);
  }, []);

  const retryRole = useCallback(() => {
    if (!session) return;
    setIsLoading(true);
    ensureProfile(session).then((result) => {
      applyRole(result);
      setIsLoading(false);
    });
  }, [session, applyRole]);

  // Tracks whose session is currently active, imperatively -- NOT the
  // `session` state variable, which this effect (mount-only deps) would
  // otherwise read as a stale closure over its very first value forever.
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      currentUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
      const result = data.session ? await ensureProfile(data.session) : null;
      if (!isMounted) return;
      applyRole(result);
      setIsLoading(false);
      if (data.session) {
        registerForPushNotifications(data.session.user.id).catch((err) =>
          console.error('Push registration failed:', err)
        );
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;

      // A same-user event -- SIGNED_IN from a re-auth check (e.g. change
      // password verifying the current one), TOKEN_REFRESHED, or
      // USER_UPDATED -- isn't a new session needing role re-resolution. The
      // root layout blanks the WHOLE app (including whatever screen
      // triggered this) while `isLoading` is true, so running the full
      // reset here tore down screens mid-action for no reason -- most
      // visibly, change-password's own screen getting unmounted while its
      // submit was still in flight. Just refresh the mirrored session and
      // stop; role/profile can't have changed from an event like this.
      if (nextSession && nextSession.user.id === currentUserId.current) {
        setSession(nextSession);
        return;
      }

      currentUserId.current = nextSession?.user.id ?? null;
      setIsLoading(true);
      setSession(nextSession);
      const result = nextSession ? await ensureProfile(nextSession) : null;
      if (!isMounted) return;
      applyRole(result);
      setIsLoading(false);
      if (nextSession) {
        registerForPushNotifications(nextSession.user.id).catch((err) =>
          console.error('Push registration failed:', err)
        );
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [applyRole]);

  return (
    <SessionContext.Provider value={{ session, role, isLoading, roleError, retryRole }}>
      {children}
    </SessionContext.Provider>
  );
}
