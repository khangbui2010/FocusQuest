import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { ChromeOffscreenAdapter, IOffscreenAdapter } from '../../src/chrome/offscreenAdapter.ts';
import {
  AudioStatusSnapshot,
  MusicTrack,
  OffscreenMusicCommand,
  OffscreenMusicEvent,
  RemoteMusicCatalog,
} from '../../src/types/music.ts';
import {
  LOFI_BASE_URL,
  LOFI_CATALOG_CACHE_TTL_MS,
  parseRemoteCatalog,
} from '../../src/data/musicCatalog.ts';
import {
  MusicCoordinator,
  deriveMusicIntent,
} from '../../src/background/musicCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { buildPomodoroStageAlarmName } from '../../src/background/sessionCoordinator.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import {
  createOffscreenAudioController,
} from '../../src/offscreen/offscreen.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

function buildFixtureRawCatalog(includeTwelfthTrack = false): RemoteMusicCatalog {
  const tracks = [
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
      id: 'purrple-cat-rooftop-rendezvous',
      title: 'Rooftop Rendezvous',
      artist: 'Purrple Cat',
      album: 'City Nights 2',
      durationSec: 184,
      file: 'purrple-cat-city-nights-2-02-rooftop-rendezvous_25a6b224.mp3',
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
    {
      id: 'ikkun-barradeen-whisper',
      title: 'whisper',
      artist: 'ikkun (ex. Barradeen)',
      album: 'Free Stock Music',
      durationSec: 66,
      file: 'ikkun-barradeen-whisper.mp3',
      license: 'CC-BY-SA-3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/deed.en_US',
      sourceUrl: 'https://soundcloud.com/ikkunwastaken',
      modified: false,
    },
  ];

  if (includeTwelfthTrack) {
    tracks.push({
      id: 'online-added-track-12',
      title: 'Midnight Tea',
      artist: 'HoliznaCC0',
      album: 'Public Domain Lofi',
      durationSec: 150,
      file: 'midnight-tea.mp3',
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
      modified: false,
    });
  }

  return {
    schemaVersion: 1,
    updatedAt: includeTwelfthTrack ? '2026-11-18' : '2026-11-17',
    tracks,
  };
}

function getFixtureTracks(): MusicTrack[] {
  return parseRemoteCatalog(buildFixtureRawCatalog(false)).tracks;
}

class MockOffscreenAdapter implements IOffscreenAdapter {
  public documentOpen = false;
  public ensureCount = 0;
  public closeCount = 0;
  public commands: OffscreenMusicCommand[] = [];
  public failNextCommandError: Error | null = null;
  public audioStatus: AudioStatusSnapshot = {
    isPlaying: false,
    paused: true,
    currentTime: 0,
    duration: null,
    trackId: null,
    src: '',
  };

  async hasDocument(): Promise<boolean> {
    return this.documentOpen;
  }

  async ensureDocument(): Promise<void> {
    this.ensureCount++;
    this.documentOpen = true;
  }

  async closeDocument(): Promise<void> {
    this.closeCount++;
    this.documentOpen = false;
    this.audioStatus = {
      isPlaying: false,
      paused: true,
      currentTime: 0,
      duration: null,
      trackId: null,
      src: '',
    };
  }

  async sendCommand<T = unknown>(command: OffscreenMusicCommand): Promise<T | null> {
    this.commands.push(command);
    if (this.failNextCommandError) {
      const err = this.failNextCommandError;
      this.failNextCommandError = null;
      throw err;
    }

    switch (command.action) {
      case 'MUSIC_PLAY':
        this.audioStatus = {
          isPlaying: true,
          paused: false,
          currentTime: command.startAtSec,
          duration: 180,
          trackId: command.trackId ?? command.url,
          src: command.url,
        };
        return { ...this.audioStatus } as unknown as T;
      case 'MUSIC_PAUSE':
        this.audioStatus = { ...this.audioStatus, isPlaying: false, paused: true };
        return { ...this.audioStatus } as unknown as T;
      case 'MUSIC_STOP':
        this.audioStatus = {
          isPlaying: false,
          paused: true,
          currentTime: 0,
          duration: null,
          trackId: null,
          src: '',
        };
        return { ...this.audioStatus } as unknown as T;
      case 'MUSIC_SEEK':
        this.audioStatus = { ...this.audioStatus, currentTime: command.positionSec };
        return { ...this.audioStatus } as unknown as T;
      case 'MUSIC_SET_VOLUME':
        return { ...this.audioStatus } as unknown as T;
      case 'MUSIC_GET_STATUS':
        return { ...this.audioStatus } as unknown as T;
      default:
        return null;
    }
  }
}

test('MusicCoordinator: Play, Pause, Resume, Stop, Seek, Volume/Mute, Next, Previous', async () => {
  const tracks = getFixtureTracks();
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();
  const mc = new MusicCoordinator(storage, offscreen, tracks);

  // 1. Play default first track
  let state = await mc.playTrack();
  assert.equal(state.status, 'PLAYING');
  assert.equal(state.currentTrackId, tracks[0].id);
  assert.equal(offscreen.documentOpen, true);
  const firstCmd = offscreen.commands.at(-1);
  assert.equal(firstCmd?.action, 'MUSIC_PLAY');
  if (firstCmd?.action === 'MUSIC_PLAY') {
    assert.equal(firstCmd.url, `${LOFI_BASE_URL}${tracks[0].file}`);
  }

  // 2. Seek to 42s and Pause
  state = await mc.seek(42);
  assert.equal(state.positionSec, 42);
  state = await mc.pause();
  assert.equal(state.status, 'PAUSED');
  assert.equal(state.positionSec, 42);
  assert.equal(state.musicEnabled, false);

  // 3. Resume preserves paused position even when Chrome closed offscreen document after 30s
  offscreen.documentOpen = false;
  state = await mc.resume();
  assert.equal(state.status, 'PLAYING');
  assert.equal(state.positionSec, 42);
  assert.equal(offscreen.documentOpen, true);
  const lastCmd = offscreen.commands.at(-1);
  assert.equal(lastCmd?.action, 'MUSIC_PLAY');
  if (lastCmd?.action === 'MUSIC_PLAY') {
    assert.equal(lastCmd.startAtSec, 42);
  }

  // 4. Volume & Mute
  state = await mc.setVolume(0.4, true);
  assert.equal(state.volume, 0.4);
  assert.equal(state.muted, true);

  // 5. Next & Previous dynamically traverse catalog
  state = await mc.next();
  assert.equal(state.currentTrackId, tracks[1].id);
  assert.equal(state.positionSec, 0);

  state = await mc.previous();
  assert.equal(state.currentTrackId, tracks[0].id);

  state = await mc.previous();
  assert.equal(state.currentTrackId, tracks[tracks.length - 1].id);

  // 6. Stop closes offscreen document and resets position
  state = await mc.stop();
  assert.equal(state.status, 'STOPPED');
  assert.equal(state.positionSec, 0);
  assert.equal(offscreen.documentOpen, false);
});

test('MusicCoordinator: Repeat modes (off, all, one), Shuffle, Position sync & Error events', async () => {
  const tracks = getFixtureTracks().slice(0, 3);
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();
  const mc = new MusicCoordinator(storage, offscreen, tracks);

  // Repeat ONE replays same track on MUSIC_ENDED
  await mc.playTrack(tracks[1].id);
  await mc.setRepeatMode('one');
  let state = await mc.handleOffscreenEvent({
    target: 'background',
    action: 'MUSIC_ENDED',
    trackId: tracks[1].id,
  });
  assert.equal(state.status, 'PLAYING');
  assert.equal(state.currentTrackId, tracks[1].id);

  // Periodic position sync updates saved positionSec
  state = await mc.handleOffscreenEvent({
    target: 'background',
    action: 'MUSIC_POSITION',
    trackId: tracks[1].id,
    positionSec: 77,
    durationSec: 184,
  });
  assert.equal(state.positionSec, 77);
  assert.equal(state.durationSec, 184);

  // Repeat OFF stops cleanly at last track
  await mc.setRepeatMode('off');
  await mc.playTrack(tracks[2].id);
  state = await mc.handleOffscreenEvent({
    target: 'background',
    action: 'MUSIC_ENDED',
    trackId: tracks[2].id,
  });
  assert.equal(state.status, 'STOPPED');
  assert.equal(offscreen.documentOpen, false);

  // Repeat ALL wraps last track -> first track
  await mc.setRepeatMode('all');
  await mc.playTrack(tracks[2].id);
  state = await mc.handleOffscreenEvent({
    target: 'background',
    action: 'MUSIC_ENDED',
    trackId: tracks[2].id,
  });
  assert.equal(state.status, 'PLAYING');
  assert.equal(state.currentTrackId, tracks[0].id);

  // Shuffle produces full permutation anchored on currentTrackId
  state = await mc.setShuffle(true);
  assert.equal(state.shuffle, true);
  assert.equal(state.shuffledOrder.length, 3);
  assert.equal(state.shuffledOrder[0], tracks[0].id);
  assert.deepEqual([...state.shuffledOrder].sort(), tracks.map((t) => t.id).sort());

  // Error event captures structured error codes cleanly
  state = await mc.handleOffscreenEvent({
    target: 'background',
    action: 'MUSIC_ERROR',
    code: 'network',
    trackId: tracks[0].id,
    message: 'Audio playback failed (network).',
  });
  assert.equal(state.status, 'ERROR');
  assert.equal(state.lastErrorCode, 'network');
  assert.equal(state.musicEnabled, false);
});

test('MusicCoordinator: Service Worker restart recovery syncs with live Offscreen Document and recovers if closed', async () => {
  const tracks = getFixtureTracks();
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();

  const mc1 = new MusicCoordinator(storage, offscreen, tracks);
  await mc1.playTrack(tracks[1].id);
  offscreen.audioStatus = {
    isPlaying: true,
    paused: false,
    currentTime: 65,
    duration: 184,
    trackId: tracks[1].id,
    src: `${LOFI_BASE_URL}${tracks[1].file}`,
  };

  const commandsBeforeRehydrate = offscreen.commands.length;
  const mc2 = new MusicCoordinator(storage, offscreen, tracks);
  const rehydrated = await mc2.ensureInitialized();

  assert.equal(rehydrated.status, 'PLAYING');
  assert.equal(rehydrated.currentTrackId, tracks[1].id);
  assert.equal(rehydrated.positionSec, 65);
  const newCmds = offscreen.commands.slice(commandsBeforeRehydrate);
  assert.equal(newCmds.some((c) => c.action === 'MUSIC_GET_STATUS'), true);
  assert.equal(newCmds.some((c) => c.action === 'MUSIC_PLAY'), false);

  // SW restarts after Offscreen Document was closed by Chrome while PLAYING at 65s
  offscreen.documentOpen = false;
  const mc3 = new MusicCoordinator(storage, offscreen, tracks);
  const recovered = await mc3.ensureInitialized();
  assert.equal(recovered.status, 'PLAYING');
  assert.equal(recovered.positionSec, 65);
  assert.equal(offscreen.documentOpen, true);
});

test('MusicCoordinator: never stores MP3 binary data in storage, only lightweight playback state', async () => {
  const tracks = getFixtureTracks();
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();
  const mc = new MusicCoordinator(storage, offscreen, tracks);

  await mc.playTrack(tracks[0].id);
  const rawStored = await adapter.get<Record<string, unknown>>(STORAGE_KEYS.MUSIC_STATE);
  assert.ok(rawStored);
  const serialized = JSON.stringify(rawStored);
  assert.ok(serialized.length < 2048, 'Persisted music state must remain lightweight metadata');
  assert.equal(serialized.includes('ID3'), false);
  assert.equal(serialized.includes('base64'), false);
});

test('deriveMusicIntent: pure intent truth table covers Running, Paused, Break, Terminal, and Idle', () => {
  const baseSession: SessionSnapshot = {
    id: 's1',
    mode: 'POMODORO_COUNTDOWN',
    profileId: 'p1',
    status: 'RUNNING',
    targetMinutes: 25,
    lockedMultiplier: 1,
    startedAt: 1000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1000,
    completedAt: null,
    rewardProcessed: false,
    pomodoroConfig: {
      focusDurationMinutes: 25,
      focusIntervalDurationMinutes: 25,
      shortBreakDurationMinutes: 5,
      longBreakDurationMinutes: 15,
      focusIntervalsPerCycle: 2,
      targetFocusSessions: 2,
      numberOfCycles: 1,
    },
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 1,
      currentCycle: 1,
      completedFocusCount: 0,
      totalCompletedFocusMinutes: 0,
      phaseStartedAt: 1000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      accumulatedCoins: 0,
      accumulatedXp: 0,
    },
  };

  assert.equal(
    deriveMusicIntent(null, { musicEnabled: true, playDuringBreak: false, stopMusicOnSessionEnd: true }),
    'play'
  );
  assert.equal(
    deriveMusicIntent(null, { musicEnabled: false, playDuringBreak: false, stopMusicOnSessionEnd: true }),
    'stop'
  );
  assert.equal(
    deriveMusicIntent(baseSession, { musicEnabled: true, playDuringBreak: false, stopMusicOnSessionEnd: true }),
    'play'
  );
  assert.equal(
    deriveMusicIntent(baseSession, { musicEnabled: false, playDuringBreak: false, stopMusicOnSessionEnd: true }),
    'pause'
  );
  assert.equal(
    deriveMusicIntent(
      { ...baseSession, status: 'PAUSED' },
      { musicEnabled: true, playDuringBreak: false, stopMusicOnSessionEnd: true }
    ),
    'pause'
  );

  const breakSession: SessionSnapshot = {
    ...baseSession,
    pomodoroState: { ...baseSession.pomodoroState!, currentPhase: 'SHORT_BREAK' },
  };
  assert.equal(
    deriveMusicIntent(breakSession, { musicEnabled: true, playDuringBreak: false, stopMusicOnSessionEnd: true }),
    'pause'
  );
  assert.equal(
    deriveMusicIntent(breakSession, { musicEnabled: true, playDuringBreak: true, stopMusicOnSessionEnd: true }),
    'play'
  );

  assert.equal(
    deriveMusicIntent(
      { ...baseSession, status: 'COMPLETED' },
      { musicEnabled: true, playDuringBreak: false, stopMusicOnSessionEnd: true }
    ),
    'stop'
  );
  assert.equal(
    deriveMusicIntent(
      { ...baseSession, status: 'COMPLETED' },
      { musicEnabled: true, playDuringBreak: false, stopMusicOnSessionEnd: false }
    ),
    'play'
  );
});

test('Session + Music Sync: Focus Pause/Resume survives 30s Offscreen closure & respects manual pause', async () => {
  const tracks = getFixtureTracks();
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter(), new MockTabsAdapter());
  const offscreen = new MockOffscreenAdapter();
  const musicCoordinator = new MusicCoordinator(storage, offscreen, tracks);

  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking,
    () => [],
    (event) => musicCoordinator.handleFocusSessionEnded(event),
    async (session, reason) => {
      await musicCoordinator.sync(session, reason);
    }
  );

  const profile = await profileManager.createProfile('MusicSyncProfile', ['example.com']);

  // Start Countdown session and play music at 38s
  await sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await musicCoordinator.playTrack(tracks[0].id);
  offscreen.audioStatus = { ...offscreen.audioStatus, currentTime: 38 };
  await musicCoordinator.seek(38);

  // 1. Pausing Focus session pauses music
  await sessionCoordinator.pauseSession();
  let mState = await musicCoordinator.getState();
  assert.equal(mState.status, 'PAUSED');
  assert.equal(mState.pausedBySession, true);
  assert.equal(mState.positionSec, 38);

  // 2. Simulate Chrome closing Offscreen Document after 30s idle while paused
  offscreen.documentOpen = false;

  // 3. Resuming Focus session recreates Offscreen Document & sends MUSIC_PLAY at saved 38s
  await sessionCoordinator.resumeSession();
  mState = await musicCoordinator.getState();
  assert.equal(mState.status, 'PLAYING');
  assert.equal(mState.pausedBySession, false);
  assert.equal(mState.positionSec, 38);
  assert.equal(offscreen.documentOpen, true);

  // 4. Manual music pause -> session pause -> session resume must NOT auto-start manually paused music
  await musicCoordinator.pause();
  assert.equal((await musicCoordinator.getState()).musicEnabled, false);
  await sessionCoordinator.pauseSession();
  await sessionCoordinator.resumeSession();
  assert.equal((await musicCoordinator.getState()).status, 'PAUSED');
  assert.equal((await musicCoordinator.getState()).musicEnabled, false);
});

test('Session + Music Sync: Pomodoro Break pauses music and playDuringBreak toggle reacts immediately', async () => {
  const tracks = getFixtureTracks();
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter(), new MockTabsAdapter());
  const offscreen = new MockOffscreenAdapter();
  const musicCoordinator = new MusicCoordinator(storage, offscreen, tracks);

  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking,
    () => [],
    (event) => musicCoordinator.handleFocusSessionEnded(event),
    async (session, reason) => {
      await musicCoordinator.sync(session, reason);
    }
  );

  const profile = await profileManager.createProfile('PomoMusicProfile', ['example.com']);
  const session = await sessionCoordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id, {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    focusIntervalsPerCycle: 2,
    targetFocusSessions: 2,
    numberOfCycles: 1,
  });

  await musicCoordinator.playTrack(tracks[0].id);
  await musicCoordinator.seek(51);

  // Transition FOCUS -> SHORT_BREAK with default playDuringBreak = false
  const alarmFocusEnd = buildPomodoroStageAlarmName(
    session.id,
    1,
    'FOCUS',
    session.pomodoroState!.phaseStartedAt
  );
  const breakSession = await sessionCoordinator.advancePomodoroStage(alarmFocusEnd);
  assert.equal(breakSession?.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.equal((await musicCoordinator.getState()).status, 'PAUSED');
  assert.equal((await musicCoordinator.getState()).pausedBySession, true);

  // Toggling playDuringBreak = true during break resumes music immediately
  await musicCoordinator.setPlayDuringBreak(true);
  assert.equal((await musicCoordinator.getState()).status, 'PLAYING');

  // Toggling playDuringBreak = false again pauses cleanly
  await musicCoordinator.setPlayDuringBreak(false);
  assert.equal((await musicCoordinator.getState()).status, 'PAUSED');

  // Transition SHORT_BREAK -> FOCUS resumes automatically
  const alarmBreakEnd = buildPomodoroStageAlarmName(
    session.id,
    1,
    'SHORT_BREAK',
    breakSession!.pomodoroState!.phaseStartedAt
  );
  await sessionCoordinator.advancePomodoroStage(alarmBreakEnd);
  assert.equal((await musicCoordinator.getState()).status, 'PLAYING');
  assert.equal((await musicCoordinator.getState()).positionSec, 51);
});

test('MusicCoordinator: dynamic online catalog cache TTL (6h), new-track auto-discovery, and offline fallback', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();

  let now = 1_700_000_000_000;
  let fetchCount = 0;
  let serverHasTwelfthTrack = false;
  let simulateOffline = false;

  const mc = new MusicCoordinator(storage, offscreen, {
    nowFn: () => now,
    fetchFn: async () => {
      fetchCount++;
      if (simulateOffline) {
        throw new Error('Network offline');
      }
      return new Response(JSON.stringify(buildFixtureRawCatalog(serverHasTwelfthTrack)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  // 1. Initial load fetches from online catalog & stores in cache
  await mc.ensureInitialized();
  assert.equal(fetchCount, 1);
  assert.equal(mc.getCatalog().length, 4);

  // 2. Subsequent getState within 6h reuses fresh cache (0 extra network calls)
  now += 2 * 60 * 60 * 1000;
  await mc.getState();
  assert.equal(fetchCount, 1);

  // 3. Server adds a new track; once TTL (6h) expires, coordinator discovers it automatically
  serverHasTwelfthTrack = true;
  now += LOFI_CATALOG_CACHE_TTL_MS;
  await mc.getState();
  assert.equal(fetchCount, 2);
  assert.equal(mc.getCatalog().length, 5);
  const newTrackState = await mc.playTrack('online-added-track-12');
  assert.equal(newTrackState.status, 'PLAYING');
  assert.equal(newTrackState.currentTrackId, 'online-added-track-12');

  // 4. Offline failure on TTL expiry falls back gracefully to stale cached tracks
  simulateOffline = true;
  now += LOFI_CATALOG_CACHE_TTL_MS + 1000;
  const offlineState = await mc.refreshCatalog(true);
  assert.equal(mc.getCatalog().length, 5);
  assert.equal(offlineState.status, 'PLAYING');
});

test('ChromeOffscreenAdapter single-flight guard + createOffscreenAudioController event handling', async () => {
  // Part A: Single-flight chrome.runtime.getContexts / chrome.offscreen.createDocument guard
  const globalChrome = globalThis as unknown as { chrome?: unknown };
  const prevChrome = globalChrome.chrome;
  let createCalls = 0;
  let openDocs: Array<{ contextType: string; documentUrl: string }> = [];

  globalChrome.chrome = {
    runtime: {
      getURL: (p: string) => `chrome-extension://test/${p}`,
      getContexts: async () => openDocs,
    },
    offscreen: {
      Reason: { AUDIO_PLAYBACK: 'AUDIO_PLAYBACK' },
      createDocument: async (params: { url: string }) => {
        createCalls++;
        await new Promise((r) => setTimeout(r, 10));
        openDocs = [
          { contextType: 'OFFSCREEN_DOCUMENT', documentUrl: `chrome-extension://test/${params.url}` },
        ];
      },
      closeDocument: async () => {
        openDocs = [];
      },
    },
  };

  try {
    const adapter = new ChromeOffscreenAdapter();
    await Promise.all([adapter.ensureDocument(), adapter.ensureDocument(), adapter.ensureDocument()]);
    assert.equal(createCalls, 1, 'Concurrent ensureDocument() calls must create offscreen document only once');
    assert.equal(await adapter.hasDocument(), true);
    await adapter.closeDocument();
    assert.equal(await adapter.hasDocument(), false);
  } finally {
    globalChrome.chrome = prevChrome;
  }

  // Part B: Offscreen audio controller handles deferred startAtSec seek, position throttle, ended & errors
  const listeners: Record<string, Array<() => void>> = {};
  const fakeAudio: {
    src: string;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
    paused: boolean;
    error: { code?: number; message?: string } | null;
    play(): Promise<void>;
    pause(): void;
    load(): void;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  } = {
    src: '',
    currentTime: 0,
    duration: 200,
    volume: 1,
    muted: false,
    paused: true,
    error: null,
    async play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
    load() {},
    addEventListener(type: string, fn: () => void) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn);
    },
  };

  const emitted: OffscreenMusicEvent[] = [];
  const ctrl = createOffscreenAudioController(fakeAudio, (evt) => emitted.push(evt), 5000);

  await ctrl.handleCommand({
    target: 'offscreen',
    action: 'MUSIC_PLAY',
    url: `${LOFI_BASE_URL}track.mp3`,
    volume: 0.6,
    startAtSec: 33,
    trackId: 't1',
  });

  // Trigger loadedmetadata -> seeks cleanly and emits MUSIC_POSITION
  fakeAudio.currentTime = 0;
  for (const fn of listeners['loadedmetadata'] || []) fn();
  assert.equal(fakeAudio.currentTime, 33);
  assert.equal(emitted.some((e) => e.action === 'MUSIC_POSITION' && e.target === 'background'), true);

  // Ended emits MUSIC_POSITION + MUSIC_ENDED
  for (const fn of listeners['ended'] || []) fn();
  assert.equal(emitted.some((e) => e.action === 'MUSIC_ENDED' && e.trackId === 't1'), true);

  // Decode error emits structured MUSIC_ERROR
  fakeAudio.error = { code: 3, message: 'MEDIA_ERR_DECODE' };
  for (const fn of listeners['error'] || []) fn();
  const errEvt = emitted.find((e) => e.action === 'MUSIC_ERROR');
  assert.ok(errEvt && errEvt.action === 'MUSIC_ERROR');
  if (errEvt && errEvt.action === 'MUSIC_ERROR') {
    assert.equal(errEvt.code, 'decode');
  }

  ctrl.dispose();
});
