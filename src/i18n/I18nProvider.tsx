import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  detectLocale,
  getStoredLocalePreference,
  localeToBcp47,
  resolveLocale,
  storeLocalePreference,
  type Locale,
  type LocalePreference,
} from './locale';
import {
  getLocale,
  setLocale as setGlobalLocale,
  translate,
  type MessageKey,
} from './translate';

type Params = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  localePreference: LocalePreference;
  setLocalePreference: (preference: LocalePreference) => void;
  dateLocale: string;
  t: (key: MessageKey | string, params?: Params) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [localePreference, setLocalePreferenceState] = useState<LocalePreference>(() =>
    getStoredLocalePreference(),
  );
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());

  const applyPreference = useCallback((preference: LocalePreference) => {
    const next = resolveLocale(preference);
    setGlobalLocale(next);
    setLocaleState(next);
  }, []);

  const setLocalePreference = useCallback(
    (preference: LocalePreference) => {
      storeLocalePreference(preference);
      setLocalePreferenceState(preference);
      applyPreference(preference);
    },
    [applyPreference],
  );

  useEffect(() => {
    applyPreference(getStoredLocalePreference());

    const onLanguageChange = () => {
      if (getStoredLocalePreference() !== 'system') return;
      const next = detectLocale();
      setGlobalLocale(next);
      setLocaleState(next);
    };

    window.addEventListener('languagechange', onLanguageChange);
    return () => window.removeEventListener('languagechange', onLanguageChange);
  }, [applyPreference]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localePreference,
      setLocalePreference,
      dateLocale: localeToBcp47(locale),
      t: (key, params) => translate(key, params, locale),
    }),
    [locale, localePreference, setLocalePreference],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}
