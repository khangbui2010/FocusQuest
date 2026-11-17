import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import {
  SessionCoordinator,
  buildPomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';
import { MusicCoordinator } from '../../src/background/musicCoordinator.ts';
import { IOffscreenAdapter } from '../../src/chrome/offscreenAdapter.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import { parseRemoteCatalog } from '../../src/data/musicCatalog.ts';
import { AudioStatusSnapshot, MusicTrack, OffscreenMusicCommand } from '../../src/types/music.ts';
import { playPhaseTransitionChime } from '../../src/ui/services/soundEffects.ts';

function createTestCatalog(): MusicTrack[] {
  return parseRemoteCatalog({
    schemaVersion: 1,
    updatedAt: '2026-11-17',
    tracks: [
      {
        id: 'purrple-cat-twilight-market',
        title: 'Twilight Market',
        artist: 'Purrple Cat',
        album: 'City Nights 2',
        durationSec: 175,
        file: 'purrple-cat-city-nights-2-01-twilight-market_afce47e2.mp3',
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://purrplecat.com/',
        modified: false,
      },
      {
        id: 'holizna-cc0-into-the-mist',
        title: 'Into The Mist',
        artist: 'HoliznaCC0',
        album: 'Public Domain Lofi',
        durationSec: 130,
        file: 'holizna-cc0-into-the-mist.mp3',
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
        modified: false,
      },
    ],
  }).tracks;
}

class StubOffscreen implements IOffscreenAdapter {
  public open = false;
  public throwOnStop = false;
  public audioStatus: AudioStatusSnapshot = {
    isPlaying: false,
    paused: true,
    currentTime: 0,
    duration: null,
    trackId: null,
    src: '',
  };

  async hasDocument(): Promise<boolean> {
    return this.open;
  }
  async ensureDocument(): Promise<void> {
    this.open = true;
  }
  async closeDocument(): Promise<void> {
    if (this.throwOnStop) {
      throw new Error('Simulated offscreen close failure');
    }
    this.open = false;
  }
  async sendCommand<T = unknown>(command: OffscreenMusicCommand): Promise<T | null> {
    if (command.action === 'MUSIC_PLAY') {
      this.audioStatus = {
        isPlaying: true,
        paused: false,
        currentTime: command.startAtSec,
        duration: 180,
        trackId: command.trackId ?? command.url,
        src: command.url,
      };
      return { ...this.audioStatus } as unknown as T;
    }
    if (command.action === 'MUSIC_STOP') {
      if (this.throwOnStop) {
        throw new Error('Simulated offscreen STOP failure');
      }
      this.audioStatus = {
        isPlaying: false,
        paused: true,
        currentTime: 0,
        duration: null,
        trackId: null,
        src: '',
      };
      return { ...this.audioStatus } as unknown as T;
    }
    return { ...this.audioStatus } as unknown as T;
  }
}

async function createHarness(options?: {
  throwOnNotification?: boolean;
  throwOnMusicHook?: boolean;
}) {
  const testCatalog = createTestCatalog();
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();

  if (options?.throwOnNotification) {
    notifications.create = async () => {
      throw new Error('Simulated chrome.notifications permission error');
    };
  }

  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const tabs = new MockTabsAdapter();
  const blocking = new BlockingCoordinator(dnr, tabs);
  const offscreen = new StubOffscreen();
  const musicCoordinator = new MusicCoordinator(storage, offscreen, testCatalog);

  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking,
    () => [],
    async (event) => {
      if (options?.throwOnMusicHook) {
        throw new Error('Simulated catastrophic music hook error');
      }
      await musicCoordinator.handleFocusSessionEnded(event);
    },
    async (session, reason) => {
      if (options?.throwOnMusicHook) {
        throw new Error('Simulated catastrophic music sync error');
      }
      await musicCoordinator.sync(session, reason);
    }
  );

  const profile = await profileManager.createProfile('NotifProfile', ['example.com']);
  return {
    storage,
    profile,
    alarms,
    notifications,
    offscreen,
    musicCoordinator,
    sessionCoordinator,
    testCatalog,
  };
}

test('Notifications 1 & 5: Countdown completion notifies ONCE with duration and deduplicates repeated alarms/calls', async () => {
  const { storage, profile, notifications, sessionCoordinator } = await createHarness();
  await sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);

  await sessionCoordinator.completeCountdown();
  await sessionCoordinator.completeCountdown();
  await sessionCoordinator.completeCountdown();

  assert.equal(notifications.dispatchCount, 1);
  const notif = Array.from(notifications.notifications.values())[0];
  assert.ok(notif.title.includes('Mission Complete'));
  assert.ok(notif.message.includes('25'));

  const saved = await storage.getCurrentSession();
  assert.equal(saved?.notificationSent, true);
});

test('Notifications 2 & 7: Pomodoro Countdown distinguishes Break/Focus phase notifications from 100% session completion', async () => {
  const { storage, profile, notifications, sessionCoordinator } = await createHarness();
  const session = await sessionCoordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id, {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    focusIntervalsPerCycle: 2,
    targetFocusSessions: 2,
    numberOfCycles: 1,
  });

  const alarm1 = buildPomodoroStageAlarmName(
    session.id,
    1,
    'FOCUS',
    session.pomodoroState!.phaseStartedAt
  );
  const sBreak = await sessionCoordinator.advancePomodoroStage(alarm1);
  assert.equal(notifications.dispatchCount, 1);
  const breakNotif = Array.from(notifications.notifications.values())[0];
  assert.ok(breakNotif.title.includes('Short Break'));
  assert.equal(sBreak?.notificationSent, false);

  const alarm2 = buildPomodoroStageAlarmName(
    session.id,
    1,
    'SHORT_BREAK',
    sBreak!.pomodoroState!.phaseStartedAt
  );
  const sFocus2 = await sessionCoordinator.advancePomodoroStage(alarm2);
  assert.equal(notifications.dispatchCount, 2);
  const resumeNotif = notifications.notifications.get(
    Array.from(notifications.notifications.keys())[1]
  )!;
  assert.ok(resumeNotif.title.includes('Break Ended'));
  assert.equal(sFocus2?.notificationSent, false);

  const alarm3 = buildPomodoroStageAlarmName(
    session.id,
    2,
    'FOCUS',
    sFocus2!.pomodoroState!.phaseStartedAt
  );
  await sessionCoordinator.advancePomodoroStage(alarm3);
  assert.equal(notifications.dispatchCount, 3);
  const finalNotif = notifications.notifications.get(`fq_finish_${session.id}`);
  assert.ok(finalNotif, '100% Pomodoro completion must use canonical fq_finish_ ID');
  assert.ok(finalNotif.title.includes('Mission Complete'));
  assert.ok(finalNotif.message.includes('50'));

  const finalSaved = await storage.getCurrentSession();
  assert.equal(finalSaved?.notificationSent, true);
});

test('Notifications 3: Stopwatch >= 5m and Pomodoro Stopwatch >= 1 interval notify cleanly on finishStopwatch()', async () => {
  const h1 = await createHarness();
  await h1.sessionCoordinator.startSession('STOPWATCH', 0, h1.profile.id);
  const now = Date.now();
  await h1.storage.updateCurrentSession((s) =>
    s ? { ...s, startedAt: now - 12 * 60 * 1000, lastCheckpointAt: now - 60 * 1000 } : s
  );
  await h1.sessionCoordinator.finishStopwatch();
  await h1.sessionCoordinator.finishStopwatch();

  assert.equal(h1.notifications.dispatchCount, 1);
  const swNotif = Array.from(h1.notifications.notifications.values())[0];
  assert.ok(swNotif.message.includes('12'));

  const h2 = await createHarness();
  const pSession = await h2.sessionCoordinator.startSession('POMODORO_STOPWATCH', 0, h2.profile.id, {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    focusIntervalsPerCycle: 4,
    targetFocusSessions: 4,
    numberOfCycles: 1,
  });
  await h2.storage.updateCurrentSession((s) =>
    s && s.pomodoroState
      ? {
          ...s,
          pomodoroState: {
            ...s.pomodoroState,
            currentPhase: 'SHORT_BREAK',
            completedFocusCount: 1,
            totalCompletedFocusMinutes: 25,
          },
        }
      : s
  );
  await h2.sessionCoordinator.finishStopwatch();
  assert.equal(h2.notifications.dispatchCount, 1);
  const pSwNotif = h2.notifications.notifications.get(`fq_finish_${pSession.id}`);
  assert.ok(pSwNotif);
  assert.ok(pSwNotif.message.includes('25'));
});

test('Notifications 4: Silent on Pause, Give Up, Stopwatch < 5m, Pomodoro Stopwatch 0 intervals, Reload, Browser Close', async () => {
  const h1 = await createHarness();
  await h1.sessionCoordinator.startSession('COUNTDOWN', 25, h1.profile.id);
  await h1.sessionCoordinator.pauseSession();
  assert.equal(h1.notifications.dispatchCount, 0);
  await h1.sessionCoordinator.giveUpCountdown();
  assert.equal(h1.notifications.dispatchCount, 0);

  const h2 = await createHarness();
  await h2.sessionCoordinator.startSession('STOPWATCH', 0, h2.profile.id);
  const now = Date.now();
  await h2.storage.updateCurrentSession((s) =>
    s ? { ...s, startedAt: now - 3 * 60 * 1000, lastCheckpointAt: now - 60 * 1000 } : s
  );
  await h2.sessionCoordinator.finishStopwatch();
  assert.equal(h2.notifications.dispatchCount, 0);

  const h3 = await createHarness();
  await h3.sessionCoordinator.startSession('POMODORO_STOPWATCH', 0, h3.profile.id);
  await h3.sessionCoordinator.finishStopwatch();
  assert.equal(h3.notifications.dispatchCount, 0);

  const h4 = await createHarness();
  const sReload = await h4.sessionCoordinator.startSession('COUNTDOWN', 25, h4.profile.id);
  await h4.sessionCoordinator.handleExtensionDisabledRecovery(sReload, 'EXTENSION_RELOADED');
  assert.equal(h4.notifications.dispatchCount, 0);

  const h5 = await createHarness();
  await h5.sessionCoordinator.startSession('COUNTDOWN', 25, h5.profile.id);
  await h5.storage.updateCurrentSession((s) =>
    s ? { ...s, lastHeartbeatAt: Date.now() - 120000, lastCheckpointAt: Date.now() - 120000 } : s
  );
  await h5.sessionCoordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });
  assert.equal(h5.notifications.dispatchCount, 0);
});

test('Notifications 6: Service Worker wake near Countdown completion dispatches exactly 1 notification', async () => {
  const { storage, profile, notifications, sessionCoordinator } = await createHarness();
  await sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);

  const pastStart = Date.now() - 25 * 60 * 1000 - 200;
  await storage.updateCurrentSession((s) => (s ? { ...s, startedAt: pastStart } : s));

  await sessionCoordinator.handleLifecycleEvent({ reason: 'SERVICE_WORKER_WAKE' });
  await sessionCoordinator.completeCountdown();

  assert.equal(notifications.dispatchCount, 1);
  assert.equal((await storage.getCurrentSession())?.notificationSent, true);
});

test('Notifications 8 & 9: Bidirectional Error Isolation between Music Player and Session Notifications', async () => {
  const hOk = await createHarness();
  await hOk.musicCoordinator.playTrack(hOk.testCatalog[0].id);
  assert.equal((await hOk.musicCoordinator.getState()).status, 'PLAYING');

  await hOk.sessionCoordinator.startSession('COUNTDOWN', 20, hOk.profile.id);
  await hOk.sessionCoordinator.completeCountdown();

  assert.equal(hOk.notifications.dispatchCount, 1);
  assert.equal((await hOk.musicCoordinator.getState()).status, 'STOPPED');
  assert.equal(hOk.offscreen.open, false);

  const hMusicFail = await createHarness({ throwOnMusicHook: true });
  await hMusicFail.sessionCoordinator.startSession('COUNTDOWN', 15, hMusicFail.profile.id);
  const completed = await hMusicFail.sessionCoordinator.completeCountdown();
  assert.equal(completed?.status, 'COMPLETED');
  assert.equal(hMusicFail.notifications.dispatchCount, 1);

  const hNotifFail = await createHarness({ throwOnNotification: true });
  await hNotifFail.musicCoordinator.playTrack(hNotifFail.testCatalog[0].id);
  await hNotifFail.sessionCoordinator.startSession('COUNTDOWN', 15, hNotifFail.profile.id);
  const completed2 = await hNotifFail.sessionCoordinator.completeCountdown();
  assert.equal(completed2?.status, 'COMPLETED');
  assert.equal((await hNotifFail.musicCoordinator.getState()).status, 'STOPPED');
  assert.equal(hNotifFail.offscreen.open, false);
});

test('Notifications 10: Respects notificationsEnabled=false while soundEffects chime stays independent', async () => {
  const { storage, profile, notifications, sessionCoordinator } = await createHarness();
  await storage.updateSettings({ notificationsEnabled: false, chimeEnabled: true });

  await sessionCoordinator.startSession('COUNTDOWN', 10, profile.id);
  await sessionCoordinator.completeCountdown();
  assert.equal(notifications.dispatchCount, 0);

  let chimeCalls = 0;
  const played = playPhaseTransitionChime(
    'SHORT_BREAK',
    { chimeEnabled: true },
    {
      playFocusStartChime: () => {},
      playBreakStartChime: () => {
        chimeCalls++;
      },
    }
  );
  assert.equal(played, true);
  assert.equal(chimeCalls, 1);
});
