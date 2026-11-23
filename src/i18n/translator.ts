import { EN_MESSAGES } from './locales/en.ts';
import { VI_MESSAGES } from './locales/vi.ts';
import { isSupportedLocale } from './locale.ts';
import { SupportedLocale, TranslationKey, TranslationParams } from './types.ts';

export { isSupportedLocale };

export const LOCALE_DICTIONARIES: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en: EN_MESSAGES,
  vi: VI_MESSAGES,
};

/**
 * Normalize raw language tag (e.g. "vi-VN", "en-US") into a SupportedLocale.
 */
export function normalizeLocaleTag(rawTag: unknown): SupportedLocale {
  if (typeof rawTag !== 'string') {
    return 'en';
  }
  const normalized = rawTag.trim().toLowerCase();
  if (normalized === 'vi' || normalized.startsWith('vi-') || normalized.startsWith('vi_')) {
    return 'vi';
  }
  return 'en';
}

/**
 * Detect whether code is executing inside Node.js (e.g. test runner / SSR).
 * Node >= 21 exposes globalThis.navigator reflecting OS locale (such as vi-VN),
 * which must not override the default 'en' locale in tests.
 */
export function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    process.versions !== null &&
    typeof process.versions.node === 'string'
  );
}

/**
 * Detect default locale from Chrome Extension i18n or browser navigator.
 * Always defaults to 'en' in Node.js / SSR test environments without chrome.i18n.
 */
export function detectDefaultLocale(): SupportedLocale {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.i18n &&
      typeof chrome.i18n.getUILanguage === 'function'
    ) {
      const uiLang = chrome.i18n.getUILanguage();
      if (uiLang) {
        return normalizeLocaleTag(uiLang);
      }
    }
  } catch {
    // Ignore chrome.i18n access issues and fallback safely
  }

  if (!isNodeRuntime()) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.language === 'string' && navigator.language) {
        return normalizeLocaleTag(navigator.language);
      }
    } catch {
      // Ignore navigator access issues
    }
  }

  return 'en';
}

/**
 * Resolve active locale from UserSettings.language, falling back to environment default.
 */
export function resolveLocale(settingsLanguage?: unknown): SupportedLocale {
  if (isSupportedLocale(settingsLanguage)) {
    return settingsLanguage;
  }
  return detectDefaultLocale();
}

/**
 * Translate a key for the given locale with optional {param} interpolation.
 */
export function translate(
  locale: SupportedLocale,
  key: TranslationKey,
  params?: TranslationParams
): string {
  const dict = LOCALE_DICTIONARIES[locale] ?? EN_MESSAGES;
  let template = dict[key] ?? EN_MESSAGES[key] ?? String(key);

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      template = template.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
    }
  }

  return template;
}
