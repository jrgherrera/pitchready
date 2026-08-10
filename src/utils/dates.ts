import { localeToBcp47, getLocale, type Locale } from '../i18n';

export function formatMatchWeekday(date: string, locale?: Locale) {
  return new Date(date).toLocaleDateString(localeToBcp47(locale ?? getLocale()), {
    weekday: 'long',
  });
}

export function formatMatchShortDate(date: string, locale?: Locale) {
  return new Date(date).toLocaleDateString(localeToBcp47(locale ?? getLocale()), {
    month: 'short',
    day: 'numeric',
  });
}
