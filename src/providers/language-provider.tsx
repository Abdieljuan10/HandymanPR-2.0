import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';
import { LocaleConfig } from 'react-native-calendars';

import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export type Language = 'es' | 'en';

// react-native-calendars (DateInput) reads month/day names from its OWN
// locale table (xdate's LocaleConfig), separate from i18next. Both 'es'
// AND 'en' need registering here -- xdate's own built-in English names
// live under the key '' (empty string, see node_modules/xdate/src/xdate.js),
// NOT 'en'. Its getLocale() does a plain `XDate.locales[XDate.defaultLocale]`
// lookup with no fallback (dateutils.js), so setting defaultLocale = 'en'
// with nothing registered under that exact key throws "Cannot read property
// 'dayNamesShort' of undefined" the instant any calendar tries to render --
// a real crash on any English-language account, not a timing issue. (This
// was wrongly assumed fine before -- 'en' looked like it should be a
// built-in default, and it never got exercised until an English-language
// account actually opened the calendar.)
// Kept centralized here, alongside the ONLY two places that ever change the
// active language, rather than in DateInput itself: DateInput could be
// mounted deep in a screen that opens well after this provider, but never
// BEFORE it (it's rendered once at the app root) -- so `defaultLocale` set
// here is guaranteed correct before any calendar's first render, without a
// mount-order race. A useEffect INSIDE DateInput doesn't have that
// guarantee (it runs after that same render), and React Compiler's purity
// rules reject mutating this kind of external, un-hooked global directly in
// a component's render body.
LocaleConfig.locales.es = {
  monthNames: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ],
  monthNamesShort: ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'],
  dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  dayNamesShort: ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'],
  today: 'Hoy',
};
LocaleConfig.locales.en = {
  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: 'Today',
};

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
      LocaleConfig.defaultLocale = resolved;
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
    LocaleConfig.defaultLocale = nextLanguage;
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
