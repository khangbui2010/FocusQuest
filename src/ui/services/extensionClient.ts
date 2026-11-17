import {
  ExtensionMessage,
  MessageResponse,
  FullSessionStateResponse,
  StartSessionPayload,
  PlaceBuildingPayload,
  RemoveBuildingPayload,
  ExpandLandPayload,
  PlaceBuildingResponseData,
  RemoveBuildingResponseData,
  ExpandLandResponseData,
  MusicStateResponseData,
  MusicPlayPayload,
  MusicSeekPayload,
  MusicSetVolumePayload,
  MusicSetShufflePayload,
  MusicSetRepeatPayload,
  MusicSetSyncWithSessionPayload,
  MusicSetPlayDuringBreakPayload,
} from '../../types/messages.ts';
import {
  LOFI_BASE_URL,
  LOFI_CATALOG_CACHE_TTL_MS,
  LOFI_CATALOG_URL,
  fetchRemoteMusicCatalog,
  getTrackById,
  isCatalogCacheFresh,
  resolveTrackStreamUrl,
} from '../../data/musicCatalog.ts';
import {
  CachedMusicCatalog,
  MusicPlayerState,
  MusicTrack,
  RepeatMode,
} from '../../types/music.ts';
import { deriveMusicIntent } from '../../background/musicCoordinator.ts';
import { FocusProfile } from '../../types/profiles.ts';
import { SessionSnapshot } from '../../types/session.ts';
import { PlayerEconomy } from '../../types/economy.ts';
import { DailyStatRecord, UserSettings } from '../../types/storageSchema.ts';
import { MultiplierRules } from '../../core/reward/multiplierRules.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
} from '../../core/civilization/civilizationState.ts';
import { GridMap } from '../../core/civilization/gridMap.ts';
import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../../core/civilization/constants.ts';
import { isValidCoordinate } from '../../core/civilization/placementValidator.ts';
import { evaluateExpansion } from '../../core/civilization/landExpansion.ts';
import { getBuildingDefinition } from '../../core/civilization/buildingCatalog.ts';
import { BuildingInstance, isEraUnlocked } from '../../core/civilization/buildingTypes.ts';
import { calculatePlayerLevel } from '../../core/economy/levelSystem.ts';
import { DEFAULT_REWARD_CONFIG, RewardEngine } from '../../core/reward/rewardEngine.ts';
import { extractBuildingCoinBonuses } from '../../core/civilization/civilizationBonusHelper.ts';
import { getCoinBonusMultiplier } from '../../core/economy/coinBonus.ts';
import { TimeCalculator } from '../../core/timer/timeCalculator.ts';
import { isSupportedLocale } from '../../i18n/translator.ts';
import { DomainNormalizer } from '../../core/profiles/domainNormalizer.ts';

const rewardEngine = new RewardEngine();

// Detect whether running in live Chrome extension environment
export const isChromeExtension = (): boolean => {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime !== 'undefined' &&
    typeof chrome.runtime.sendMessage === 'function'
  );
};

// Fallback in-memory mock state for web browser preview
const mockState: FullSessionStateResponse = {
  currentSession: null,
  activeProfile: {
    id: 'profile-study-research',
    name: 'Study & Research',
    allowedDomains: [],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  economy: {
    focusCoins: 120,
    totalXP: 450,
    level: 3,
  },
  todayStats: {
    date: new Date().toISOString().slice(0, 10),
    totalFocusMinutes: 50,
    completedSessions: 2,
    abandonedSessions: 0,
    coinsEarned: 100,
    xpEarned: 250,
  },
  isBlockingActive: false,
  lifetimeFocusMinutes: 50,
  settings: {
    soundEnabled: false,
    notificationsEnabled: true,
  },
};

let mockProfiles: FocusProfile[] = [
  {
    id: 'profile-study-research',
    name: 'Study & Research',
    allowedDomains: [],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'profile-deep-work-coding',
    name: 'Deep Work / Coding',
    allowedDomains: ['github.com', 'stackoverflow.com'],
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// Fallback in-memory mock civilization state
let mockCivilizationState: CivilizationState = createInitialCivilizationState();
let mockGridMap: GridMap = GridMap.fromSnapshot(mockCivilizationState.grid);

// Fallback in-memory mock Music Player state + dynamic online catalog cache + browser preview audio
const PREVIEW_CATALOG_CACHE_KEY = 'fq_preview_music_catalog_cache';
let mockMusicCatalog: readonly MusicTrack[] = [];
let mockCatalogCache: CachedMusicCatalog | null = null;
let mockMusicState: MusicPlayerState = {
  status: 'IDLE',
  currentTrackId: null,
  positionSec: 0,
  durationSec: null,
  volume: 0.7,
  muted: false,
  shuffle: false,
  repeatMode: 'off',
  shuffledOrder: [],
  syncWithSession: true,
  musicEnabled: false,
  playDuringBreak: false,
  pausedBySession: false,
  catalogUpdatedAt: null,
  lastUpdatedAt: Date.now(),
  lastError: null,
  lastErrorCode: null,
};

let previewAudio: HTMLAudioElement | null = null;

function readPreviewCatalogStorage(): CachedMusicCatalog | null {
  if (mockCatalogCache) return mockCatalogCache;
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREVIEW_CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMusicCatalog;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.tracks) ||
      parsed.tracks.length === 0
    ) {
      return null;
    }
    mockCatalogCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writePreviewCatalogStorage(cache: CachedMusicCatalog): void {
  mockCatalogCache = cache;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PREVIEW_CATALOG_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Ignore storage quota errors in preview
    }
  }
}

function applyMockCatalog(catalog: readonly MusicTrack[], updatedAt?: string): void {
  mockMusicCatalog = catalog;
  const ids = catalog.map((t) => t.id);
  const current =
    mockMusicState.currentTrackId && ids.includes(mockMusicState.currentTrackId)
      ? getTrackById(mockMusicState.currentTrackId, catalog)
      : catalog[0] ?? null;
  const trackChanged = Boolean(
    catalog.length > 0 && mockMusicState.currentTrackId && current?.id !== mockMusicState.currentTrackId
  );

  mockMusicState = {
    ...mockMusicState,
    status:
      mockMusicState.status === 'ERROR' && mockMusicState.lastErrorCode === 'network'
        ? 'IDLE'
        : mockMusicState.status,
    currentTrackId: current ? current.id : null,
    positionSec: trackChanged ? 0 : mockMusicState.positionSec,
    durationSec: trackChanged
      ? current?.durationSec ?? current?.duration ?? null
      : mockMusicState.durationSec ?? current?.durationSec ?? current?.duration ?? null,
    shuffledOrder: mockMusicState.shuffle
      ? mockMusicState.shuffledOrder.filter((id) => ids.includes(id))
      : ids,
    catalogUpdatedAt: updatedAt ?? mockMusicState.catalogUpdatedAt ?? null,
    lastError:
      mockMusicState.lastErrorCode === 'network' ? null : mockMusicState.lastError,
    lastErrorCode:
      mockMusicState.lastErrorCode === 'network' ? null : mockMusicState.lastErrorCode,
  };
}

async function ensureMockCatalogLoaded(forceRefresh = false): Promise<void> {
  const cached = readPreviewCatalogStorage();
  if (!forceRefresh && cached && isCatalogCacheFresh(cached, Date.now(), LOFI_CATALOG_CACHE_TTL_MS)) {
    applyMockCatalog(cached.tracks, cached.updatedAt);
    return;
  }
  if (typeof fetch !== 'function') {
    if (cached?.tracks?.length) {
      applyMockCatalog(cached.tracks, cached.updatedAt);
    } else {
      mockMusicCatalog = [];
      mockMusicState = {
        ...mockMusicState,
        status: 'ERROR',
        currentTrackId: null,
        lastError: 'Unable to load online Lofi catalog. Check your internet connection and retry.',
        lastErrorCode: 'network',
        lastUpdatedAt: Date.now(),
      };
    }
    return;
  }
  try {
    const fresh = await fetchRemoteMusicCatalog(
      (input, init) => fetch(input, init),
      LOFI_CATALOG_URL,
      LOFI_BASE_URL
    );
    writePreviewCatalogStorage(fresh);
    applyMockCatalog(fresh.tracks, fresh.updatedAt);
  } catch {
    if (cached?.tracks?.length) {
      applyMockCatalog(cached.tracks, cached.updatedAt);
    } else {
      mockMusicCatalog = [];
      mockMusicState = {
        ...mockMusicState,
        status: 'ERROR',
        currentTrackId: null,
        positionSec: 0,
        durationSec: null,
        musicEnabled: false,
        pausedBySession: false,
        lastError: 'Unable to load online Lofi catalog. Check your internet connection and retry.',
        lastErrorCode: 'network',
        lastUpdatedAt: Date.now(),
      };
    }
  }
}

function buildPreviewShuffledOrder(anchorTrackId: string | null, seed: number): string[] {
  const ids = mockMusicCatalog.map((t) => t.id);
  if (ids.length <= 1) return ids;
  const remaining = anchorTrackId ? ids.filter((id) => id !== anchorTrackId) : [...ids];
  let state = Math.abs(Math.floor(seed)) || 1337;
  for (let i = remaining.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = remaining[i];
    remaining[i] = remaining[j];
    remaining[j] = tmp;
  }
  return anchorTrackId && ids.includes(anchorTrackId)
    ? [anchorTrackId, ...remaining]
    : remaining;
}

function getPreviewQueueIds(): string[] {
  if (!mockMusicState.shuffle) return mockMusicCatalog.map((t) => t.id);
  const catalogIds = new Set(mockMusicCatalog.map((t) => t.id));
  const valid = mockMusicState.shuffledOrder.filter((id) => catalogIds.has(id));
  const missing = mockMusicCatalog.map((t) => t.id).filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

function stopPreviewAudioAndState(): void {
  if (previewAudio) {
    try {
      previewAudio.pause();
      previewAudio.currentTime = 0;
    } catch {
      // ignore preview audio error
    }
  }
  mockMusicState = {
    ...mockMusicState,
    status: 'STOPPED',
    positionSec: 0,
    musicEnabled: false,
    pausedBySession: false,
    lastUpdatedAt: Date.now(),
    lastError: null,
    lastErrorCode: null,
  };
}

function pausePreviewAudio(bySession: boolean): void {
  const currentPos =
    previewAudio && Number.isFinite(previewAudio.currentTime)
      ? previewAudio.currentTime
      : mockMusicState.positionSec;
  if (previewAudio) {
    try {
      previewAudio.pause();
    } catch {
      // ignore
    }
  }
  mockMusicState = {
    ...mockMusicState,
    status: 'PAUSED',
    positionSec: currentPos,
    musicEnabled: bySession ? Boolean(mockMusicState.musicEnabled) : false,
    pausedBySession: bySession && Boolean(mockMusicState.musicEnabled),
    lastUpdatedAt: Date.now(),
  };
}

function syncSimulatedMusicWithSession(): void {
  const intent = deriveMusicIntent(mockState.currentSession, {
    musicEnabled: Boolean(mockMusicState.musicEnabled ?? mockMusicState.status === 'PLAYING'),
    playDuringBreak: Boolean(mockMusicState.playDuringBreak),
    stopMusicOnSessionEnd: Boolean(mockMusicState.syncWithSession),
  });

  if (intent === 'stop') {
    if (
      mockMusicState.status === 'PLAYING' ||
      mockMusicState.status === 'PAUSED' ||
      mockMusicState.musicEnabled
    ) {
      stopPreviewAudioAndState();
    }
    return;
  }

  if (intent === 'pause') {
    if (mockMusicState.status === 'PLAYING') {
      pausePreviewAudio(true);
    }
    return;
  }

  if (mockMusicState.musicEnabled && mockMusicState.status !== 'PLAYING') {
    const track =
      getTrackById(mockMusicState.currentTrackId, mockMusicCatalog) ?? mockMusicCatalog[0];
    if (track) {
      startPreviewAudioTrack(track, mockMusicState.positionSec);
    }
  }
}

function startPreviewAudioTrack(track: MusicTrack, positionSec: number): void {
  const duration = track.durationSec ?? track.duration ?? null;
  const clampedPos =
    duration !== null ? Math.max(0, Math.min(duration, positionSec)) : Math.max(0, positionSec);

  if (typeof Audio !== 'undefined') {
    try {
      if (!previewAudio) {
        previewAudio = new Audio();
        previewAudio.addEventListener('ended', () => {
          const queue = getPreviewQueueIds();
          if (queue.length === 0) {
            stopPreviewAudioAndState();
            return;
          }
          if (mockMusicState.repeatMode === 'one') {
            const cur = getTrackById(mockMusicState.currentTrackId, mockMusicCatalog);
            if (cur) startPreviewAudioTrack(cur, 0);
            return;
          }
          const idx = mockMusicState.currentTrackId
            ? queue.indexOf(mockMusicState.currentTrackId)
            : -1;
          if ((idx === -1 || idx >= queue.length - 1) && mockMusicState.repeatMode === 'off') {
            stopPreviewAudioAndState();
            return;
          }
          const nextTrack = getTrackById(queue[(idx + 1) % queue.length], mockMusicCatalog);
          if (nextTrack) {
            startPreviewAudioTrack(nextTrack, 0);
          }
        });
      }
      const nextUrl = resolveTrackStreamUrl(track, LOFI_BASE_URL);
      if (previewAudio.dataset.trackId !== track.id) {
        previewAudio.src = nextUrl;
        previewAudio.dataset.trackId = track.id;
      }
      previewAudio.volume = mockMusicState.volume;
      previewAudio.muted = mockMusicState.muted;
      previewAudio.currentTime = clampedPos;
      void previewAudio.play().catch(() => undefined);
    } catch {
      // Ignore audio errors in sandbox/headless preview
    }
  }

  mockMusicState = {
    ...mockMusicState,
    status: 'PLAYING',
    currentTrackId: track.id,
    positionSec: clampedPos,
    durationSec: duration,
    musicEnabled: true,
    pausedBySession: false,
    lastUpdatedAt: Date.now(),
    lastError: null,
    lastErrorCode: null,
  };
}

function makeMusicResponse<T>(): MessageResponse<T> {
  if (previewAudio && mockMusicState.status === 'PLAYING') {
    const liveDur =
      Number.isFinite(previewAudio.duration) && previewAudio.duration > 0
        ? previewAudio.duration
        : mockMusicState.durationSec;
    const livePos = Number.isFinite(previewAudio.currentTime)
      ? Math.max(0, previewAudio.currentTime)
      : mockMusicState.positionSec;
    mockMusicState = {
      ...mockMusicState,
      positionSec: livePos,
      durationSec: liveDur,
    };
  }
  const data: MusicStateResponseData = {
    state: { ...mockMusicState },
    catalog: mockMusicCatalog,
  };
  return { success: true, data: data as unknown as T };
}

/**
 * Send an ExtensionMessage to the Background Service Worker.
 * If in standalone web preview, safely simulates responses.
 */
export async function sendExtensionMessage<T = unknown>(
  message: ExtensionMessage
): Promise<MessageResponse<T>> {
  if (isChromeExtension()) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message || 'Background worker unreachable.',
            });
          } else {
            resolve(response || { success: false, error: 'Empty response received.' });
          }
        });
      } catch (err) {
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  if (message.action.startsWith('MUSIC_')) {
    await ensureMockCatalogLoaded(message.action === 'MUSIC_REFRESH_CATALOG');
  }

  // Fallback simulator for non-extension preview
  return simulateMessageResponse<T>(message);
}

function simulateMessageResponse<T>(message: ExtensionMessage): MessageResponse<T> {
  const action = message.action;
  const now = Date.now();

  switch (action) {
    case 'GET_SESSION_STATE': {
      const currentSession = mockState.currentSession;
      const pomodoroState = currentSession?.pomodoroState;
      const pomodoroConfig = currentSession?.pomodoroConfig;
      if (
        currentSession?.status === 'RUNNING' &&
        (currentSession.mode === 'POMODORO_COUNTDOWN' ||
          currentSession.mode === 'POMODORO_STOPWATCH') &&
        pomodoroState &&
        pomodoroConfig
      ) {
        const intervalMins =
          pomodoroState.currentPhase === 'FOCUS'
            ? pomodoroConfig.focusIntervalDurationMinutes ?? pomodoroConfig.focusDurationMinutes ?? 25
            : pomodoroState.currentPhase === 'SHORT_BREAK'
            ? pomodoroConfig.shortBreakDurationMinutes
            : pomodoroConfig.longBreakDurationMinutes;
        const targetFinish =
          pomodoroState.phaseStartedAt +
          intervalMins * 60 * 1000 +
          (pomodoroState.phaseTotalPauseMs ?? 0);
        if (now >= targetFinish) {
          simulateMessageResponse({ action: 'ADVANCE_POMODORO_STAGE' });
        }
      }
      return {
        success: true,
        data: {
          ...mockState,
          settings: mockState.settings ? { ...mockState.settings } : undefined,
        } as unknown as T,
      };
    }

    case 'GET_PROFILES':
      return { success: true, data: [...mockProfiles] as unknown as T };

    case 'GET_ACTIVE_PROFILE': {
      if (mockProfiles.length === 0) {
        return { success: false, error: 'No profiles found in storage.' };
      }
      const found = mockProfiles.find((p) => p.id === mockState.activeProfile?.id);
      const active = found ?? mockProfiles.find((p) => p.isDefault) ?? mockProfiles[0];
      mockState.activeProfile = { ...active };
      return { success: true, data: { ...active } as unknown as T };
    }

    case 'START_SESSION': {
      const payload = (message as { payload: StartSessionPayload }).payload;
      const isPomodoro = payload.mode === 'POMODORO_COUNTDOWN' || payload.mode === 'POMODORO_STOPWATCH';
      const validatedPomoConfig = isPomodoro
        ? TimeCalculator.validatePomodoroConfig(payload.pomodoroConfig).config
        : undefined;
      const intervalDuration = validatedPomoConfig
        ? validatedPomoConfig.focusIntervalDurationMinutes ?? validatedPomoConfig.focusDurationMinutes
        : 25;

      const targetMins =
        payload.mode === 'COUNTDOWN'
          ? payload.targetMinutes
          : isPomodoro
          ? intervalDuration
          : 0;

      let lockedMultiplier = 1.0;
      let initialCoins = 0;
      let initialXp = 0;
      if (payload.mode === 'COUNTDOWN') {
        lockedMultiplier = MultiplierRules.getCountdownMultiplier(payload.targetMinutes);
      } else if (payload.mode === 'POMODORO_COUNTDOWN' && validatedPomoConfig) {
        const intervalsPerCycle =
          validatedPomoConfig.focusIntervalsPerCycle ?? validatedPomoConfig.targetFocusSessions;
        const cycles = validatedPomoConfig.numberOfCycles ?? 3;
        const totalQuestMinutes = intervalDuration * intervalsPerCycle * cycles;
        lockedMultiplier = MultiplierRules.getCountdownMultiplier(totalQuestMinutes);
        const coinBonuses = extractBuildingCoinBonuses(mockCivilizationState.buildings);
        const coinBonusFactor = getCoinBonusMultiplier(coinBonuses);
        initialCoins =
          totalQuestMinutes *
          DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
          lockedMultiplier *
          coinBonusFactor;
        initialXp =
          totalQuestMinutes * DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * lockedMultiplier;
      }

      const newSession: SessionSnapshot = {
        id: `mock_${now}`,
        mode: payload.mode,
        profileId: payload.profileId,
        status: 'RUNNING',
        targetMinutes: targetMins,
        lockedMultiplier,
        startedAt: now,
        currentPauseStartedAt: null,
        pauseCount: 0,
        totalPauseMs: 0,
        pauseHistory: [],
        lastHeartbeatAt: now,
        lastCheckpointAt: now,
        accumulatedFocusMs: 0,
        completedAt: null,
        rewardProcessed: false,
        pomodoroConfig: validatedPomoConfig,
        pomodoroState: isPomodoro
          ? {
              currentPhase: 'FOCUS',
              currentInterval: 1,
              currentCycle: 1,
              completedFocusCount: 0,
              phaseStartedAt: now,
              phaseTargetDurationMinutes: intervalDuration,
              phaseTotalPauseMs: 0,
              totalCompletedFocusMinutes: 0,
              accumulatedCoins: initialCoins,
              accumulatedXp: initialXp,
            }
          : undefined,
      };
      mockState.currentSession = newSession;
      mockState.isBlockingActive = true;
      syncSimulatedMusicWithSession();
      return { success: true, data: newSession as unknown as T };
    }

    case 'ADVANCE_POMODORO_STAGE':
    case 'SKIP_POMODORO_BREAK': {
      if (
        !mockState.currentSession ||
        !mockState.currentSession.pomodoroState ||
        !mockState.currentSession.pomodoroConfig
      ) {
        return {
          success: false,
          error:
            action === 'SKIP_POMODORO_BREAK'
              ? 'Cannot skip break while in Focus phase.'
              : 'No active pomodoro session.',
        };
      }
      const s = mockState.currentSession;
      const ps = s.pomodoroState!;
      const pc = s.pomodoroConfig!;

      if (action === 'SKIP_POMODORO_BREAK' && ps.currentPhase === 'FOCUS') {
        return {
          success: false,
          error: 'Cannot skip break while in Focus phase.',
        };
      }

      const intervalsPerCycle = pc.focusIntervalsPerCycle ?? pc.targetFocusSessions ?? 4;
      const cycles = pc.numberOfCycles ?? 3;
      const focusDuration = pc.focusIntervalDurationMinutes ?? pc.focusDurationMinutes ?? 25;

      if (ps.currentPhase === 'FOCUS') {
        const completed = ps.completedFocusCount + 1;
        const newTotalFocus = completed * focusDuration;
        const coinBonuses = extractBuildingCoinBonuses(mockCivilizationState.buildings);
        const coinBonusFactor = getCoinBonusMultiplier(coinBonuses);

        if (s.mode === 'POMODORO_COUNTDOWN') {
          const totalPlannedIntervals = intervalsPerCycle * cycles;
          const plannedFocusMinutes = totalPlannedIntervals * focusDuration;
          const cdMultiplier =
            s.lockedMultiplier || MultiplierRules.getCountdownMultiplier(plannedFocusMinutes);
          const totalCoins =
            plannedFocusMinutes *
            DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
            cdMultiplier *
            coinBonusFactor;
          const totalXp =
            plannedFocusMinutes * DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * cdMultiplier;

          if (completed >= totalPlannedIntervals) {
            const completedSession: SessionSnapshot = {
              ...s,
              status: 'COMPLETED',
              currentPauseStartedAt: null,
              pauseExpiresAt: null,
              completedAt: now,
              rewardProcessed: true,
              lockedMultiplier: cdMultiplier,
              accumulatedFocusMs: (s.accumulatedFocusMs ?? 0) + focusDuration * 60 * 1000,
              pomodoroState: {
                ...ps,
                currentPhase: 'FOCUS',
                completedFocusCount: completed,
                totalCompletedFocusMinutes: plannedFocusMinutes,
                accumulatedCoins: totalCoins,
                accumulatedXp: totalXp,
              },
            };
            mockState.currentSession = completedSession;
            mockState.isBlockingActive = false;
            mockState.economy.focusCoins += totalCoins;
            mockState.economy.totalXP += totalXp;
            mockState.economy.level = calculatePlayerLevel(mockState.economy.totalXP);
            mockState.lifetimeFocusMinutes =
              (mockState.lifetimeFocusMinutes ?? 0) + plannedFocusMinutes;
            syncSimulatedMusicWithSession();
            return { success: true, data: completedSession as unknown as T };
          }

          const isLong = completed % intervalsPerCycle === 0;
          const nextPhase = isLong ? 'LONG_BREAK' : 'SHORT_BREAK';
          const breakMins = isLong ? pc.longBreakDurationMinutes : pc.shortBreakDurationMinutes;

          s.lastCheckpointAt = now;
          s.accumulatedFocusMs = (s.accumulatedFocusMs ?? 0) + focusDuration * 60 * 1000;
          s.lockedMultiplier = cdMultiplier;
          s.pomodoroState = {
            ...ps,
            currentPhase: nextPhase,
            completedFocusCount: completed,
            phaseStartedAt: now,
            phaseTargetDurationMinutes: breakMins,
            phaseTotalPauseMs: 0,
            totalCompletedFocusMinutes: newTotalFocus,
            accumulatedCoins: totalCoins,
            accumulatedXp: totalXp,
          };
          mockState.isBlockingActive = false;
        } else {
          const isLong = completed % intervalsPerCycle === 0;
          const nextPhase = isLong ? 'LONG_BREAK' : 'SHORT_BREAK';
          const breakMins = isLong ? pc.longBreakDurationMinutes : pc.shortBreakDurationMinutes;
          const settlement = rewardEngine.calculatePomodoroCumulativeReward({
            mode: 'POMODORO_STOPWATCH',
            totalCompletedFocusMinutes: newTotalFocus,
            coinBonuses,
          });
          s.lastCheckpointAt = now;
          s.accumulatedFocusMs = (s.accumulatedFocusMs ?? 0) + focusDuration * 60 * 1000;
          s.lockedMultiplier = settlement.multiplier;
          s.pomodoroState = {
            ...ps,
            currentPhase: nextPhase,
            completedFocusCount: completed,
            phaseStartedAt: now,
            phaseTargetDurationMinutes: breakMins,
            phaseTotalPauseMs: 0,
            totalCompletedFocusMinutes: newTotalFocus,
            accumulatedCoins: settlement.totalCoins,
            accumulatedXp: settlement.totalXp,
          };
          mockState.isBlockingActive = false;
        }
      } else {
        let nextCycle = ps.currentCycle ?? 1;
        let nextInterval: number;
        if (ps.currentPhase === 'LONG_BREAK') {
          nextCycle += 1;
          nextInterval = 1;
        } else {
          nextInterval = ps.currentInterval + 1;
        }
        s.lastCheckpointAt = now;
        s.pomodoroState = {
          ...ps,
          currentPhase: 'FOCUS',
          currentInterval: nextInterval,
          currentCycle: nextCycle,
          phaseStartedAt: now,
          phaseTargetDurationMinutes: focusDuration,
          phaseTotalPauseMs: 0,
        };
        mockState.isBlockingActive = true;
      }
      syncSimulatedMusicWithSession();
      return { success: true, data: s as unknown as T };
    }

    case 'PAUSE_SESSION': {
      if (!mockState.currentSession) return { success: false, error: 'No active session.' };
      const s = mockState.currentSession;
      let newAccumulated = s.accumulatedFocusMs ?? 0;
      const isBreak =
        s.pomodoroState &&
        (s.pomodoroState.currentPhase === 'SHORT_BREAK' ||
          s.pomodoroState.currentPhase === 'LONG_BREAK');
      if (!isBreak) {
        const lastCheckpoint = s.lastCheckpointAt ?? s.startedAt;
        const deltaMs = Math.max(0, now - lastCheckpoint);
        newAccumulated += deltaMs;
      }
      mockState.currentSession = {
        ...s,
        status: 'PAUSED',
        currentPauseStartedAt: now,
        pauseCount: s.pauseCount + 1,
        lastHeartbeatAt: now,
        lastCheckpointAt: now,
        accumulatedFocusMs: newAccumulated,
      };
      mockState.isBlockingActive = false;
      syncSimulatedMusicWithSession();
      return { success: true, data: mockState.currentSession as unknown as T };
    }

    case 'RESUME_SESSION': {
      if (!mockState.currentSession) return { success: false, error: 'No session to resume.' };
      const s = mockState.currentSession;
      const pauseDuration = s.currentPauseStartedAt
        ? now - s.currentPauseStartedAt
        : 0;
      mockState.currentSession = {
        ...s,
        status: 'RUNNING',
        currentPauseStartedAt: null,
        totalPauseMs: s.totalPauseMs + pauseDuration,
        lastHeartbeatAt: now,
        lastCheckpointAt: now,
      };
      syncSimulatedMusicWithSession();
      return { success: true, data: mockState.currentSession as unknown as T };
    }

    case 'HEARTBEAT': {
      if (!mockState.currentSession) return { success: true, data: null as unknown as T };
      const s = mockState.currentSession;
      if (s.status === 'RUNNING') {
        const isBreak =
          s.pomodoroState &&
          (s.pomodoroState.currentPhase === 'SHORT_BREAK' ||
            s.pomodoroState.currentPhase === 'LONG_BREAK');
        let newAccumulated = s.accumulatedFocusMs ?? 0;
        if (!isBreak) {
          const lastCheckpoint = s.lastCheckpointAt ?? s.startedAt;
          newAccumulated += Math.max(0, now - lastCheckpoint);
        }
        mockState.currentSession = {
          ...s,
          lastHeartbeatAt: now,
          lastCheckpointAt: now,
          accumulatedFocusMs: newAccumulated,
        };
      } else {
        mockState.currentSession = {
          ...s,
          lastHeartbeatAt: now,
        };
      }
      return { success: true, data: mockState.currentSession as unknown as T };
    }

    case 'GIVE_UP_SESSION': {
      if (!mockState.currentSession) return { success: false, error: 'No session.' };
      mockState.currentSession = {
        ...mockState.currentSession,
        status: 'ABANDONED',
        completedAt: now,
        rewardProcessed: true,
      };
      mockState.isBlockingActive = false;
      syncSimulatedMusicWithSession();
      return { success: true, data: mockState.currentSession as unknown as T };
    }

    case 'FINISH_STOPWATCH': {
      if (!mockState.currentSession) return { success: false, error: 'No session.' };
      const s = mockState.currentSession;
      if (s.mode !== 'STOPWATCH' && s.mode !== 'POMODORO_STOPWATCH') {
        return { success: false, error: "Cannot finish countdown with 'finishStopwatch'." };
      }
      if (s.rewardProcessed || s.status === 'COMPLETED') {
        return {
          success: true,
          data: {
            session: s,
            coinsEarned: 0,
            xpEarned: 0,
          } as unknown as T,
        };
      }

      let totalPauseMs = s.totalPauseMs;
      let currentPauseDurationMs = 0;
      const pauseHistory = [...s.pauseHistory];
      if (s.status === 'PAUSED' && s.currentPauseStartedAt) {
        const pRecord = TimeCalculator.finalizePause(s.currentPauseStartedAt, now);
        totalPauseMs += pRecord.durationMs;
        currentPauseDurationMs = pRecord.durationMs;
        pauseHistory.push(pRecord);
      }

      const coinBonuses = extractBuildingCoinBonuses(mockCivilizationState.buildings);
      let coinsEarned = 0;
      let xpEarned = 0;
      let lockedMultiplier = 1.0;
      let updatedPomodoroState = s.pomodoroState;
      let actualFocusMins = 0;

      if (s.mode === 'POMODORO_STOPWATCH' && s.pomodoroState && s.pomodoroConfig) {
        let pState = s.pomodoroState;
        const pConfig = s.pomodoroConfig;
        const intervalDuration =
          pConfig.focusIntervalDurationMinutes ?? pConfig.focusDurationMinutes ?? 25;

        const phaseTotalPauseMs = (pState.phaseTotalPauseMs ?? 0) + currentPauseDurationMs;
        if (currentPauseDurationMs > 0) {
          pState = {
            ...pState,
            phaseTotalPauseMs,
          };
        }

        let intervalCompletedAtFinish = false;
        if (pState.currentPhase === 'FOCUS') {
          const targetFinish = pState.phaseStartedAt + intervalDuration * 60 * 1000 + phaseTotalPauseMs;
          if (now >= targetFinish) {
            intervalCompletedAtFinish = true;
            const newCompleted = pState.completedFocusCount + 1;
            const newFocusMins = newCompleted * intervalDuration;
            pState = {
              ...pState,
              completedFocusCount: newCompleted,
              totalCompletedFocusMinutes: newFocusMins,
            };
          }
        }

        const completedIntervals = pState.completedFocusCount;
        const rewardFocusMinutes = completedIntervals * intervalDuration;

        actualFocusMins = rewardFocusMinutes;
        if (pState.currentPhase === 'FOCUS' && !intervalCompletedAtFinish) {
          const rawCurrentFocusMs = Math.max(0, now - pState.phaseStartedAt - phaseTotalPauseMs);
          actualFocusMins += Math.floor(rawCurrentFocusMs / 60000);
        }

        if (rewardFocusMinutes > 0) {
          const settlement = rewardEngine.calculatePomodoroCumulativeReward({
            mode: 'POMODORO_STOPWATCH',
            totalCompletedFocusMinutes: rewardFocusMinutes,
            coinBonuses,
          });
          lockedMultiplier = settlement.multiplier;
          coinsEarned = settlement.totalCoins;
          xpEarned = settlement.totalXp;
        }

        updatedPomodoroState = {
          ...pState,
          totalCompletedFocusMinutes: rewardFocusMinutes,
          accumulatedCoins: coinsEarned,
          accumulatedXp: xpEarned,
        };
      } else {
        const elapsed = TimeCalculator.calculateElapsedTime({
          startedAt: s.startedAt,
          currentTime: now,
          status: 'RUNNING',
          currentPauseStartedAt: null,
          totalCompletedPauseMs: totalPauseMs,
        });
        actualFocusMins = elapsed.actualFocusMinutes;

        const reward = rewardEngine.calculateReward({
          mode: 'STOPWATCH',
          status: 'COMPLETED',
          targetMinutes: 0,
          actualFocusMinutes: elapsed.actualFocusMinutes,
          coinBonuses,
        });

        coinsEarned = reward.coinsEarned;
        xpEarned = reward.xpEarned;
        lockedMultiplier = reward.multiplier;
      }

      const updatedSession: SessionSnapshot = {
        ...s,
        status: 'COMPLETED',
        currentPauseStartedAt: null,
        pauseExpiresAt: null,
        totalPauseMs,
        pauseHistory,
        completedAt: now,
        rewardProcessed: true,
        lockedMultiplier,
        pomodoroState: updatedPomodoroState,
      };

      mockState.currentSession = updatedSession;
      mockState.isBlockingActive = false;

      // Update mock economy and stats
      mockState.economy.focusCoins += coinsEarned;
      mockState.economy.totalXP += xpEarned;
      mockState.economy.level = calculatePlayerLevel(mockState.economy.totalXP);

      if (actualFocusMins > 0) {
        mockState.lifetimeFocusMinutes = (mockState.lifetimeFocusMinutes ?? 0) + actualFocusMins;
      }

      if (mockState.todayStats && actualFocusMins > 0) {
        mockState.todayStats.totalFocusMinutes += actualFocusMins;
        mockState.todayStats.coinsEarned += coinsEarned;
        mockState.todayStats.xpEarned += xpEarned;
        const isCompletedSession =
          s.mode === 'POMODORO_STOPWATCH'
            ? (updatedPomodoroState?.completedFocusCount ?? 0) > 0
            : actualFocusMins >= 5;
        if (isCompletedSession) {
          mockState.todayStats.completedSessions += 1;
        }
      }

      syncSimulatedMusicWithSession();

      return {
        success: true,
        data: {
          session: updatedSession,
          coinsEarned,
          xpEarned,
        } as unknown as T,
      };
    }

    case 'RESET_SESSION': {
      mockState.currentSession = null;
      mockState.isBlockingActive = false;
      return { success: true, data: undefined as unknown as T };
    }

    case 'SWITCH_PROFILE': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return { success: false, error: 'Cannot switch active profile during a focus session. Finish your session first.' };
      }
      const pId = (message as { payload: { profileId: string } }).payload.profileId;
      const found = mockProfiles.find((p) => p.id === pId);
      if (found) {
        mockState.activeProfile = found;
        return { success: true, data: found as unknown as T };
      }
      return { success: false, error: 'Profile not found' };
    }

    case 'ADD_DOMAIN': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return { success: false, error: 'Allowlist cannot be modified during a focus session. Finish your session first.' };
      }
      const { profileId, domainPattern } = (
        message as { payload: { profileId: string; domainPattern: string } }
      ).payload;
      const validation = DomainNormalizer.validateAllowlistPattern(domainPattern);
      if (!validation.isValid) {
        return { success: false, error: `Cannot add domain: ${validation.error}` };
      }
      const p = mockProfiles.find((x) => x.id === profileId);
      if (p) {
        if (!p.allowedDomains.includes(validation.normalizedDomain)) {
          p.allowedDomains.push(validation.normalizedDomain);
          p.updatedAt = now;
        }
        if (mockState.activeProfile?.id === profileId) {
          mockState.activeProfile = { ...p, allowedDomains: [...p.allowedDomains] };
        }
        return { success: true, data: { ...p, allowedDomains: [...p.allowedDomains] } as unknown as T };
      }
      return { success: false, error: `Profile with ID '${profileId}' not found.` };
    }

    case 'REMOVE_DOMAIN': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return { success: false, error: 'Allowlist cannot be modified during a focus session. Finish your session first.' };
      }
      const { profileId, domainPattern } = (
        message as { payload: { profileId: string; domainPattern: string } }
      ).payload;
      const normalizedTarget = DomainNormalizer.normalizeHostname(domainPattern);
      const p = mockProfiles.find((x) => x.id === profileId);
      if (p) {
        p.allowedDomains = p.allowedDomains.filter(
          (d) => d.toLowerCase() !== normalizedTarget.toLowerCase()
        );
        p.updatedAt = now;
        if (mockState.activeProfile?.id === profileId) {
          mockState.activeProfile = { ...p, allowedDomains: [...p.allowedDomains] };
        }
        return { success: true, data: { ...p, allowedDomains: [...p.allowedDomains] } as unknown as T };
      }
      return { success: false, error: `Profile with ID '${profileId}' not found.` };
    }

    case 'CREATE_PROFILE': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return { success: false, error: 'Cannot create profile during a focus session. Finish your session first.' };
      }
      const { name, initialDomains } = (
        message as { payload: { name: string; initialDomains?: string[] } }
      ).payload;
      const trimmed = (name || '').trim();
      if (!trimmed) {
        return { success: false, error: 'Profile name cannot be empty or whitespace.' };
      }
      if (trimmed.length > 50) {
        return { success: false, error: 'Profile name cannot exceed 50 characters.' };
      }
      const lower = trimmed.toLowerCase();
      if (mockProfiles.some((p) => p.name.trim().toLowerCase() === lower)) {
        return { success: false, error: `A profile with the name '${trimmed}' already exists.` };
      }
      const normalizedDomains: string[] = [];
      for (const d of initialDomains || []) {
        const val = DomainNormalizer.validateAllowlistPattern(d);
        if (!val.isValid) {
          return { success: false, error: `Cannot create profile: ${val.error}` };
        }
        if (!normalizedDomains.includes(val.normalizedDomain)) {
          normalizedDomains.push(val.normalizedDomain);
        }
      }
      const newP: FocusProfile = {
        id: `prof_${now}_${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        allowedDomains: normalizedDomains,
        isDefault: mockProfiles.length === 0,
        createdAt: now,
        updatedAt: now,
      };
      mockProfiles.push(newP);
      if (!mockState.activeProfile) {
        mockState.activeProfile = { ...newP };
      }
      return { success: true, data: newP as unknown as T };
    }

    case 'RENAME_PROFILE': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return { success: false, error: 'Cannot rename profile during a focus session. Finish your session first.' };
      }
      const payload = (message as { payload?: { profileId?: string; newName?: string } }).payload;
      if (!payload?.profileId || typeof payload.newName !== 'string') {
        return { success: false, error: 'RENAME_PROFILE requires profileId and newName.' };
      }
      const trimmed = payload.newName.trim();
      if (!trimmed) {
        return { success: false, error: 'Profile name cannot be empty or whitespace.' };
      }
      if (trimmed.length > 50) {
        return { success: false, error: 'Profile name cannot exceed 50 characters.' };
      }
      const targetIndex = mockProfiles.findIndex((p) => p.id === payload.profileId);
      if (targetIndex === -1) {
        return { success: false, error: `Profile with ID '${payload.profileId}' not found.` };
      }
      const lower = trimmed.toLowerCase();
      if (mockProfiles.some((p) => p.id !== payload.profileId && p.name.trim().toLowerCase() === lower)) {
        return { success: false, error: `A profile with the name '${trimmed}' already exists.` };
      }
      const updatedProfile: FocusProfile = {
        ...mockProfiles[targetIndex],
        name: trimmed,
        updatedAt: now,
      };
      mockProfiles[targetIndex] = updatedProfile;
      if (mockState.activeProfile?.id === updatedProfile.id) {
        mockState.activeProfile = { ...updatedProfile };
      }
      return { success: true, data: updatedProfile as unknown as T };
    }

    case 'DELETE_PROFILE': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return { success: false, error: 'Cannot delete profile during a focus session. Finish your session first.' };
      }
      const payload = (message as { payload?: { profileId?: string; replacementActiveProfileId?: string } }).payload;
      if (!payload?.profileId) {
        return { success: false, error: 'DELETE_PROFILE requires profileId.' };
      }
      const targetIndex = mockProfiles.findIndex((p) => p.id === payload.profileId);
      if (targetIndex === -1) {
        return { success: false, error: `Profile with ID '${payload.profileId}' not found.` };
      }
      if (mockProfiles.length <= 1) {
        return { success: false, error: 'Cannot delete the only remaining profile in the system.' };
      }
      const deletedProfile = mockProfiles[targetIndex];
      const remaining = mockProfiles.filter((p) => p.id !== payload.profileId);
      let nextActiveId = mockState.activeProfile?.id ?? remaining[0].id;
      if (mockState.activeProfile?.id === payload.profileId) {
        if (payload.replacementActiveProfileId) {
          const replacement = remaining.find((p) => p.id === payload.replacementActiveProfileId);
          if (!replacement) {
            return {
              success: false,
              error: `Replacement active profile with ID '${payload.replacementActiveProfileId}' does not exist.`,
            };
          }
          nextActiveId = replacement.id;
          mockState.activeProfile = { ...replacement };
        } else {
          nextActiveId = remaining[0].id;
          mockState.activeProfile = { ...remaining[0] };
        }
      }
      mockProfiles = remaining;
      return {
        success: true,
        data: {
          deletedProfile,
          newActiveProfileId: nextActiveId,
        } as unknown as T,
      };
    }

    case 'GET_ECONOMY':
      return { success: true, data: { ...mockState.economy } as unknown as T };

    case 'GET_CIVILIZATION_STATE': {
      return {
        success: true,
        data: { ...mockCivilizationState } as unknown as T,
      };
    }

    case 'PLACE_BUILDING': {
      const { buildingDefinitionId, position } = (
        message as { payload: PlaceBuildingPayload }
      ).payload;

      const def = getBuildingDefinition(buildingDefinitionId);
      if (!def) {
        return { success: false, error: `Unknown building definition: "${buildingDefinitionId}"` };
      }

      const currentLevel = calculatePlayerLevel(mockState.economy.totalXP);
      if (currentLevel < def.unlockRequirements.minPlayerLevel) {
        return {
          success: false,
          error: `Building locked: requires Player Level ${def.unlockRequirements.minPlayerLevel}.`,
        };
      }

      const lifetimeMinutes = mockState.lifetimeFocusMinutes ?? 0;
      if (lifetimeMinutes < def.unlockRequirements.minTotalFocusMinutes) {
        return {
          success: false,
          error: `Building locked: requires ${def.unlockRequirements.minTotalFocusMinutes} lifetime focus minutes.`,
        };
      }

      if (
        def.unlockRequirements.minEra &&
        !isEraUnlocked(mockCivilizationState.era, def.unlockRequirements.minEra)
      ) {
        return {
          success: false,
          error: `Building locked: requires Era ${def.unlockRequirements.minEra}.`,
        };
      }

      if (mockState.economy.focusCoins < def.baseCost) {
        return {
          success: false,
          error: `Insufficient coins: requires ${def.baseCost} Coins, but balance is ${mockState.economy.focusCoins}.`,
        };
      }

      const validation = mockGridMap.canPlaceBuilding(position, def.footprint);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Cannot place building at (${position.x}, ${position.y}): ${validation.reason || 'Placement invalid'}.`,
        };
      }

      const instanceId = `bld_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const placeOp = mockGridMap.placeBuilding(instanceId, position, def.footprint);
      if (!placeOp.success) {
        return {
          success: false,
          error: `Placement operation failed: ${placeOp.reason}`,
        };
      }

      mockState.economy.focusCoins -= def.baseCost;

      const newBuilding: BuildingInstance = {
        id: instanceId,
        definitionId: def.id,
        position: { x: position.x, y: position.y },
        level: 1,
        placedAt: Date.now(),
      };

      mockCivilizationState = {
        ...mockCivilizationState,
        grid: mockGridMap.toSnapshot(),
        buildings: [...mockCivilizationState.buildings, newBuilding],
        lastUpdated: Date.now(),
      };

      const resData: PlaceBuildingResponseData = {
        building: newBuilding,
        civilizationState: mockCivilizationState,
        economy: { ...mockState.economy },
      };

      return {
        success: true,
        data: resData as unknown as T,
      };
    }

    case 'REMOVE_BUILDING': {
      const { buildingInstanceId } = (
        message as { payload: RemoveBuildingPayload }
      ).payload;

      const idx = mockCivilizationState.buildings.findIndex((b) => b.id === buildingInstanceId);
      if (idx === -1) {
        return { success: false, error: `Building instance "${buildingInstanceId}" not found.` };
      }

      const removeOp = mockGridMap.removeBuilding(buildingInstanceId);
      if (!removeOp.success) {
        return { success: false, error: `Failed to remove building: ${removeOp.reason}` };
      }

      const updatedBuildings = mockCivilizationState.buildings.filter(
        (b) => b.id !== buildingInstanceId
      );

      mockCivilizationState = {
        ...mockCivilizationState,
        grid: mockGridMap.toSnapshot(),
        buildings: updatedBuildings,
        lastUpdated: Date.now(),
      };

      const resData: RemoveBuildingResponseData = {
        removedBuildingId: buildingInstanceId,
        civilizationState: mockCivilizationState,
      };

      return {
        success: true,
        data: resData as unknown as T,
      };
    }

    case 'EXPAND_LAND': {
      const payload = (message as { payload: ExpandLandPayload }).payload;
      if (!payload || typeof payload !== 'object') {
        return { success: false, error: 'EXPAND_LAND requires payload object.' };
      }

      const rawPayload = payload as unknown as Record<string, unknown>;
      if ('direction' in rawPayload || 'slotIndex' in rawPayload) {
        return {
          success: false,
          error:
            'EXPAND_LAND requires origin coordinates only; direction and slotIndex are not supported.',
        };
      }

      if (!isValidCoordinate(payload.origin)) {
        return {
          success: false,
          error: 'EXPAND_LAND requires valid origin coordinates.',
        };
      }

      if (payload.origin.x % CHUNK_WIDTH !== 0 || payload.origin.y % CHUNK_HEIGHT !== 0) {
        return {
          success: false,
          error: `Land expansion failed: INVALID_ORIGIN (origin must align to ${CHUNK_WIDTH}x${CHUNK_HEIGHT} chunk grid).`,
        };
      }

      const playerLevel = Math.min(
        mockState.economy.level ?? calculatePlayerLevel(mockState.economy.totalXP),
        calculatePlayerLevel(mockState.economy.totalXP)
      );
      const evalResult = evaluateExpansion({
        chunkCount: mockCivilizationState.grid.chunks.length,
        playerLevel,
        coins: mockState.economy.focusCoins,
      });

      if (!evalResult.canExpand) {
        return {
          success: false,
          error:
            evalResult.reason === 'LEVEL_TOO_LOW'
              ? `Land expansion #${evalResult.purchaseIndex} requires Player Level ${evalResult.requiredLevel} (current: ${playerLevel})`
              : `Insufficient coins: chunk expansion #${evalResult.purchaseIndex} costs ${evalResult.cost} Coins (current balance: ${mockState.economy.focusCoins})`,
        };
      }

      const expansion = mockGridMap.expandChunk(payload.origin);
      if (!expansion.success || !expansion.chunk) {
        return {
          success: false,
          error: `Land expansion failed: ${expansion.reason || 'cannot expand chunk'}`,
        };
      }

      mockState.economy.focusCoins -= evalResult.cost;

      mockCivilizationState = {
        ...mockCivilizationState,
        grid: mockGridMap.toSnapshot(),
        lastUpdated: Date.now(),
      };

      const resData: ExpandLandResponseData = {
        newChunk: expansion.chunk.origin,
        civilizationState: mockCivilizationState,
        economy: { ...mockState.economy },
        cost: evalResult.cost,
      };

      return {
        success: true,
        data: resData as unknown as T,
      };
    }

    case 'SET_LANGUAGE': {
      const payload = (message as { payload?: { language?: unknown } }).payload;
      if (!payload || !isSupportedLocale(payload.language)) {
        return {
          success: false,
          error: "SET_LANGUAGE requires valid language ('en' | 'vi').",
        };
      }
      const nextSettings: UserSettings = {
        soundEnabled: false,
        notificationsEnabled: true,
        ...(mockState.settings ?? {}),
        language: payload.language,
      };
      mockState.settings = nextSettings;
      return { success: true, data: { ...nextSettings } as unknown as T };
    }

    case 'SET_CHIME_ENABLED': {
      const payload = (message as { payload?: { enabled?: unknown } }).payload;
      if (!payload || typeof payload.enabled !== 'boolean') {
        return {
          success: false,
          error: 'SET_CHIME_ENABLED requires boolean enabled flag.',
        };
      }
      const nextSettings: UserSettings = {
        soundEnabled: false,
        notificationsEnabled: true,
        ...(mockState.settings ?? {}),
        chimeEnabled: payload.enabled,
      };
      mockState.settings = nextSettings;
      return { success: true, data: { ...nextSettings } as unknown as T };
    }

    case 'MUSIC_GET_STATE': {
      return makeMusicResponse<T>();
    }

    case 'MUSIC_REFRESH_CATALOG': {
      return makeMusicResponse<T>();
    }

    case 'MUSIC_PLAY': {
      if (mockMusicCatalog.length === 0) {
        mockMusicState = {
          ...mockMusicState,
          status: 'ERROR',
          currentTrackId: null,
          positionSec: 0,
          durationSec: null,
          musicEnabled: false,
          lastUpdatedAt: now,
          lastError: 'Unable to load online Lofi catalog. Check your internet connection and retry.',
          lastErrorCode: 'network',
        };
        return makeMusicResponse<T>();
      }
      const payload = (message as { payload?: MusicPlayPayload }).payload;
      const targetTrack = payload?.trackId
        ? getTrackById(payload.trackId, mockMusicCatalog)
        : getTrackById(mockMusicState.currentTrackId, mockMusicCatalog) ?? mockMusicCatalog[0];
      if (!targetTrack) {
        return { success: false, error: `Track '${payload?.trackId}' not found.` };
      }
      const resumePos =
        (!payload?.trackId || payload.trackId === mockMusicState.currentTrackId) &&
        mockMusicState.status === 'PAUSED'
          ? mockMusicState.positionSec
          : 0;
      startPreviewAudioTrack(targetTrack, resumePos);
      return makeMusicResponse<T>();
    }

    case 'MUSIC_PAUSE': {
      if (mockMusicState.status === 'PLAYING' || mockMusicState.musicEnabled) {
        pausePreviewAudio(false);
      }
      return makeMusicResponse<T>();
    }

    case 'MUSIC_RESUME': {
      const targetTrack =
        getTrackById(mockMusicState.currentTrackId, mockMusicCatalog) ?? mockMusicCatalog[0] ?? null;
      if (targetTrack) {
        startPreviewAudioTrack(targetTrack, mockMusicState.positionSec);
      }
      return makeMusicResponse<T>();
    }

    case 'MUSIC_STOP': {
      stopPreviewAudioAndState();
      return makeMusicResponse<T>();
    }

    case 'MUSIC_NEXT': {
      const queue = getPreviewQueueIds();
      if (queue.length > 0) {
        const idx = mockMusicState.currentTrackId
          ? queue.indexOf(mockMusicState.currentTrackId)
          : -1;
        const nextTrack = getTrackById(queue[(idx + 1) % queue.length], mockMusicCatalog);
        if (nextTrack) startPreviewAudioTrack(nextTrack, 0);
      }
      return makeMusicResponse<T>();
    }

    case 'MUSIC_PREVIOUS': {
      const queue = getPreviewQueueIds();
      if (queue.length > 0) {
        const idx = mockMusicState.currentTrackId
          ? queue.indexOf(mockMusicState.currentTrackId)
          : 0;
        const prevIdx = idx > 0 ? idx - 1 : queue.length - 1;
        const prevTrack = getTrackById(queue[prevIdx], mockMusicCatalog);
        if (prevTrack) startPreviewAudioTrack(prevTrack, 0);
      }
      return makeMusicResponse<T>();
    }

    case 'MUSIC_SEEK': {
      const { positionSec } = (message as { payload: MusicSeekPayload }).payload;
      const dur = mockMusicState.durationSec;
      const clamped =
        dur !== null && dur > 0
          ? Math.max(0, Math.min(dur, positionSec))
          : Math.max(0, positionSec);
      if (previewAudio) {
        try {
          previewAudio.currentTime = clamped;
        } catch {
          // ignore
        }
      }
      mockMusicState = {
        ...mockMusicState,
        positionSec: clamped,
        lastUpdatedAt: now,
      };
      return makeMusicResponse<T>();
    }

    case 'MUSIC_SET_VOLUME': {
      const { volume, muted } = (message as { payload: MusicSetVolumePayload }).payload;
      const clampedVol = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.7;
      const nextMuted = typeof muted === 'boolean' ? muted : mockMusicState.muted;
      if (previewAudio) {
        previewAudio.volume = clampedVol;
        previewAudio.muted = nextMuted;
      }
      mockMusicState = {
        ...mockMusicState,
        volume: clampedVol,
        muted: nextMuted,
        lastUpdatedAt: now,
      };
      return makeMusicResponse<T>();
    }

    case 'MUSIC_SET_SHUFFLE': {
      const { enabled } = (message as { payload: MusicSetShufflePayload }).payload;
      mockMusicState = {
        ...mockMusicState,
        shuffle: Boolean(enabled),
        shuffledOrder: enabled
          ? buildPreviewShuffledOrder(mockMusicState.currentTrackId, now)
          : mockMusicCatalog.map((t) => t.id),
        lastUpdatedAt: now,
      };
      return makeMusicResponse<T>();
    }

    case 'MUSIC_SET_REPEAT': {
      const { mode } = (message as { payload: MusicSetRepeatPayload }).payload;
      const validMode: RepeatMode =
        mode === 'all' || mode === 'one' || mode === 'off' ? mode : 'off';
      mockMusicState = {
        ...mockMusicState,
        repeatMode: validMode,
        lastUpdatedAt: now,
      };
      return makeMusicResponse<T>();
    }

    case 'MUSIC_SET_SYNC_WITH_SESSION': {
      const { enabled } = (message as { payload: MusicSetSyncWithSessionPayload }).payload;
      mockMusicState = {
        ...mockMusicState,
        syncWithSession: Boolean(enabled),
        lastUpdatedAt: now,
      };
      syncSimulatedMusicWithSession();
      return makeMusicResponse<T>();
    }

    case 'MUSIC_SET_PLAY_DURING_BREAK': {
      const { enabled } = (message as { payload: MusicSetPlayDuringBreakPayload }).payload;
      mockMusicState = {
        ...mockMusicState,
        playDuringBreak: Boolean(enabled),
        lastUpdatedAt: now,
      };
      syncSimulatedMusicWithSession();
      return makeMusicResponse<T>();
    }

    case 'SET_MUSIC_PLAYER_EXPANDED': {
      const payload = (message as { payload?: { expanded?: unknown } }).payload;
      if (!payload || typeof payload.expanded !== 'boolean') {
        return {
          success: false,
          error: 'SET_MUSIC_PLAYER_EXPANDED requires boolean expanded flag.',
        };
      }
      const prevSettings: UserSettings = mockState.settings ?? {
        soundEnabled: false,
        notificationsEnabled: true,
      };
      const updatedSettings: UserSettings = {
        ...prevSettings,
        musicPlayerExpanded: payload.expanded,
      };
      mockState.settings = updatedSettings;
      return { success: true, data: { ...updatedSettings } as unknown as T };
    }

    default:
      return { success: true, data: undefined as unknown as T };
  }
}

/**
 * Register a listener for storage changes when in Chrome extension context.
 */
export function onStorageChange(callback: () => void): () => void {
  if (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    chrome.storage.onChanged
  ) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local') {
        callback();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  return () => {};
}

/**
 * Typed client helper: fetch authoritative CivilizationState.
 */
export async function getCivilizationStateClient(): Promise<MessageResponse<CivilizationState>> {
  return sendExtensionMessage<CivilizationState>({
    action: 'GET_CIVILIZATION_STATE',
  });
}

/**
 * Typed client helper: place a building on the civilization grid.
 */
export async function placeBuildingClient(
  payload: PlaceBuildingPayload
): Promise<MessageResponse<PlaceBuildingResponseData>> {
  return sendExtensionMessage<PlaceBuildingResponseData>({
    action: 'PLACE_BUILDING',
    payload,
  });
}

/**
 * Typed client helper: remove a building from the civilization grid.
 */
export async function removeBuildingClient(
  payload: RemoveBuildingPayload
): Promise<MessageResponse<RemoveBuildingResponseData>> {
  return sendExtensionMessage<RemoveBuildingResponseData>({
    action: 'REMOVE_BUILDING',
    payload,
  });
}

/**
 * Typed client helper: expand civilization land territory.
 */
export async function expandLandClient(
  payload: ExpandLandPayload
): Promise<MessageResponse<ExpandLandResponseData>> {
  return sendExtensionMessage<ExpandLandResponseData>({
    action: 'EXPAND_LAND',
    payload,
  });
}

/**
 * Typed client helpers for Focus Music Player.
 */
export async function getMusicStateClient(): Promise<MessageResponse<MusicStateResponseData>> {
  return sendExtensionMessage<MusicStateResponseData>({
    action: 'MUSIC_GET_STATE',
  });
}

