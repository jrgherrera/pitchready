export type { Locale, LocalePreference } from './locale';
export {
  detectLocale,
  localeToBcp47,
  getStoredLocalePreference,
  storeLocalePreference,
  resolveLocale,
} from './locale';
export { I18nProvider, useI18n, useT } from './I18nProvider';
export {
  getLocale,
  setLocale,
  t,
  translate,
  syncLocaleFromSystem,
  syncLocaleFromPreference,
} from './translate';
export type { MessageKey } from './translate';
