import { resolveLocale, translate } from '../i18n/translator.ts';
import { TranslationKey } from '../i18n/types.ts';
import { formatRewardAmount } from '../ui/utils/formatters.ts';

export type SessionNotificationParams = Record<string, string | number>;

/**
 * Display-boundary helper for Chrome notifications.
 * Formats numeric reward values (`coins`, `xp`) strictly outside SessionCoordinator
 * so core session and settlement logic remains decoupled from UI number formatting.
 */
export function formatSessionNotificationContent(params: {
  language?: unknown;
  titleKey: TranslationKey;
  messageKey: TranslationKey;
  messageParams?: SessionNotificationParams;
}): { title: string; message: string } {
  const locale = resolveLocale(params.language);

  let formattedParams: SessionNotificationParams | undefined;
  if (params.messageParams) {
    formattedParams = {};
    for (const [key, value] of Object.entries(params.messageParams)) {
      if ((key === 'coins' || key === 'xp') && typeof value === 'number') {
        formattedParams[key] = formatRewardAmount(value);
      } else {
        formattedParams[key] = value;
      }
    }
  }

  return {
    title: translate(locale, params.titleKey),
    message: translate(locale, params.messageKey, formattedParams),
  };
}
