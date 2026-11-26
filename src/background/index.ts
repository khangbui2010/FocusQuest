import { ChromeStorageAdapter } from '../storage/chromeStorageAdapter.ts';
import { StorageManager } from '../storage/storageManager.ts';
import { MigrationRunner } from '../storage/migrations/migrationRunner.ts';
import { ProfileManager } from '../core/profiles/profileManager.ts';
import { ChromeAlarmsAdapter } from '../chrome/alarmsAdapter.ts';
import { ChromeNotificationsAdapter } from '../chrome/notificationsAdapter.ts';
import { ChromeBadgeAdapter } from '../chrome/badgeAdapter.ts';
import { ChromeDNRAdapter } from '../chrome/dnrAdapter.ts';
import { ChromeTabsAdapter } from '../chrome/tabsAdapter.ts';
import { BlockingCoordinator, isWebsiteBlockingActive } from './blockingCoordinator.ts';
import { SessionCoordinator, ALARM_NAMES } from './sessionCoordinator.ts';
import { MessageHandler } from './messageHandler.ts';
import { CivilizationCoordinator } from './civilizationCoordinator.ts';
import { ChromeOffscreenAdapter } from '../chrome/offscreenAdapter.ts';
import { MusicCoordinator, deriveMusicIntent } from './musicCoordinator.ts';
import { QuestCoordinator } from './questCoordinator.ts';
import { AwardsCoordinator } from './awardsCoordinator.ts';

import { LifecycleReason } from '../types/lifecycle.ts';
import { OffscreenMusicEvent } from '../types/music.ts';
import { extractCodedError } from '../types/errors.ts';

// 1. Initialize Adapters & Core Services
const storageAdapter = new ChromeStorageAdapter('local');
const sessionStorageAdapter = new ChromeStorageAdapter('session');
const storageManager = new StorageManager(storageAdapter, sessionStorageAdapter);
const profileManager = new ProfileManager(storageManager);
const alarmsAdapter = new ChromeAlarmsAdapter();
const notificationsAdapter = new ChromeNotificationsAdapter();
const badgeAdapter = new ChromeBadgeAdapter();
const dnrAdapter = new ChromeDNRAdapter();
const tabsAdapter = new ChromeTabsAdapter();
const blockingCoordinator = new BlockingCoordinator(dnrAdapter, tabsAdapter);
const civilizationCoordinator = new CivilizationCoordinator(storageManager);
const offscreenAdapter = new ChromeOffscreenAdapter();
const musicCoordinator = new MusicCoordinator(storageManager, offscreenAdapter);
const questCoordinator = new QuestCoordinator(storageManager);
const awardsCoordinator = new AwardsCoordinator(storageManager);

const sessionCoordinator = new SessionCoordinator(
  storageManager,
  profileManager,
  alarmsAdapter,
  notificationsAdapter,
  badgeAdapter,
  blockingCoordinator,
  () => civilizationCoordinator.getActiveCoinBonuses(),
  async (event) => {
    await musicCoordinator.handleFocusSessionEnded(event);
  },
  async (session, reason) => {
    await musicCoordinator.sync(session, reason);
  },
  (civState) => {
    civilizationCoordinator.refreshCachedBonuses(civState);
  }
);

const messageHandler = new MessageHandler(
  sessionCoordinator,
  profileManager,
  storageManager,
  civilizationCoordinator,
  musicCoordinator,
  questCoordinator,
  awardsCoordinator
);

// 2. Synchronous Top-Level Chrome Event Listeners Registration
// (Manifest V3 requirement: Listeners MUST be attached synchronously upon script evaluation)

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const runner = new MigrationRunner(storageAdapter);
    await runner.runMigrations();
    console.log('Focus Quest: Storage migrations verified successfully on install.');

    await civilizationCoordinator.ensureInitialized();

    // On Chrome 157+, onExtensionLoaded is the authoritative source for lifecycle differentiation (reload vs update).
    // On Chrome 156 and below, onExtensionLoaded is undefined, so onInstalled(update) serves as the safe update fallback.
    const hasOnExtensionLoaded =
      typeof (chrome.runtime as unknown as { onExtensionLoaded?: { addListener?: unknown } })
        .onExtensionLoaded?.addListener === 'function';

    if (!hasOnExtensionLoaded && details?.reason === 'update') {
      await sessionCoordinator.handleLifecycleEvent({ reason: 'EXTENSION_UPDATED' });
    }
    await musicCoordinator.sync(undefined, 'ON_INSTALLED').catch(() => undefined);
  } catch (err) {
    console.error('Focus Quest: Migration failure on install:', err);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await civilizationCoordinator.ensureInitialized();
    const session = await sessionCoordinator.handleLifecycleEvent({
      reason: 'BROWSER_STARTUP',
      isBrowserStartup: true,
    });
    await musicCoordinator
      .sync(session, session ? 'BROWSER_STARTUP' : 'STARTUP_NO_SESSION')
      .catch(() => undefined);
    console.log('Focus Quest: Session & civilization state rehydrated successfully on startup.');
  } catch (err) {
    console.error('Focus Quest: Error recovering session on startup:', err);
  }
});

// Modern Chrome Lifecycle Events (Chrome 155+ & 157+) with Safe Feature Detection
const runtimeWithLifecycle = chrome.runtime as unknown as {
  onEnabled?: chrome.events.Event<() => void>;
  onExtensionLoaded?: chrome.events.Event<(details: { reason: string }) => void>;
};

if (typeof runtimeWithLifecycle.onEnabled?.addListener === 'function') {
  runtimeWithLifecycle.onEnabled.addListener(async () => {
    try {
      await civilizationCoordinator.ensureInitialized();
      const session = await sessionCoordinator.handleLifecycleEvent({
        reason: 'EXTENSION_RE_ENABLED',
      });
      await musicCoordinator.sync(session, 'EXTENSION_RE_ENABLED').catch(() => undefined);
    } catch (err) {
      console.error('Focus Quest: Error handling onEnabled event:', err);
    }
  });
}

if (typeof runtimeWithLifecycle.onExtensionLoaded?.addListener === 'function') {
  runtimeWithLifecycle.onExtensionLoaded.addListener(async (details) => {
    try {
      let reason: LifecycleReason = 'UNKNOWN';
      switch (details?.reason) {
        case 'startup':
          reason = 'BROWSER_STARTUP';
          break;
        case 'enable':
          reason = 'EXTENSION_RE_ENABLED';
          break;
        case 'reload':
          reason = 'EXTENSION_RELOADED';
          break;
        case 'update':
          reason = 'EXTENSION_UPDATED';
          break;
        case 'browser_update':
          reason = 'BROWSER_UPDATED';
          break;
        case 'install':
          reason = 'EXTENSION_UPDATED';
          break;
        default:
          reason = 'UNKNOWN';
      }
      const isStartup = reason === 'BROWSER_STARTUP' || reason === 'BROWSER_UPDATED';
      await civilizationCoordinator.ensureInitialized();
      const session = await sessionCoordinator.handleLifecycleEvent({
        reason,
        isBrowserStartup: isStartup,
      });
      await musicCoordinator
        .sync(session, isStartup && !session ? 'STARTUP_NO_SESSION' : reason)
        .catch(() => undefined);
    } catch (err) {
      console.error('Focus Quest: Error handling onExtensionLoaded event:', err);
    }
  });
}

alarmsAdapter.onAlarm(async (alarm) => {
  try {
    await civilizationCoordinator.ensureInitialized();
    await sessionCoordinator.ensureInitialized();
    if (alarm.name === ALARM_NAMES.COUNTDOWN_FINISH) {
      await sessionCoordinator.completeCountdown();
    } else if (alarm.name.startsWith(ALARM_NAMES.PAUSE_AUTO_RESUME)) {
      await sessionCoordinator.resumeSession(true, alarm.name);
    } else if (alarm.name.startsWith(ALARM_NAMES.POMODORO_STAGE)) {
      console.log(`[POMODORO] Stage alarm received: ${alarm.name}`);
      await sessionCoordinator.advancePomodoroStage(alarm.name);
    } else if (alarm.name === ALARM_NAMES.HEARTBEAT) {
      await sessionCoordinator.processHeartbeat();
    }
  } catch (err) {
    if (alarm.name.startsWith(ALARM_NAMES.POMODORO_STAGE)) {
      console.error(`[POMODORO] Transition failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.error(`Focus Quest: Error processing alarm '${alarm.name}':`, err);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message &&
    typeof message === 'object' &&
    (message as { target?: string }).target === 'offscreen'
  ) {
    return false;
  }

  if (
    message &&
    typeof message === 'object' &&
    (message as { target?: string }).target === 'background'
  ) {
    (async () => {
      const evt = message as OffscreenMusicEvent;
      if (evt.action === 'MUSIC_POSITION' || evt.action === 'MUSIC_ENDED') {
        const currentSession = await storageManager.getCurrentSession();
        if (deriveMusicIntent(currentSession) === 'stop') {
          return musicCoordinator.sync(currentSession, 'NO_ACTIVE_SESSION');
        }
      }
      return musicCoordinator.handleOffscreenEvent(evt);
    })()
      .then((state) => sendResponse({ success: true, data: state }))
      .catch((err) => {
        const coded = extractCodedError(err);
        sendResponse({
          success: false,
          error: coded.message ?? (err instanceof Error ? err.message : String(err)),
          errorCode: coded.code ?? 'ACTION_FAILED',
          errorParams: coded.params,
        });
      });
    return true;
  }

  (async () => {
    await civilizationCoordinator.ensureInitialized();
    await sessionCoordinator.ensureInitialized();

    if (
      typeof import.meta !== 'undefined' &&
      typeof import.meta.env !== 'undefined' &&
      import.meta.env.DEV === true
    ) {
      const devMod = await import('../dev/devBackground.ts').catch(() => null);
      if (devMod) {
        const devResponse = await devMod.handleDevBackgroundMessage(message, {
          storageManager,
          sessionCoordinator,
          civilizationCoordinator,
          questCoordinator,
        });
        if (devResponse !== null) {
          return devResponse;
        }
      }
    }

    return messageHandler.handleMessage(message);
  })()
    .then((response) => {
      sendResponse(response);
    })
    .catch((err) => {
      const coded = extractCodedError(err);
      sendResponse({
        success: false,
        error: coded.message ?? (err instanceof Error ? err.message : String(err)),
        errorCode: coded.code ?? 'ACTION_FAILED',
        errorParams: coded.params,
      });
    });

  return true; // Keep message channel open for async response
});

// Dynamic Tab Navigation Watcher (Active only while the authoritative phase allows blocking:
// RUNNING FOCUS/non-Pomodoro. Breaks and pause never redirect navigations.)
tabsAdapter.onUpdated?.(async (tabId, changeInfo, tab) => {
  try {
    await civilizationCoordinator.ensureInitialized();
    await sessionCoordinator.ensureInitialized();
    const activeProfile = await profileManager.getActiveProfile();
    const session = await storageManager.getCurrentSession();
    if (!isWebsiteBlockingActive(session)) {
      return;
    }
    await blockingCoordinator.handleTabUpdate(tabId, changeInfo, tab, activeProfile, session);
  } catch (err) {
    console.warn('Focus Quest: Error in tabs.onUpdated watcher:', err);
  }
});

// Top-level recovery invocation has been removed per architectural fix.
// Lifecycle transitions are strictly dispatched by runtime events or lazy event initialization.
