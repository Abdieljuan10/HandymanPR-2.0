import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';

import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export type Language = 'es' | 'en';

const STORAGE_KEY = 'app-language';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  isLoading: boolean;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: 'es',
  setLanguage: () => {},
  isLoading: true,
});

export function useLanguage() {
  return useContext(LanguageContext);
}

function isLanguage(value: unknown): value is Language {
  return value === 'es' || value === 'en';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { session, role, isLoading: isSessionLoading } = useSession();
  const [language, setLanguageState] = useState<Language>('es');
  const [isLoading, setIsLoading] = useState(true);

  // A signed-in user's language lives on their profile row
  // (client_profiles/handyman_profiles), not just on-device — otherwise
  // switching accounts on the same device also switches language for
  // whichever account you switch TO, since a device-wide AsyncStorage key
  // has no idea which account is "current." AsyncStorage stays as the
  // source of truth for the pre-login/guest screens, and as an offline
  // fallback if the profile fetch below fails.
  useEffect(() => {
    if (isSessionLoading) return;
    let isMounted = true;

    async function resolveLanguage(): Promise<Language> {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const cached: Language = isLanguage(stored) ? stored : 'es';

      if (!session || !role) return cached;

      const table = role === 'client' ? 'client_profiles' : 'handyman_profiles';
      const { data } = await supabase.from(table).select('language').eq('id', session.user.id).maybeSingle();
      return isLanguage(data?.language) ? data.language : cached;
    }

    resolveLanguage().then((resolved) => {
      if (!isMounted) return;
      i18n.changeLanguage(resolved).finally(() => {
        if (!isMounted) return;
        setLanguageState(resolved);
        AsyncStorage.setItem(STORAGE_KEY, resolved);
        setIsLoading(false);
      });
    });

    return () => {
      isMounted = false;
    };
  }, [session, role, isSessionLoading]);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    i18n.changeLanguage(nextLanguage);
    AsyncStorage.setItem(STORAGE_KEY, nextLanguage);

    if (session && role) {
      const table = role === 'client' ? 'client_profiles' : 'handyman_profiles';
      supabase
        .from(table)
        .update({ language: nextLanguage })
        .eq('id', session.user.id)
        .then(({ error }) => {
          if (error) console.error('Failed to save language preference:', error.message);
        });
    }
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}
