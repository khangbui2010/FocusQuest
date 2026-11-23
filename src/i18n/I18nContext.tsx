import React, { createContext, useContext, useMemo } from 'react';
import { SupportedLocale, TranslationKey, TranslationParams } from './types.ts';
import { detectDefaultLocale, resolveLocale, translate } from './translator.ts';

export interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void | Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  locale?: SupportedLocale;
  onChangeLocale?: (locale: SupportedLocale) => void | Promise<void>;
  children?: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  locale,
  onChangeLocale,
  children,
}) => {
  const resolvedLocale = resolveLocale(locale);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: resolvedLocale,
      setLocale: onChangeLocale ?? (() => {}),
      t: (key: TranslationKey, params?: TranslationParams) =>
        translate(resolvedLocale, key, params),
    }),
    [resolvedLocale, onChangeLocale]
  );

  return React.createElement(I18nContext.Provider, { value }, children);
};

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx) {
    return ctx;
  }

  const fallbackLocale = detectDefaultLocale();
  return {
    locale: fallbackLocale,
    setLocale: () => {},
    t: (key: TranslationKey, params?: TranslationParams) =>
      translate(fallbackLocale, key, params),
  };
}
