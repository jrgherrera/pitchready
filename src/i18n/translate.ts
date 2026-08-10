import { en, type Messages } from './messages/en';
import { es } from './messages/es';
import {
  detectLocale,
  getStoredLocalePreference,
  resolveLocale,
  type Locale,
} from './locale';

const catalogs: Record<Locale, Messages> = { en, es };

type Params = Record<string, string | number>;

let currentLocale: Locale =
  typeof navigator !== 'undefined' ? resolveLocale(getStoredLocalePreference()) : 'en';

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

function getByPath(obj: unknown, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{{${key}}}`,
  );
}

export type MessageKey = string;

export function translate(
  key: MessageKey,
  params?: Params,
  locale: Locale = currentLocale,
): string {
  const primary = getByPath(catalogs[locale], key);
  if (primary) return interpolate(primary, params);
  const fallback = getByPath(catalogs.en, key);
  if (fallback) return interpolate(fallback, params);
  return key;
}

export const t = translate;

/** Apply stored preference (or system) to the global locale. */
export function syncLocaleFromPreference() {
  setLocale(resolveLocale(getStoredLocalePreference()));
}

/** @deprecated Use syncLocaleFromPreference — kept for callers that mean “re-resolve”. */
export function syncLocaleFromSystem() {
  if (getStoredLocalePreference() === 'system') {
    setLocale(detectLocale());
  } else {
    syncLocaleFromPreference();
  }
}
