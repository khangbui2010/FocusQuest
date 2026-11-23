import type { EN_MESSAGES } from './locales/en.ts';
import type { SupportedLocale } from './locale.ts';

export type { SupportedLocale };

export type TranslationKey = keyof typeof EN_MESSAGES;

export type TranslationParams = Record<string, string | number>;
