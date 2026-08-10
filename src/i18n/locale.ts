export type Locale = 'en' | 'es';

/** User choice: follow OS, or lock to a language */
export type LocalePreference = 'system' | Locale;

const STORAGE_KEY = 'pitchready.localePreference';

export function detectLocale(language = navigator.language): Locale {
  const normalized = language.toLowerCase();
  if (normalized.startsWith('es')) return 'es';
  return 'en';
}

export function localeToBcp47(locale: Locale): string {
  return locale === 'es' ? 'es-ES' : 'en-US';
}

export function getStoredLocalePreference(): LocalePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'en' || raw === 'es' || raw === 'system') return raw;
  return 'system';
}

export function storeLocalePreference(preference: LocalePreference) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, preference);
}

export function resolveLocale(preference: LocalePreference = getStoredLocalePreference()): Locale {
  if (preference === 'system') return detectLocale();
  return preference;
}
