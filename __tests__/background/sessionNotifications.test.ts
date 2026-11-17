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
import { MUSIC_CATALOG } from '../../src/data/musicCatalog.ts';
import { AudioStatusSnapshot, OffscreenMusicCommand } from '../../src/types/music.ts';
import { playPhaseTransitionChime } from '../../src/ui/services/soundEffects.ts';

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
    if (command.action === 'LOAD_AND_PLAY') {
      this.audioStatus = {
        isPlaying: true,
        paused: false,
        currentTime: command.payload.positionSec,
        duration: 180,
        trackId: command.payload.trackId,
        src: command.payload.trackUrl,
      };
      return { ...this.audioStatus } as unknown as T;
    }
    if (command.action === 'STOP') {
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
  const musicCoordinator = new MusicCoordinator(storage, offscreen, MUSIC_CATALOG);

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
  };
}

test('Notifications 1 & 5: Countdown completion notifies ONCE with duration and deduplicates repeated alarms/calls', async () => {
  const { storage, profile, notifications, sessionCoordinator } = await createHarness();
  await sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);

  await sessionCoordinator.completeCountdown();
  await sessionCoordinator.completeCountdown(); // duplicate call
  await sessionCoordinator.completeCountdown(); // triplicate call

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

  // Interval 1 Focus -> Short Break (Phase notification, NOT full mission completion)
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

  // Short Break -> Focus Interval 2 (Phase notification)
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

  // Interval 2 Focus -> 100% Mission Complete notification
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
  // 3A. Standard Stopwatch >= 5 minutes
  const h1 = await createHarness();
  await h1.sessionCoordinator.startSession('STOPWATCH', 0, h1.profile.id);
  const now = Date.now();
  await h1.storage.updateCurrentSession((s) =>
    s ? { ...s, startedAt: now - 12 * 60 * 1000, lastCheckpointAt: now - 60 * 1000 } : s
  );
  await h1.sessionCoordinator.finishStopwatch();
  await h1.sessionCoordinator.finishStopwatch(); // duplicate check

  assert.equal(h1.notifications.dispatchCount, 1);
  const swNotif = Array.from(h1.notifications.notifications.values())[0];
  assert.ok(swNotif.message.includes('12'));

  // 3B. Pomodoro Stopwatch >= 1 completed interval
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
  // Pause + Give Up
  const h1 = await createHarness();
  await h1.sessionCoordinator.startSession('COUNTDOWN', 25, h1.profile.id);
  await h1.sessionCoordinator.pauseSession();
  assert.equal(h1.notifications.dispatchCount, 0);
  await h1.sessionCoordinator.giveUpCountdown();
  assert.equal(h1.notifications.dispatchCount, 0);

  // Stopwatch < 5m
  const h2 = await createHarness();
  await h2.sessionCoordinator.startSession('STOPWATCH', 0, h2.profile.id);
  const now = Date.now();
  await h2.storage.updateCurrentSession((s) =>
    s ? { ...s, startedAt: now - 3 * 60 * 1000, lastCheckpointAt: now - 60 * 1000 } : s
  );
  await h2.sessionCoordinator.finishStopwatch();
  assert.equal(h2.notifications.dispatchCount, 0);

  // Pomodoro Stopwatch 0 completed intervals
  const h3 = await createHarness();
  await h3.sessionCoordinator.startSession('POMODORO_STOPWATCH', 0, h3.profile.id);
  await h3.sessionCoordinator.finishStopwatch();
  assert.equal(h3.notifications.dispatchCount, 0);

  // Extension Reloaded
  const h4 = await createHarness();
  const sReload = await h4.sessionCoordinator.startSession('COUNTDOWN', 25, h4.profile.id);
  await h4.sessionCoordinator.handleExtensionDisabledRecovery(sReload, 'EXTENSION_RELOADED');
  assert.equal(h4.notifications.dispatchCount, 0);

  // Browser Closed startup recovery
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

  // Simulate SW waking right after target time elapsed while browser remained open
  const pastStart = Date.now() - 25 * 60 * 1000 - 200;
  await storage.updateCurrentSession((s) => (s ? { ...s, startedAt: pastStart } : s));

  await sessionCoordinator.handleLifecycleEvent({ reason: 'SERVICE_WORKER_WAKE' });
  // Follow-up alarm firing shortly after must be deduplicated
  await sessionCoordinator.completeCountdown();

  assert.equal(notifications.dispatchCount, 1);
  assert.equal((await storage.getCurrentSession())?.notificationSent, true);
});

test('Notifications 8 & 9: Bidirectional Error Isolation between Music Player and Session Notifications', async () => {
  // 8. Normal happy path: Music stops AND notification fires together
  const hOk = await createHarness();
  await hOk.musicCoordinator.playTrack(MUSIC_CATALOG[0].id);
  assert.equal((await hOk.musicCoordinator.getState()).status, 'PLAYING');

  await hOk.sessionCoordinator.startSession('COUNTDOWN', 20, hOk.profile.id);
  await hOk.sessionCoordinator.completeCountdown();

  assert.equal(hOk.notifications.dispatchCount, 1);
  assert.equal((await hOk.musicCoordinator.getState()).status, 'STOPPED');
  assert.equal(hOk.offscreen.open, false);

  // 9A. Music hook throws catastrophic error -> Notification MUST STILL succeed and session must commit
  const hMusicFail = await createHarness({ throwOnMusicHook: true });
  await hMusicFail.sessionCoordinator.startSession('COUNTDOWN', 15, hMusicFail.profile.id);
  const completed = await hMusicFail.sessionCoordinator.completeCountdown();
  assert.equal(completed?.status, 'COMPLETED');
  assert.equal(hMusicFail.notifications.dispatchCount, 1);

  // 9B. Chrome notifications.create throws error -> Music MUST STILL stop cleanly and session must commit
  const hNotifFail = await createHarness({ throwOnNotification: true });
  await hNotifFail.musicCoordinator.playTrack(MUSIC_CATALOG[0].id);
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
