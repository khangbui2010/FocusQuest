export type SupportedLocale = 'en' | 'vi';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return value === 'en' || value === 'vi';
}
