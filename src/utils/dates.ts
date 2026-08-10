import { localeToBcp47, getLocale, type Locale } from '../i18n';

export function formatMatchWeekday(date: Date, locale?: Locale) {
  return date.toLocaleDateString(localeToBcp47(locale ?? getLocale()), {
    weekday: 'long',
  });
}

export function formatMatchTime(date: Date, locale?: Locale) {
  return date.toLocaleTimeString(localeToBcp47(locale ?? getLocale()), {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatMatchShortDate(date: Date, locale?: Locale) {
  return date.toLocaleDateString(localeToBcp47(locale ?? getLocale()), {
    month: 'short',
    day: 'numeric',
  });
}

/** Local-time 'YYYY-MM-DD' + 'HH:mm', the values <input type="date"/"time"> expect. */
export function toDateTimeInputs(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  const [day, rest] = local.toISOString().split('T');
  return { day, time: rest.slice(0, 5) };
}
