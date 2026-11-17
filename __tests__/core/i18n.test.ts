import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import {
  detectDefaultLocale,
  isNodeRuntime,
  isSupportedLocale,
  normalizeLocaleTag,
  resolveLocale,
  translate,
} from '../../src/i18n/translator.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
} from '../mocks/chromeMock.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';
import { isChimeEnabled, playPhaseTransitionChime } from '../../src/ui/services/soundEffects.ts';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import { UserSettings } from '../../src/types/storageSchema.ts';

function createHandlerHarness() {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const blocking = new BlockingCoordinator(dnr);
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking
  );
  const handler = new MessageHandler(sessionCoordinator, profileManager, storage);
  return { handler, storage };
}

test('i18n: EN and VI dictionaries share 100% identical non-empty keys', () => {
  const enKeys = Object.keys(EN_MESSAGES).sort();
  const viKeys = Object.keys(VI_MESSAGES).sort();
  assert.deepStrictEqual(enKeys, viKeys);

  for (const key of enKeys) {
    const enVal = EN_MESSAGES[key as keyof typeof EN_MESSAGES];
    const viVal = VI_MESSAGES[key as keyof typeof VI_MESSAGES];
    assert.ok(typeof enVal === 'string' && enVal.trim().length > 0, `Missing EN text for ${key}`);
    assert.ok(typeof viVal === 'string' && viVal.trim().length > 0, `Missing VI text for ${key}`);
  }
});

test('i18n: translate supports parameter interpolation in both EN and VI', () => {
  assert.strictEqual(
    translate('en', 'common.language.switchAria', { language: 'VI' }),
    'Switch language to VI'
  );
  assert.strictEqual(
    translate('vi', 'common.language.switchAria', { language: 'EN' }),
    'Chuyển ngôn ngữ sang EN'
  );
});

test('i18n: Node test environment falls back to en by default even if navigator.language is vi-VN', () => {
  assert.strictEqual(isNodeRuntime(), true);
  assert.strictEqual(detectDefaultLocale(), 'en');
  assert.strictEqual(isSupportedLocale('en'), true);
  assert.strictEqual(isSupportedLocale('vi'), true);
  assert.strictEqual(isSupportedLocale('fr'), false);
  assert.strictEqual(normalizeLocaleTag('vi-VN'), 'vi');
  assert.strictEqual(normalizeLocaleTag('vi'), 'vi');
  assert.strictEqual(normalizeLocaleTag('en-US'), 'en');
  assert.strictEqual(normalizeLocaleTag('ja-JP'), 'en');

  const globalWithNav = globalThis as unknown as { navigator?: { language?: string } };
  const prevDescriptor = Object.getOwnPropertyDescriptor(globalWithNav, 'navigator');
  Object.defineProperty(globalWithNav, 'navigator', {
    configurable: true,
    writable: true,
    value: { language: 'vi-VN' },
  });
  try {
    assert.strictEqual(detectDefaultLocale(), 'en');
    assert.strictEqual(resolveLocale(undefined), 'en');
  } finally {
    if (prevDescriptor) {
      Object.defineProperty(globalWithNav, 'navigator', prevDescriptor);
    } else {
      Reflect.deleteProperty(globalWithNav, 'navigator');
    }
  }
});

test('i18n: resolveLocale prefers settings.language and falls back to browser/chrome UI language', () => {
  assert.strictEqual(resolveLocale('vi'), 'vi');
  assert.strictEqual(resolveLocale('en'), 'en');
  assert.strictEqual(resolveLocale(undefined), 'en');
  assert.strictEqual(resolveLocale('invalid'), 'en');

  const globalWithChrome = globalThis as unknown as { chrome?: unknown };
  const prevChrome = globalWithChrome.chrome;
  globalWithChrome.chrome = {
    i18n: {
      getUILanguage: () => 'vi-VN',
    },
  };

  try {
    assert.strictEqual(detectDefaultLocale(), 'vi');
    assert.strictEqual(resolveLocale(undefined), 'vi');
    assert.strictEqual(resolveLocale('en'), 'en');
  } finally {
    if (prevChrome === undefined) {
      Reflect.deleteProperty(globalWithChrome, 'chrome');
    } else {
      globalWithChrome.chrome = prevChrome;
    }
  }
});

test('MessageHandler: SET_LANGUAGE and SET_CHIME_ENABLED validate payloads, persist atomically, and expose via GET_SESSION_STATE', async () => {
  const { handler, storage } = createHandlerHarness();

  const badLang = await handler.handleMessage({
    action: 'SET_LANGUAGE',
    payload: { language: 'fr' },
  });
  assert.strictEqual(badLang.success, false);

  const badChime = await handler.handleMessage({
    action: 'SET_CHIME_ENABLED',
    payload: { enabled: 'yes' },
  });
  assert.strictEqual(badChime.success, false);

  const okLang = await handler.handleMessage({
    action: 'SET_LANGUAGE',
    payload: { language: 'vi' },
  });
  assert.strictEqual(okLang.success, true);

  const okChime = await handler.handleMessage({
    action: 'SET_CHIME_ENABLED',
    payload: { enabled: false },
  });
  assert.strictEqual(okChime.success, true);

  const stored = await storage.getSettings();
  assert.strictEqual(stored.language, 'vi');
  assert.strictEqual(stored.chimeEnabled, false);
  assert.strictEqual(stored.soundEnabled, false); // deprecated legacy field preserved untouched

  const fullState = await handler.handleMessage({ action: 'GET_SESSION_STATE' });
  assert.strictEqual(fullState.success, true);
  const data = fullState.data as { settings?: UserSettings };
  assert.strictEqual(data.settings?.language, 'vi');
  assert.strictEqual(data.settings?.chimeEnabled, false);
});

test('ExtensionClient simulator: SET_LANGUAGE and SET_CHIME_ENABLED maintain parity with MessageHandler', async () => {
  const badRes = await sendExtensionMessage({
    action: 'SET_LANGUAGE',
    payload: { language: 'es' as 'en' },
  });
  assert.strictEqual(badRes.success, false);

  const langRes = await sendExtensionMessage<UserSettings>({
    action: 'SET_LANGUAGE',
    payload: { language: 'vi' },
  });
  assert.strictEqual(langRes.success, true);
  assert.strictEqual(langRes.data?.language, 'vi');

  const chimeRes = await sendExtensionMessage<UserSettings>({
    action: 'SET_CHIME_ENABLED',
    payload: { enabled: false },
  });
  assert.strictEqual(chimeRes.success, true);
  assert.strictEqual(chimeRes.data?.chimeEnabled, false);

  const stateRes = await sendExtensionMessage<{ settings?: UserSettings }>({
    action: 'GET_SESSION_STATE',
  });
  assert.strictEqual(stateRes.success, true);
  assert.strictEqual(stateRes.data?.settings?.language, 'vi');
  assert.strictEqual(stateRes.data?.settings?.chimeEnabled, false);

  // Restore defaults for standalone simulator state hygiene
  await sendExtensionMessage({ action: 'SET_LANGUAGE', payload: { language: 'en' } });
  await sendExtensionMessage({ action: 'SET_CHIME_ENABLED', payload: { enabled: true } });
});

test('Chime gating: undefined enables chime, false disables chime, and legacy soundEnabled=false still hears chime', () => {
  assert.strictEqual(isChimeEnabled(undefined), true);
  assert.strictEqual(isChimeEnabled({}), true);
  assert.strictEqual(isChimeEnabled({ chimeEnabled: undefined }), true);
  assert.strictEqual(isChimeEnabled({ chimeEnabled: true }), true);
  assert.strictEqual(isChimeEnabled({ chimeEnabled: false }), false);

  // Legacy user settings with soundEnabled: false and no chimeEnabled MUST still play chimes
  const legacyUserSettings: UserSettings = {
    soundEnabled: false,
    notificationsEnabled: true,
  };
  assert.strictEqual(isChimeEnabled(legacyUserSettings), true);

  let focusPlays = 0;
  let breakPlays = 0;
  const spyPlayer = {
    playFocusStartChime: () => {
      focusPlays += 1;
    },
    playBreakStartChime: () => {
      breakPlays += 1;
    },
  };

  assert.strictEqual(playPhaseTransitionChime('FOCUS', legacyUserSettings, spyPlayer), true);
  assert.strictEqual(playPhaseTransitionChime('SHORT_BREAK', undefined, spyPlayer), true);
  assert.strictEqual(focusPlays, 1);
  assert.strictEqual(breakPlays, 1);

  assert.strictEqual(playPhaseTransitionChime('FOCUS', { chimeEnabled: false }, spyPlayer), false);
  assert.strictEqual(playPhaseTransitionChime('LONG_BREAK', { chimeEnabled: false }, spyPlayer), false);
  assert.strictEqual(focusPlays, 1);
  assert.strictEqual(breakPlays, 1);
});

test('TimerView: renders minimal chime toggle with i18n aria-label in EN and VI', () => {
  const noop = async () => {};
  const enHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(TimerView, {
        session: null,
        activeProfile: null,
        activeBonusRate: 0,
        isBonusLoading: false,
        onStartSession: noop,
        onPauseSession: noop,
        onResumeSession: noop,
        onGiveUpSession: noop,
        onFinishStopwatch: noop,
        onResetSession: noop,
        onRefreshSession: noop,
        isLoading: false,
        onOpenProfiles: () => {},
      })
    )
  );
  assert.ok(enHtml.includes('data-testid="chime-toggle-btn"'));
  assert.ok(enHtml.includes(`aria-label="${EN_MESSAGES['timer.chime.toggleAriaOn']}"`));

  const viMutedHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(TimerView, {
        session: null,
        activeProfile: null,
        activeBonusRate: 0,
        isBonusLoading: false,
        onStartSession: noop,
        onPauseSession: noop,
        onResumeSession: noop,
        onGiveUpSession: noop,
        onFinishStopwatch: noop,
        onResetSession: noop,
        onRefreshSession: noop,
        isLoading: false,
        onOpenProfiles: () => {},
        chimeEnabled: false,
      })
    )
  );
  assert.ok(viMutedHtml.includes(`aria-label="${VI_MESSAGES['timer.chime.toggleAriaOff']}"`));
});
