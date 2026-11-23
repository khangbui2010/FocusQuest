import { STORAGE_KEYS } from '../storage/storageKeys.ts';
import { resolveLocale, translate } from '../i18n/translator.ts';
import { SupportedLocale } from '../i18n/types.ts';
import { UserSettings } from '../types/storageSchema.ts';

const READY_FALLBACK_DELAY_MS = 80;

export function applyBlockedTranslations(locale: SupportedLocale, doc: Document): void {
  if (!doc) return;
  if (doc.documentElement) {
    doc.documentElement.lang = locale;
  }
  doc.title = translate(locale, 'blocked.pageTitle');

  const titleEl = doc.getElementById('blocked-title');
  if (titleEl) {
    titleEl.textContent = translate(locale, 'blocked.heading');
  }

  const descEl = doc.getElementById('blocked-desc');
  if (descEl) {
    descEl.textContent = translate(locale, 'blocked.description');
  }

  const badgeEl = doc.getElementById('blocked-badge');
  if (badgeEl) {
    badgeEl.textContent = translate(locale, 'blocked.badge');
  }
}

function revealBlockedCard(doc: Document): void {
  const cardEl = doc.getElementById('blocked-card');
  if (cardEl) {
    cardEl.setAttribute('data-ready', 'true');
  }
}

export interface BlockedStorageLike {
  local?: {
    get: (
      keys: string | string[],
      callback?: (items: Record<string, unknown>) => void
    ) => Promise<Record<string, unknown>> | void;
  };
  onChanged?: {
    addListener: (
      cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
    ) => void;
    removeListener?: (
      cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
    ) => void;
  };
}

export function initBlockedPage(
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
  storageApi: BlockedStorageLike | undefined =
    typeof chrome !== 'undefined' && chrome.storage ? (chrome.storage as BlockedStorageLike) : undefined
): () => void {
  if (!doc) return () => {};

  const fallbackTimer = setTimeout(() => {
    revealBlockedCard(doc);
  }, READY_FALLBACK_DELAY_MS);

  const applyFromSettings = (settingsRaw: unknown) => {
    const settings = settingsRaw as Partial<UserSettings> | undefined;
    const locale = resolveLocale(settings?.language);
    applyBlockedTranslations(locale, doc);
    revealBlockedCard(doc);
    clearTimeout(fallbackTimer);
  };

  if (storageApi?.local?.get) {
    try {
      let callbackHandled = false;
      const maybePromise = storageApi.local.get(STORAGE_KEYS.SETTINGS, (items) => {
        callbackHandled = true;
        applyFromSettings(items?.[STORAGE_KEYS.SETTINGS]);
      });

      if (maybePromise && typeof (maybePromise as Promise<Record<string, unknown>>).then === 'function') {
        (maybePromise as Promise<Record<string, unknown>>)
          .then((items) => {
            if (!callbackHandled) {
              applyFromSettings(items?.[STORAGE_KEYS.SETTINGS]);
            }
          })
          .catch(() => {
            applyFromSettings(undefined);
          });
      }
    } catch {
      applyFromSettings(undefined);
    }
  } else {
    applyFromSettings(undefined);
  }

  const handleStorageChange = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string
  ) => {
    if (areaName !== 'local') return;
    if (changes[STORAGE_KEYS.SETTINGS]) {
      applyFromSettings(changes[STORAGE_KEYS.SETTINGS].newValue);
    }
  };

  if (storageApi?.onChanged?.addListener) {
    storageApi.onChanged.addListener(handleStorageChange);
  }

  return () => {
    clearTimeout(fallbackTimer);
    if (storageApi?.onChanged?.removeListener) {
      storageApi.onChanged.removeListener(handleStorageChange);
    }
  };
}

if (
  typeof document !== 'undefined' &&
  typeof chrome !== 'undefined' &&
  Boolean(chrome.storage?.local) &&
  Boolean(document.getElementById('blocked-card'))
) {
  initBlockedPage(document, chrome.storage as BlockedStorageLike);
}
