import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';

import i18n from '@/i18n';

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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('es');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      const initial: Language = stored === 'en' ? 'en' : 'es';
      i18n.changeLanguage(initial).finally(() => {
        if (!isMounted) return;
        setLanguageState(initial);
        setIsLoading(false);
      });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    i18n.changeLanguage(nextLanguage);
    AsyncStorage.setItem(STORAGE_KEY, nextLanguage);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}
