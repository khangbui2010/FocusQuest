import {
  ExtensionMessage,
  MessageResponse,
  FullSessionStateResponse,
  StartSessionPayload,
  PlaceBuildingPayload,
  RemoveBuildingPayload,
  UpgradeBuildingPayload,
  ExpandLandPayload,
  RecruitVillagerPayload,
  CancelConstructionJobPayload,
  SelectFounderPayload,
  PlaceBuildingResponseData,
  RemoveBuildingResponseData,
  UpgradeBuildingResponseData,
  ExpandLandResponseData,
  RecruitVillagerResponseData,
  CancelConstructionJobResponseData,
  SelectFounderResponseData,
  MusicStateResponseData,
  MusicPlayPayload,
  MusicSeekPayload,
  MusicSetVolumePayload,
  MusicSetShufflePayload,
  MusicSetRepeatPayload,
  ClaimQuestRewardPayload,
  ClaimQuestRewardResponseData,
  GetQuestStateResponseData,
  GetAwardsStateResponseData,
  MarkAwardsSeenPayload,
  MarkAwardsSeenResponseData,
} from '../../types/messages.ts';
import {
  AwardCounters,
  AwardEvaluationContext,
  AwardState,
} from '../../types/awards.ts';
import {
  areAllActiveDailyQuestsClaimed,
  buildAwardViewModels,
  countUnseenAwards,
  createInitialAwardState,
  evaluateAwards,
  markAwardsAsSeen,
  recordPerfectDayInCounters,
  sanitizeAwardState,
} from '../../core/awards/index.ts';
import { QuestErrorCode, QuestPeriod, QuestProgress, QuestState } from '../../types/quests.ts';
import { extractCodedError } from '../../types/errors.ts';
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
import {
  BUILDING_DEMOLISH_REFUND_RATE,
  CHUNK_WIDTH,
  CHUNK_HEIGHT,
} from '../../core/civilization/constants.ts';
import { isValidCoordinate } from '../../core/civilization/placementValidator.ts';
import { evaluateExpansion } from '../../core/civilization/landExpansion.ts';
import { getBuildingDefinition } from '../../core/civilization/buildingCatalog.ts';
import { BuildingInstance, isEraUnlocked } from '../../core/civilization/buildingTypes.ts';
import {
  calculateBuildingDemolishRefund,
  canPlaceAnotherBuildingOfCategory,
  evaluateBuildingUpgrade,
} from '../../core/civilization/buildingUpgrade.ts';
import {
  VILLAGE_CAVE_DEFINITION_ID,
  Villager,
  applyRecruitment,
  evaluateRecruitment,
  findVillageCave,
} from '../../core/civilization/villager.ts';
import {
  ConstructionJob,
  EXPAND_JOB_SPEC,
  advanceJobs,
  assignJobsFifo,
  getClearingOrigins,
  getExpandJobAtOrigin,
  getPlaceJobForBuilding,
  getPlaceJobSpec,
  getTotalVillagerCount,
  getUpgradeJobSpec,
  getUpgradeJobsForBuilding,
  validateSessionJobAssignment,
} from '../../core/civilization/jobs.ts';
import { isVillagerRole } from '../components/civilization/spriteRegistry.ts';
import { calculatePlayerLevel } from '../../core/economy/levelSystem.ts';
import { DEFAULT_REWARD_CONFIG, RewardEngine } from '../../core/reward/rewardEngine.ts';
import { extractCivilizationCoinBonuses } from '../../core/civilization/civilizationBonusHelper.ts';
import { getVillagerBuffSummary } from '../../core/civilization/villagerBuffs.ts';
import { getEffectiveMaxLevel } from '../../core/civilization/eraRules.ts';
import { getCoinBonusMultiplier } from '../../core/economy/coinBonus.ts';
import { TimeCalculator } from '../../core/timer/timeCalculator.ts';
import { isSupportedLocale } from '../../i18n/translator.ts';
import { DomainNormalizer } from '../../core/profiles/domainNormalizer.ts';
import { getLocalDateKey } from '../../core/utils/dateUtils.ts';
import { addDaysToDateKey, isValidDateKey } from '../../core/stats/statsAggregator.ts';
import { ALL_QUEST_DEFINITIONS, getQuestDefinition } from '../../core/quests/questCatalog.ts';
import { getResetCountdown } from '../../core/quests/questDates.ts';
import {
  applyCompletedSession,
  claimQuest,
  countUnclaimed,
  createInitialQuestState,
  getActiveQuestDefinitions,
  makeClaimLedgerKey,
  rolloverQuestState,
  toQuestOutcomeDelta,
} from '../../core/quests/questEngine.ts';
import { dispatchSimMessagePlugin, registerSimStateAdapter } from './devRuntimeBridge.ts';

const rewardEngine = new RewardEngine();

// Detect whether running in live Chrome extension environment
export const isChromeExtension = (): boolean => {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime !== 'undefined' &&
    typeof chrome.runtime.sendMessage === 'function'
  );
};

// Detect whether running inside Vite Dev Server (excluded from production build & Node tests)
export function isDevServerMockMode(): boolean {
  return (
    typeof import.meta !== 'undefined' &&
    typeof import.meta.env !== 'undefined' &&
    import.meta.env.DEV === true
  );
}

export const DEV_SERVER_MOCK_LIMITS = {
  focusCoins: 999_999_999,
  totalXP: 4_999_000_000, // Resolves cleanly to Lv. 9999 via calculatePlayerLevel
  lifetimeFocusMinutes: 999_999,
  dailyFocusMinutes: 1440,
  dailyCompletedSessions: 999,
  dailyCoinsEarned: 999_999,
  dailyXpEarned: 999_999,
  questStreakDays: 999,
} as const;

export function createInitialMockState(
  devServerMode: boolean = isDevServerMockMode(),
  nowMs: number = Date.now()
): FullSessionStateResponse {
  const todayKey = getLocalDateKey(nowMs);
  if (devServerMode) {
    return {
      currentSession: null,
      activeProfile: {
        id: 'profile-study-research',
        name: 'Study & Research',
        allowedDomains: [],
        isDefault: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      },
      economy: {
        focusCoins: DEV_SERVER_MOCK_LIMITS.focusCoins,
        totalXP: DEV_SERVER_MOCK_LIMITS.totalXP,
        level: calculatePlayerLevel(DEV_SERVER_MOCK_LIMITS.totalXP),
      },
      todayStats: {
        date: todayKey,
        totalFocusMinutes: DEV_SERVER_MOCK_LIMITS.dailyFocusMinutes,
        completedSessions: DEV_SERVER_MOCK_LIMITS.dailyCompletedSessions,
        abandonedSessions: 0,
        coinsEarned: DEV_SERVER_MOCK_LIMITS.dailyCoinsEarned,
        xpEarned: DEV_SERVER_MOCK_LIMITS.dailyXpEarned,
      },
      isBlockingActive: false,
      lifetimeFocusMinutes: DEV_SERVER_MOCK_LIMITS.lifetimeFocusMinutes,
      settings: {
        soundEnabled: false,
        notificationsEnabled: true,
      },
    };
  }

  return {
    currentSession: null,
    activeProfile: {
      id: 'profile-study-research',
      name: 'Study & Research',
      allowedDomains: [],
      isDefault: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    },
    economy: {
      focusCoins: 120,
      totalXP: 450,
      level: 3,
    },
    todayStats: {
      date: todayKey,
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
}

// Fallback in-memory mock state for web browser preview
let mockState: FullSessionStateResponse = createInitialMockState();
let mockCustomDailyStats: Record<string, DailyStatRecord> | null = null;

const SIM_DURATION_PATTERN = [25, 45, 60, 30, 85, 50, 70] as const;

/**
 * Deterministic ~405-day DailyStatRecord generator for standalone web preview.
 * Zero Math.random() calls; includes rest weeks, gap days, a 16-day historical
 * streak, and a 5-day current streak ending on `todayDateKey`.
 * In Vite Dev Server (`devServerMode === true`), maximizes all metrics for testing.
 */
export function buildSimulatedDailyStats(
  todayDateKey: string,
  liveTodayStats?: DailyStatRecord | null,
  devServerMode: boolean = isDevServerMockMode()
): Record<string, DailyStatRecord> {
  const anchor = isValidDateKey(todayDateKey) ? todayDateKey : getLocalDateKey();
  const records: Record<string, DailyStatRecord> = {};

  for (let offset = -404; offset <= 0; offset++) {
    const key = addDaysToDateKey(anchor, offset);
    if (!key) continue;

    if (devServerMode) {
      if (offset === 0 && liveTodayStats && liveTodayStats.date === anchor) {
        records[key] = { ...liveTodayStats };
      } else {
        records[key] = {
          date: key,
          totalFocusMinutes: DEV_SERVER_MOCK_LIMITS.dailyFocusMinutes,
          completedSessions: DEV_SERVER_MOCK_LIMITS.dailyCompletedSessions,
          abandonedSessions: 0,
          coinsEarned: DEV_SERVER_MOCK_LIMITS.dailyCoinsEarned,
          xpEarned: DEV_SERVER_MOCK_LIMITS.dailyXpEarned,
        };
      }
      continue;
    }

    if (offset === 0) {
      if (liveTodayStats && liveTodayStats.date === anchor) {
        records[key] = { ...liveTodayStats };
      } else {
        records[key] = {
          date: key,
          totalFocusMinutes: 50,
          completedSessions: 2,
          abandonedSessions: 0,
          coinsEarned: 100,
          xpEarned: 250,
        };
      }
      continue;
    }

    // Recent 4 days leading into today -> guarantees current 5-day active streak
    if (offset >= -4 && offset <= -1) {
      const mins = [75, 40, 55, 35][-offset - 1];
      const completed = Math.max(1, Math.floor(mins / 25));
      records[key] = {
        date: key,
        totalFocusMinutes: mins,
        completedSessions: completed,
        abandonedSessions: 0,
        coinsEarned: mins * 2,
        xpEarned: mins * 5,
      };
      continue;
    }

    // 3-day break immediately before current streak
    if (offset >= -7 && offset <= -5) {
      if (offset === -6) {
        records[key] = {
          date: key,
          totalFocusMinutes: 0,
          completedSessions: 0,
          abandonedSessions: 1,
          coinsEarned: 0,
          xpEarned: 0,
        };
      }
      continue;
    }

    const backIdx = -offset;

    // 16-day unbroken historical focus streak [-90 .. -75]
    if (offset >= -90 && offset <= -75) {
      const mins = 45 + (backIdx % 5) * 15;
      const completed = Math.max(1, Math.floor(mins / 25));
      records[key] = {
        date: key,
        totalFocusMinutes: mins,
        completedSessions: completed,
        abandonedSessions: backIdx % 13 === 0 ? 1 : 0,
        coinsEarned: mins * 2,
        xpEarned: mins * 5,
      };
      continue;
    }

    // Periodic full rest weeks (every 8th week) and regular gap days
    if (Math.floor(backIdx / 7) % 8 === 3) {
      continue;
    }
    if (backIdx % 7 === 0 || backIdx % 11 === 2) {
      continue;
    }

    const mins = SIM_DURATION_PATTERN[backIdx % SIM_DURATION_PATTERN.length];
    const completed = Math.max(1, Math.floor(mins / 25));
    const abandoned = backIdx % 9 === 0 ? 1 : 0;
    records[key] = {
      date: key,
      totalFocusMinutes: mins,
      completedSessions: completed,
      abandonedSessions: abandoned,
      coinsEarned: mins * 2,
      xpEarned: mins * 5,
    };
  }

  return records;
}

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

export function createInitialSimulatedQuestState(
  nowMs: number = Date.now(),
  devServerMode: boolean = isDevServerMockMode()
): QuestState {
  const todayKey = getLocalDateKey(nowMs);
  const initial = createInitialQuestState(nowMs);

  if (devServerMode) {
    const daily: Record<string, QuestProgress> = {};
    const weekly: Record<string, QuestProgress> = {};
    for (const def of getActiveQuestDefinitions('DAILY', initial)) {
      daily[def.id] = {
        questId: def.id,
        period: def.period,
        progress: def.target,
        target: def.target,
        completed: true,
        claimed: false,
        claimedAt: null,
      };
    }
    for (const def of getActiveQuestDefinitions('WEEKLY', initial)) {
      weekly[def.id] = {
        questId: def.id,
        period: def.period,
        progress: def.target,
        target: def.target,
        completed: true,
        claimed: false,
        claimedAt: null,
      };
    }
    return {
      ...initial,
      daily,
      weekly,
      weeklyActiveDateKeys: [todayKey],
      streak: {
        currentDays: DEV_SERVER_MOCK_LIMITS.questStreakDays,
        longestDays: DEV_SERVER_MOCK_LIMITS.questStreakDays,
        lastCompletedDateKey: todayKey,
      },
    };
  }

  return applyCompletedSession(
    initial,
    {
      completedDateKey: todayKey,
      completedFocusMinutes: 25,
    },
    nowMs
  );
}

let mockQuestState: QuestState = createInitialSimulatedQuestState();
let mockAwardState: AwardState = createInitialAwardState();

function getSimulatedDailyStatsMap(nowMs: number): Record<string, DailyStatRecord> {
  const todayKey = getLocalDateKey(nowMs);
  return mockCustomDailyStats
    ? {
        ...mockCustomDailyStats,
        ...(mockState.todayStats && mockState.todayStats.date === todayKey
          ? { [todayKey]: { ...mockState.todayStats } }
          : {}),
      }
    : buildSimulatedDailyStats(todayKey, mockState.todayStats);
}

function buildMockAwardContext(nowMs: number): AwardEvaluationContext {
  return {
    economy: mockState.economy,
    dailyStats: getSimulatedDailyStatsMap(nowMs),
    quests: mockQuestState,
    civilization: mockCivilizationState,
    todayDateKey: getLocalDateKey(nowMs),
    nowMs,
  };
}

function countNewlyCompletedPlaceJobs(
  prevJobs: readonly ConstructionJob[] | undefined,
  nextJobs: readonly ConstructionJob[] | undefined
): number {
  const postPlaceIds = new Set(
    (nextJobs ?? []).filter((j) => j.kind === 'place').map((j) => j.id)
  );
  let count = 0;
  for (const job of prevJobs ?? []) {
    if (job.kind === 'place' && !postPlaceIds.has(job.id)) {
      count += 1;
    }
  }
  return count;
}

function syncMockAwards(
  nowMs: number,
  options?: {
    readonly longestSessionCandidateMinutes?: number;
    readonly completedPlaceBuilds?: number;
    readonly questsClaimedDelta?: number;
    readonly checkPerfectDay?: boolean;
  }
) {
  const sanitized = sanitizeAwardState(mockAwardState);
  let counters: AwardCounters = sanitized.counters;

  if (
    typeof options?.longestSessionCandidateMinutes === 'number' &&
    Number.isFinite(options.longestSessionCandidateMinutes) &&
    options.longestSessionCandidateMinutes > 0
  ) {
    const candidate = Math.floor(options.longestSessionCandidateMinutes);
    if (candidate > counters.longestSessionMinutes) {
      counters = {
        ...counters,
        longestSessionMinutes: candidate,
      };
    }
  }

  if (typeof options?.completedPlaceBuilds === 'number' && options.completedPlaceBuilds > 0) {
    counters = {
      ...counters,
      totalBuildingsBuilt: counters.totalBuildingsBuilt + Math.floor(options.completedPlaceBuilds),
    };
  }

  if (typeof options?.questsClaimedDelta === 'number' && options.questsClaimedDelta > 0) {
    counters = {
      ...counters,
      totalQuestsClaimed: counters.totalQuestsClaimed + Math.floor(options.questsClaimedDelta),
    };
  }

  if (options?.checkPerfectDay && areAllActiveDailyQuestsClaimed(mockQuestState)) {
    counters = recordPerfectDayInCounters(counters, mockQuestState.dailyDateKey);
  }

  const evalRes = evaluateAwards(
    {
      ...sanitized,
      counters,
    },
    buildMockAwardContext(nowMs)
  );
  mockAwardState = evalRes.nextState;
  return evalRes;
}

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
  musicEnabled: false,
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
    lastUpdatedAt: Date.now(),
    lastError: null,
    lastErrorCode: null,
  };
}

function pausePreviewAudio(): void {
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
    musicEnabled: false,
    lastUpdatedAt: Date.now(),
  };
}

function syncSimulatedMusicWithSession(): void {
  const intent = deriveMusicIntent(mockState.currentSession);
  if (intent === 'stop') {
    if (
      mockMusicState.status === 'PLAYING' ||
      mockMusicState.status === 'PAUSED' ||
      mockMusicState.musicEnabled
    ) {
      stopPreviewAudioAndState();
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
              errorCode: 'WORKER_UNREACHABLE',
            });
          } else {
            resolve(
              response || {
                success: false,
                error: 'Empty response received.',
                errorCode: 'EMPTY_RESPONSE',
              }
            );
          }
        });
      } catch (err) {
        const coded = extractCodedError(err);
        resolve({
          success: false,
          error: coded.message ?? (err instanceof Error ? err.message : String(err)),
          errorCode: coded.code ?? 'ACTION_FAILED',
          errorParams: coded.params,
        });
      }
    });
  }

  if (
    typeof import.meta !== 'undefined' &&
    typeof import.meta.env !== 'undefined' &&
    import.meta.env.DEV === true
  ) {
    await import('../../dev/devSimulatorPlugin.ts').catch(() => undefined);
    const pluginRes = await dispatchSimMessagePlugin<T>(message);
    if (pluginRes !== null) {
      return pluginRes;
    }
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
      if (currentSession?.status === 'RUNNING' && currentSession.mode === 'COUNTDOWN') {
        const targetFinish =
          currentSession.startedAt +
          currentSession.targetMinutes * 60 * 1000 +
          currentSession.totalPauseMs;
        if (now >= targetFinish && !currentSession.rewardProcessed) {
          const coinBonuses = extractCivilizationCoinBonuses(
            mockCivilizationState.buildings,
            mockCivilizationState.villagers,
            mockCivilizationState.jobs,
            mockCivilizationState.founderRole
          );
          const rewardResult = rewardEngine.calculateReward({
            mode: 'COUNTDOWN',
            status: 'COMPLETED',
            targetMinutes: currentSession.targetMinutes,
            actualFocusMinutes: currentSession.targetMinutes,
            lockedMultiplier: currentSession.lockedMultiplier,
            coinBonuses,
          });
          const completedSession: SessionSnapshot = {
            ...currentSession,
            status: 'COMPLETED',
            currentPauseStartedAt: null,
            completedAt: now,
            finalFocusMinutes: currentSession.targetMinutes,
            rewardProcessed: true,
          };
          mockState.currentSession = completedSession;
          mockState.isBlockingActive = false;
          mockState.economy.focusCoins += rewardResult.coinsEarned;
          mockState.economy.totalXP += rewardResult.xpEarned;
          mockState.economy.level = calculatePlayerLevel(mockState.economy.totalXP);
          mockState.lifetimeFocusMinutes =
            (mockState.lifetimeFocusMinutes ?? 0) + currentSession.targetMinutes;
          if (mockState.todayStats) {
            mockState.todayStats.totalFocusMinutes += currentSession.targetMinutes;
            mockState.todayStats.completedSessions += 1;
            mockState.todayStats.coinsEarned += rewardResult.coinsEarned;
            mockState.todayStats.xpEarned += rewardResult.xpEarned;
            if (mockCustomDailyStats) {
              mockCustomDailyStats[mockState.todayStats.date] = { ...mockState.todayStats };
            }
          }
          const questDelta = toQuestOutcomeDelta(completedSession, getLocalDateKey(now));
          if (questDelta) {
            mockQuestState = applyCompletedSession(mockQuestState, questDelta, now);
            const scheduleOpts =
              completedSession.assignedJobIds !== undefined ||
              completedSession.autoContinueJobs !== undefined
                ? {
                    priorityJobIds: completedSession.assignedJobIds,
                    autoContinue: completedSession.autoContinueJobs,
                  }
                : undefined;
            const prevJobs = mockCivilizationState.jobs;
            mockCivilizationState = {
              ...advanceJobs(
                mockCivilizationState,
                questDelta.completedFocusMinutes * 60,
                scheduleOpts
              ),
              lastUpdated: now,
            };
            mockGridMap = GridMap.fromSnapshot(mockCivilizationState.grid);
            const completedPlaceBuilds = countNewlyCompletedPlaceJobs(
              prevJobs,
              mockCivilizationState.jobs
            );
            syncMockAwards(now, {
              longestSessionCandidateMinutes: currentSession.targetMinutes,
              completedPlaceBuilds,
            });
          }
          syncSimulatedMusicWithSession();
        }
      }
      const pomodoroSession = mockState.currentSession;
      const pomodoroState = pomodoroSession?.pomodoroState;
      const pomodoroConfig = pomodoroSession?.pomodoroConfig;
      if (
        pomodoroSession?.status === 'RUNNING' &&
        (pomodoroSession.mode === 'POMODORO_COUNTDOWN' ||
          pomodoroSession.mode === 'POMODORO_STOPWATCH') &&
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
        return {
          success: false,
          error: 'No profiles found in storage.',
          errorCode: 'NO_PROFILES_IN_STORAGE',
        };
      }
      const found = mockProfiles.find((p) => p.id === mockState.activeProfile?.id);
      const active = found ?? mockProfiles.find((p) => p.isDefault) ?? mockProfiles[0];
      mockState.activeProfile = { ...active };
      return { success: true, data: { ...active } as unknown as T };
    }

    case 'START_SESSION': {
      const payload = (message as { payload: StartSessionPayload }).payload;
      if (payload.assignedJobIds !== undefined) {
        const validation = validateSessionJobAssignment({
          jobs: mockCivilizationState.jobs,
          villagers: mockCivilizationState.villagers,
          founderRole: mockCivilizationState.founderRole,
          assignedJobIds: payload.assignedJobIds,
        });
        if (!validation.valid) {
          return {
            success: false,
            error: validation.errorMessage ?? 'Invalid session construction job assignment.',
            errorCode: validation.errorCode ?? 'SESSION_INVALID_JOB_ASSIGNMENT',
            errorParams: validation.errorParams,
          };
        }
      }
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
        const coinBonuses = extractCivilizationCoinBonuses(
          mockCivilizationState.buildings,
          mockCivilizationState.villagers,
          mockCivilizationState.jobs,
          mockCivilizationState.founderRole
        );
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
        ...(payload.assignedJobIds !== undefined
          ? { assignedJobIds: [...payload.assignedJobIds] }
          : {}),
        ...(payload.autoContinueJobs !== undefined
          ? { autoContinueJobs: payload.autoContinueJobs }
          : {}),
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
          errorCode:
            action === 'SKIP_POMODORO_BREAK' ? 'CANNOT_SKIP_BREAK_IN_FOCUS' : 'ACTION_FAILED',
        };
      }
      const s = mockState.currentSession;
      const ps = s.pomodoroState!;
      const pc = s.pomodoroConfig!;

      if (action === 'SKIP_POMODORO_BREAK' && ps.currentPhase === 'FOCUS') {
        return {
          success: false,
          error: 'Cannot skip break while in Focus phase.',
          errorCode: 'CANNOT_SKIP_BREAK_IN_FOCUS',
        };
      }

      const intervalsPerCycle = pc.focusIntervalsPerCycle ?? pc.targetFocusSessions ?? 4;
      const cycles = pc.numberOfCycles ?? 3;
      const focusDuration = pc.focusIntervalDurationMinutes ?? pc.focusDurationMinutes ?? 25;

      if (ps.currentPhase === 'FOCUS') {
        const completed = ps.completedFocusCount + 1;
        const newTotalFocus = completed * focusDuration;
        const coinBonuses = extractCivilizationCoinBonuses(
          mockCivilizationState.buildings,
          mockCivilizationState.villagers,
          mockCivilizationState.jobs,
          mockCivilizationState.founderRole
        );
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
              finalFocusMinutes: plannedFocusMinutes,
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
            if (mockState.todayStats) {
              mockState.todayStats.totalFocusMinutes += plannedFocusMinutes;
              mockState.todayStats.completedSessions += 1;
              mockState.todayStats.coinsEarned += totalCoins;
              mockState.todayStats.xpEarned += totalXp;
              if (mockCustomDailyStats) {
                mockCustomDailyStats[mockState.todayStats.date] = { ...mockState.todayStats };
              }
            }
            const questDelta = toQuestOutcomeDelta(completedSession, getLocalDateKey(now));
            if (questDelta) {
              mockQuestState = applyCompletedSession(mockQuestState, questDelta, now);
              const scheduleOpts =
                completedSession.assignedJobIds !== undefined ||
                completedSession.autoContinueJobs !== undefined
                  ? {
                      priorityJobIds: completedSession.assignedJobIds,
                      autoContinue: completedSession.autoContinueJobs,
                    }
                  : undefined;
              const prevJobs = mockCivilizationState.jobs;
              mockCivilizationState = {
                ...advanceJobs(
                  mockCivilizationState,
                  questDelta.completedFocusMinutes * 60,
                  scheduleOpts
                ),
                lastUpdated: now,
              };
              mockGridMap = GridMap.fromSnapshot(mockCivilizationState.grid);
              const completedPlaceBuilds = countNewlyCompletedPlaceJobs(
                prevJobs,
                mockCivilizationState.jobs
              );
              syncMockAwards(now, {
                longestSessionCandidateMinutes: plannedFocusMinutes,
                completedPlaceBuilds,
              });
            }
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
      if (!mockState.currentSession) {
        return {
          success: false,
          error: 'No active session to pause.',
          errorCode: 'NO_ACTIVE_SESSION_PAUSE',
        };
      }
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
      if (!mockState.currentSession) {
        return {
          success: false,
          error: 'No session to resume.',
          errorCode: 'NO_SESSION_RESUME',
        };
      }
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
      if (!mockState.currentSession) {
        return { success: false, error: 'No session to give up.', errorCode: 'NO_SESSION_GIVE_UP' };
      }
      const s = mockState.currentSession;
      let totalPauseMs = s.totalPauseMs;
      let currentPauseDurationMs = 0;
      const pauseHistory = [...s.pauseHistory];
      if (s.status === 'PAUSED' && s.currentPauseStartedAt) {
        const pRecord = TimeCalculator.finalizePause(s.currentPauseStartedAt, now);
        totalPauseMs += pRecord.durationMs;
        currentPauseDurationMs = pRecord.durationMs;
        pauseHistory.push(pRecord);
      }

      const isPomodoro = s.mode === 'POMODORO_COUNTDOWN' || s.mode === 'POMODORO_STOPWATCH';
      let focusMinutesToRecord = 0;
      if (isPomodoro && s.pomodoroState) {
        focusMinutesToRecord = s.pomodoroState.totalCompletedFocusMinutes;
        const phasePause = s.pomodoroState.phaseTotalPauseMs + currentPauseDurationMs;
        if (s.pomodoroState.currentPhase === 'FOCUS') {
          const rawFocusMs = Math.max(0, now - s.pomodoroState.phaseStartedAt - phasePause);
          focusMinutesToRecord += Math.floor(rawFocusMs / 60000);
        }
      } else {
        const elapsed = TimeCalculator.calculateElapsedTime({
          startedAt: s.startedAt,
          currentTime: now,
          status: 'RUNNING',
          currentPauseStartedAt: null,
          totalCompletedPauseMs: totalPauseMs,
        });
        focusMinutesToRecord = elapsed.actualFocusMinutes;
      }

      mockState.currentSession = {
        ...s,
        status: 'ABANDONED',
        currentPauseStartedAt: null,
        pauseExpiresAt: null,
        totalPauseMs,
        pauseHistory,
        completedAt: now,
        finalFocusMinutes: focusMinutesToRecord,
        rewardProcessed: true,
      };
      mockState.isBlockingActive = false;
      syncSimulatedMusicWithSession();
      return { success: true, data: mockState.currentSession as unknown as T };
    }

    case 'FINISH_STOPWATCH': {
      if (!mockState.currentSession) {
        return {
          success: false,
          error: 'No active stopwatch session to finish.',
          errorCode: 'NO_ACTIVE_STOPWATCH_FINISH',
        };
      }
      const s = mockState.currentSession;
      if (s.mode !== 'STOPWATCH' && s.mode !== 'POMODORO_STOPWATCH') {
        return {
          success: false,
          error:
            "Cannot finish countdown with 'finishStopwatch'. Countdown finishes when target is met.",
          errorCode: 'COUNTDOWN_FINISH_STOPWATCH_DISALLOWED',
        };
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

      const coinBonuses = extractCivilizationCoinBonuses(
        mockCivilizationState.buildings,
        mockCivilizationState.villagers,
        mockCivilizationState.jobs,
        mockCivilizationState.founderRole
      );
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
        finalFocusMinutes: actualFocusMins,
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
        if (mockCustomDailyStats) {
          mockCustomDailyStats[mockState.todayStats.date] = { ...mockState.todayStats };
        }
      }

      const questDelta = toQuestOutcomeDelta(updatedSession, getLocalDateKey(now));
      if (questDelta) {
        mockQuestState = applyCompletedSession(mockQuestState, questDelta, now);
        const scheduleOpts =
          updatedSession.assignedJobIds !== undefined ||
          updatedSession.autoContinueJobs !== undefined
            ? {
                priorityJobIds: updatedSession.assignedJobIds,
                autoContinue: updatedSession.autoContinueJobs,
              }
            : undefined;
        const prevJobs = mockCivilizationState.jobs;
        mockCivilizationState = {
          ...advanceJobs(
            mockCivilizationState,
            questDelta.completedFocusMinutes * 60,
            scheduleOpts
          ),
          lastUpdated: now,
        };
        mockGridMap = GridMap.fromSnapshot(mockCivilizationState.grid);
        const completedPlaceBuilds = countNewlyCompletedPlaceJobs(
          prevJobs,
          mockCivilizationState.jobs
        );
        const isValidCompletedStopwatch =
          s.mode === 'POMODORO_STOPWATCH'
            ? (updatedPomodoroState?.completedFocusCount ?? 0) > 0
            : actualFocusMins >= 5;
        syncMockAwards(now, {
          longestSessionCandidateMinutes: isValidCompletedStopwatch ? actualFocusMins : undefined,
          completedPlaceBuilds,
        });
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
        return {
          success: false,
          error: 'Cannot switch active profile during a focus session. Finish your session first.',
          errorCode: 'ACTIVE_SESSION_LOCK_PROFILE_SWITCH',
        };
      }
      const pId = (message as { payload: { profileId: string } }).payload.profileId;
      const found = mockProfiles.find((p) => p.id === pId);
      if (found) {
        mockState.activeProfile = found;
        return { success: true, data: found as unknown as T };
      }
      return {
        success: false,
        error: `Profile with ID '${pId}' not found.`,
        errorCode: 'PROFILE_NOT_FOUND',
        errorParams: { profileId: pId },
      };
    }

    case 'ADD_DOMAIN': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return {
          success: false,
          error: 'Allowlist cannot be modified during a focus session. Finish your session first.',
          errorCode: 'ACTIVE_SESSION_LOCK_ALLOWLIST',
        };
      }
      const { profileId, domainPattern } = (
        message as { payload: { profileId: string; domainPattern: string } }
      ).payload;
      const validation = DomainNormalizer.validateAllowlistPattern(domainPattern);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Cannot add domain: ${validation.error}`,
          errorCode: 'PROFILE_ADD_INVALID_DOMAIN',
          errorParams: {
            reason: validation.error || '',
            reasonCode: validation.errorCode || 'DOMAIN_INVALID_FORMAT',
            ...(validation.errorParams || {}),
          },
        };
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
      return {
        success: false,
        error: `Profile with ID '${profileId}' not found.`,
        errorCode: 'PROFILE_NOT_FOUND',
        errorParams: { profileId },
      };
    }

    case 'REMOVE_DOMAIN': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return {
          success: false,
          error: 'Allowlist cannot be modified during a focus session. Finish your session first.',
          errorCode: 'ACTIVE_SESSION_LOCK_ALLOWLIST',
        };
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
      return {
        success: false,
        error: `Profile with ID '${profileId}' not found.`,
        errorCode: 'PROFILE_NOT_FOUND',
        errorParams: { profileId },
      };
    }

    case 'CREATE_PROFILE': {
      if (mockState.currentSession && (mockState.currentSession.status === 'RUNNING' || mockState.currentSession.status === 'PAUSED')) {
        return {
          success: false,
          error: 'Cannot create profile during a focus session. Finish your session first.',
          errorCode: 'ACTIVE_SESSION_LOCK_PROFILE_CREATE',
        };
      }
      const { name, initialDomains } = (
        message as { payload: { name: string; initialDomains?: string[] } }
      ).payload;
      const trimmed = (name || '').trim();
      if (!trimmed) {
        return {
          success: false,
          error: 'Profile name cannot be empty or whitespace.',
          errorCode: 'PROFILE_NAME_EMPTY',
        };
      }
      if (trimmed.length > 50) {
        return {
          success: false,
          error: 'Profile name cannot exceed 50 characters.',
          errorCode: 'PROFILE_NAME_TOO_LONG',
        };
      }
      const lower = trimmed.toLowerCase();
      if (mockProfiles.some((p) => p.name.trim().toLowerCase() === lower)) {
        return {
          success: false,
          error: `A profile with the name '${trimmed}' already exists.`,
          errorCode: 'PROFILE_DUPLICATE_NAME',
          errorParams: { name: trimmed },
        };
      }
      const normalizedDomains: string[] = [];
      for (const d of initialDomains || []) {
        const val = DomainNormalizer.validateAllowlistPattern(d);
        if (!val.isValid) {
          return {
            success: false,
            error: `Cannot create profile: ${val.error}`,
            errorCode: 'PROFILE_CREATE_INVALID_DOMAIN',
            errorParams: {
              reason: val.error || '',
              reasonCode: val.errorCode || 'DOMAIN_INVALID_FORMAT',
              ...(val.errorParams || {}),
            },
          };
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
        return {
          success: false,
          error: 'Cannot rename profile during a focus session. Finish your session first.',
          errorCode: 'ACTIVE_SESSION_LOCK_PROFILE_RENAME',
        };
      }
      const payload = (message as { payload?: { profileId?: string; newName?: string } }).payload;
      if (!payload?.profileId || typeof payload.newName !== 'string') {
        return {
          success: false,
          error: 'RENAME_PROFILE requires profileId and newName.',
          errorCode: 'MISSING_RENAME_PROFILE_FIELDS',
        };
      }
      const trimmed = payload.newName.trim();
      if (!trimmed) {
        return {
          success: false,
          error: 'Profile name cannot be empty or whitespace.',
          errorCode: 'PROFILE_NAME_EMPTY',
        };
      }
      if (trimmed.length > 50) {
        return {
          success: false,
          error: 'Profile name cannot exceed 50 characters.',
          errorCode: 'PROFILE_NAME_TOO_LONG',
        };
      }
      const targetIndex = mockProfiles.findIndex((p) => p.id === payload.profileId);
      if (targetIndex === -1) {
        return {
          success: false,
          error: `Profile with ID '${payload.profileId}' not found.`,
          errorCode: 'PROFILE_NOT_FOUND',
          errorParams: { profileId: payload.profileId },
        };
      }
      const lower = trimmed.toLowerCase();
      if (mockProfiles.some((p) => p.id !== payload.profileId && p.name.trim().toLowerCase() === lower)) {
        return {
          success: false,
          error: `A profile with the name '${trimmed}' already exists.`,
          errorCode: 'PROFILE_DUPLICATE_NAME',
          errorParams: { name: trimmed },
        };
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
        return {
          success: false,
          error: 'Cannot delete profile during a focus session. Finish your session first.',
          errorCode: 'ACTIVE_SESSION_LOCK_PROFILE_DELETE',
        };
      }
      const payload = (message as { payload?: { profileId?: string; replacementActiveProfileId?: string } }).payload;
      if (!payload?.profileId) {
        return {
          success: false,
          error: 'DELETE_PROFILE requires profileId.',
          errorCode: 'MISSING_PROFILE_ID',
        };
      }
      const targetIndex = mockProfiles.findIndex((p) => p.id === payload.profileId);
      if (targetIndex === -1) {
        return {
          success: false,
          error: `Profile with ID '${payload.profileId}' not found.`,
          errorCode: 'PROFILE_NOT_FOUND',
          errorParams: { profileId: payload.profileId },
        };
      }
      if (mockProfiles.length <= 1) {
        return {
          success: false,
          error: 'Cannot delete the only remaining profile in the system.',
          errorCode: 'PROFILE_DELETE_LAST',
        };
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
              errorCode: 'PROFILE_REPLACEMENT_NOT_FOUND',
              errorParams: { profileId: payload.replacementActiveProfileId },
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
        return {
          success: false,
          error: `Unknown building definition: "${buildingDefinitionId}"`,
          errorCode: 'CIV_UNKNOWN_BUILDING_DEF',
          errorParams: { buildingDefinitionId },
        };
      }

      const currentLevel = calculatePlayerLevel(mockState.economy.totalXP);
      if (currentLevel < def.unlockRequirements.minPlayerLevel) {
        return {
          success: false,
          error: `Building "${def.name}" requires Player Level ${def.unlockRequirements.minPlayerLevel} (current: ${currentLevel})`,
          errorCode: 'CIV_REQUIRES_LEVEL',
          errorParams: {
            buildingName: def.name,
            requiredLevel: def.unlockRequirements.minPlayerLevel,
            currentLevel,
          },
        };
      }

      const lifetimeMinutes = mockState.lifetimeFocusMinutes ?? 0;
      if (lifetimeMinutes < def.unlockRequirements.minTotalFocusMinutes) {
        return {
          success: false,
          error: `Building "${def.name}" requires ${def.unlockRequirements.minTotalFocusMinutes} lifetime focus minutes (current: ${lifetimeMinutes})`,
          errorCode: 'CIV_REQUIRES_FOCUS_MINUTES',
          errorParams: {
            buildingName: def.name,
            requiredMinutes: def.unlockRequirements.minTotalFocusMinutes,
            currentMinutes: lifetimeMinutes,
          },
        };
      }

      if (
        def.unlockRequirements.minEra &&
        !isEraUnlocked(mockCivilizationState.era, def.unlockRequirements.minEra)
      ) {
        return {
          success: false,
          error: `Building "${def.name}" requires Era ${def.unlockRequirements.minEra} (current: ${mockCivilizationState.era})`,
          errorCode: 'CIV_REQUIRES_ERA',
          errorParams: {
            buildingName: def.name,
            requiredEra: def.unlockRequirements.minEra,
            currentEra: mockCivilizationState.era,
          },
        };
      }

      const limitCheck = canPlaceAnotherBuildingOfCategory(def, mockCivilizationState.buildings);
      if (!limitCheck.allowed) {
        const errorCode =
          def.id === VILLAGE_CAVE_DEFINITION_ID
            ? 'CIV_VILLAGE_CAVE_LIMIT_REACHED'
            : def.category === 'ECONOMY_EFFECT'
              ? 'CIV_ECONOMY_BUILDING_LIMIT_REACHED'
              : 'CIV_BUILDING_PLACEMENT_LIMIT_REACHED';
        return {
          success: false,
          error: `Build Limit reached for "${def.name}" (${limitCheck.currentCount}/${limitCheck.limit} placed).`,
          errorCode,
          errorParams: {
            buildingName: def.name,
            limit: limitCheck.limit ?? 0,
            currentCount: limitCheck.currentCount,
          },
        };
      }

      const placeSpec = getPlaceJobSpec(def.id);
      const totalCrew = getTotalVillagerCount(
        mockCivilizationState.villagers,
        mockCivilizationState.founderRole
      );
      if (totalCrew < placeSpec.crew) {
        return {
          success: false,
          error: `Requires at least ${placeSpec.crew} villagers for this job (currently ${totalCrew}).`,
          errorCode: 'CIV_NOT_ENOUGH_VILLAGERS',
          errorParams: {
            requiredCrew: placeSpec.crew,
            totalVillagers: totalCrew,
          },
        };
      }

      if (mockState.economy.focusCoins < def.baseCost) {
        return {
          success: false,
          error: `Insufficient coins: building "${def.name}" costs ${def.baseCost} Coins (current balance: ${mockState.economy.focusCoins})`,
          errorCode: 'CIV_INSUFFICIENT_BUILDING_COINS',
          errorParams: {
            buildingName: def.name,
            cost: def.baseCost,
            balance: mockState.economy.focusCoins,
          },
        };
      }

      const validation = mockGridMap.canPlaceBuilding(position, def.footprint);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Cannot place building: ${validation.reason || 'Placement rejected'}`,
          errorCode: 'CIV_CANNOT_PLACE_BUILDING',
          errorParams: { reason: validation.reason || 'Placement rejected' },
        };
      }

      const instanceId = `bld_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const placeOp = mockGridMap.placeBuilding(instanceId, position, def.footprint);
      if (!placeOp.success) {
        return {
          success: false,
          error: `Grid placement failed: ${placeOp.reason}`,
          errorCode: 'CIV_GRID_PLACEMENT_FAILED',
          errorParams: { reason: placeOp.reason || 'Placement rejected' },
        };
      }

      mockState.economy.focusCoins -= def.baseCost;

      const newBuilding: BuildingInstance = {
        id: instanceId,
        definitionId: def.id,
        position: { x: position.x, y: position.y },
        level: 1,
        placedAt: now,
      };

      const existingJobs = mockCivilizationState.jobs ?? [];
      let nextJobs: readonly ConstructionJob[] = existingJobs;
      let createdJob: ConstructionJob | undefined;
      if (placeSpec.durationSeconds > 0) {
        const rawJob: ConstructionJob = {
          id: `job_${now}_${Math.random().toString(36).slice(2, 8)}`,
          kind: 'place',
          status: 'PENDING',
          definitionId: def.id,
          buildingId: instanceId,
          crewRequired: placeSpec.crew,
          totalSeconds: placeSpec.durationSeconds,
          remainingSeconds: placeSpec.durationSeconds,
          paidCoins: def.baseCost,
          createdAt: now,
        };
        nextJobs = assignJobsFifo([...existingJobs, rawJob], totalCrew).jobs;
        createdJob = nextJobs.find((j) => j.id === rawJob.id) ?? rawJob;
      }

      mockCivilizationState = {
        ...mockCivilizationState,
        grid: mockGridMap.toSnapshot(),
        buildings: [...mockCivilizationState.buildings, newBuilding],
        jobs: nextJobs,
        lastUpdated: now,
      };
      if (placeSpec.durationSeconds === 0) {
        syncMockAwards(now, { completedPlaceBuilds: 1 });
      }

      const resData: PlaceBuildingResponseData = {
        building: newBuilding,
        civilizationState: mockCivilizationState,
        economy: { ...mockState.economy },
        ...(createdJob ? { job: createdJob } : {}),
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
        return {
          success: false,
          error: `Building instance "${buildingInstanceId}" not found`,
          errorCode: 'CIV_BUILDING_NOT_FOUND',
          errorParams: { buildingInstanceId },
        };
      }

      const existingInstance = mockCivilizationState.buildings[idx];
      const villagerCount = mockCivilizationState.villagers?.length ?? 0;
      if (existingInstance.definitionId === VILLAGE_CAVE_DEFINITION_ID && villagerCount > 0) {
        return {
          success: false,
          error: `Cannot demolish Rock Shelter while ${villagerCount} villagers live in the village.`,
          errorCode: 'CIV_CAVE_HAS_VILLAGERS',
          errorParams: { count: villagerCount },
        };
      }

      const removeOp = mockGridMap.removeBuilding(buildingInstanceId);
      if (!removeOp.success) {
        return {
          success: false,
          error: `Building removal failed: ${removeOp.reason}`,
          errorCode: 'CIV_BUILDING_REMOVAL_FAILED',
          errorParams: { reason: removeOp.reason || 'Removal failed' },
        };
      }

      const existingJobs = mockCivilizationState.jobs ?? [];
      const placeJob = getPlaceJobForBuilding(buildingInstanceId, existingJobs);
      const upgradeJobs = getUpgradeJobsForBuilding(buildingInstanceId, existingJobs);

      const def = getBuildingDefinition(existingInstance.definitionId);
      const refundedCoins = calculateBuildingDemolishRefund(def, existingInstance.level, {
        placeJob,
        upgradeJobs,
      });
      mockState.economy.focusCoins += refundedCoins;

      const updatedBuildings = mockCivilizationState.buildings.filter(
        (b) => b.id !== buildingInstanceId
      );
      const remainingJobs = existingJobs.filter((j) => j.buildingId !== buildingInstanceId);
      const totalCrew = getTotalVillagerCount(
        mockCivilizationState.villagers,
        mockCivilizationState.founderRole
      );
      const nextJobs = assignJobsFifo(remainingJobs, totalCrew).jobs;

      mockCivilizationState = {
        ...mockCivilizationState,
        grid: mockGridMap.toSnapshot(),
        buildings: updatedBuildings,
        jobs: nextJobs,
        lastUpdated: now,
      };

      const resData: RemoveBuildingResponseData = {
        removedBuildingId: buildingInstanceId,
        civilizationState: mockCivilizationState,
        economy: { ...mockState.economy },
        refundedCoins,
      };

      return {
        success: true,
        data: resData as unknown as T,
      };
    }

    case 'UPGRADE_BUILDING': {
      const payload = (message as { payload: UpgradeBuildingPayload }).payload;
      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.buildingId !== 'string' ||
        !payload.buildingId.trim() ||
        typeof payload.expectedLevel !== 'number' ||
        !Number.isInteger(payload.expectedLevel) ||
        payload.expectedLevel < 1
      ) {
        return {
          success: false,
          error: 'UPGRADE_BUILDING requires valid buildingId and expectedLevel.',
          errorCode: 'CIV_INVALID_UPGRADE_PAYLOAD',
        };
      }

      const instance = mockCivilizationState.buildings.find((b) => b.id === payload.buildingId);
      if (!instance) {
        return {
          success: false,
          error: `Building "${payload.buildingId}" not found.`,
          errorCode: 'BUILDING_NOT_FOUND',
          errorParams: { buildingId: payload.buildingId },
        };
      }

      const definition = getBuildingDefinition(instance.definitionId);
      if (!definition) {
        return {
          success: false,
          error: `Building "${payload.buildingId}" not found.`,
          errorCode: 'BUILDING_NOT_FOUND',
          errorParams: { buildingId: payload.buildingId },
        };
      }

      const playerLevel = Math.min(
        mockState.economy.level ?? calculatePlayerLevel(mockState.economy.totalXP),
        calculatePlayerLevel(mockState.economy.totalXP)
      );

      const existingJobs = mockCivilizationState.jobs ?? [];
      const totalCrew = getTotalVillagerCount(
        mockCivilizationState.villagers,
        mockCivilizationState.founderRole
      );
      const buffSummary = getVillagerBuffSummary(
        mockCivilizationState.villagers,
        mockCivilizationState.founderRole
      );
      const effectiveMaxLevel = getEffectiveMaxLevel(definition, mockCivilizationState.era);
      const evalResult = evaluateBuildingUpgrade({
        instance,
        definition,
        currentEra: mockCivilizationState.era,
        playerLevel,
        playerCoins: mockState.economy.focusCoins,
        expectedLevel: payload.expectedLevel,
        upgradeDiscountRate: buffSummary.upgradeDiscountRate,
        jobs: existingJobs,
        totalVillagers: totalCrew,
      });

      if (!evalResult.canUpgrade) {
        switch (evalResult.reason) {
          case 'BUILDING_UNDER_CONSTRUCTION':
            return {
              success: false,
              error: 'This building is still under construction and cannot be upgraded yet.',
              errorCode: 'CIV_BUILDING_UNDER_CONSTRUCTION',
              errorParams: { buildingId: instance.id, buildingName: definition.name },
            };
          case 'LEVEL_MISMATCH':
            return {
              success: false,
              error: `Building level changed concurrently (expected Lv. ${payload.expectedLevel}, current Lv. ${evalResult.currentLevel}). Please try again.`,
              errorCode: 'BUILDING_LEVEL_MISMATCH',
              errorParams: {
                buildingId: instance.id,
                expectedLevel: payload.expectedLevel,
                currentLevel: evalResult.currentLevel,
              },
            };
          case 'NON_UPGRADEABLE_CATEGORY':
            return {
              success: false,
              error: `Building "${definition.name}" keeps its fixed effect and cannot be upgraded.`,
              errorCode: 'CIV_UPGRADE_NOT_SUPPORTED',
              errorParams: { buildingName: definition.name },
            };
          case 'BUILDING_MAX_LEVEL':
            return {
              success: false,
              error: `Building "${definition.name}" is already at max level (Lv. ${effectiveMaxLevel}).`,
              errorCode: 'BUILDING_MAX_LEVEL',
              errorParams: { buildingName: definition.name, maxLevel: effectiveMaxLevel },
            };
          case 'ERA_LOCKED':
            return {
              success: false,
              error: `Upgrading "${definition.name}" requires Era ${definition.era}.`,
              errorCode: 'CIV_UPGRADE_ERA_LOCKED',
              errorParams: { buildingName: definition.name, requiredEra: definition.era },
            };
          case 'PLAYER_LEVEL_REQUIRED':
            return {
              success: false,
              error: `Upgrading "${definition.name}" requires Player Level ${evalResult.requiredPlayerLevel} (current: Lv. ${playerLevel}).`,
              errorCode: 'UPGRADE_PLAYER_LEVEL_REQUIRED',
              errorParams: {
                buildingName: definition.name,
                requiredLevel: evalResult.requiredPlayerLevel,
                currentLevel: playerLevel,
              },
            };
          case 'NOT_ENOUGH_VILLAGERS': {
            const reqCrew = getUpgradeJobSpec(evalResult.currentLevel).crew;
            return {
              success: false,
              error: `Requires at least ${reqCrew} villagers for this job (currently ${totalCrew}).`,
              errorCode: 'CIV_NOT_ENOUGH_VILLAGERS',
              errorParams: { requiredCrew: reqCrew, totalVillagers: totalCrew },
            };
          }
          case 'INSUFFICIENT_COINS':
            return {
              success: false,
              error: `Insufficient coins: building "${definition.name}" costs ${evalResult.cost} Coins (current balance: ${mockState.economy.focusCoins})`,
              errorCode: 'CIV_INSUFFICIENT_BUILDING_COINS',
              errorParams: {
                buildingName: definition.name,
                cost: evalResult.cost,
                balance: mockState.economy.focusCoins,
              },
            };
          default:
            return {
              success: false,
              error: `Building "${payload.buildingId}" not found.`,
              errorCode: 'BUILDING_NOT_FOUND',
              errorParams: { buildingId: payload.buildingId },
            };
        }
      }

      const targetLevel = evalResult.nextLevel!;
      const upgradeSpec = getUpgradeJobSpec(evalResult.currentLevel);
      const rawJob: ConstructionJob = {
        id: `job_${now}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'upgrade',
        status: 'PENDING',
        definitionId: definition.id,
        buildingId: instance.id,
        targetLevel,
        crewRequired: upgradeSpec.crew,
        totalSeconds: upgradeSpec.durationSeconds,
        remainingSeconds: upgradeSpec.durationSeconds,
        paidCoins: evalResult.cost,
        createdAt: now,
      };
      const nextJobs = assignJobsFifo([...existingJobs, rawJob], totalCrew).jobs;
      const finalJob = nextJobs.find((j) => j.id === rawJob.id) ?? rawJob;

      mockState.economy.focusCoins -= evalResult.cost;
      mockCivilizationState = {
        ...mockCivilizationState,
        jobs: nextJobs,
        lastUpdated: now,
      };

      const resData: UpgradeBuildingResponseData = {
        civilizationState: mockCivilizationState,
        economy: { ...mockState.economy },
        building: instance,
        newLevel: targetLevel,
        cost: evalResult.cost,
        job: finalJob,
      };

      return {
        success: true,
        data: resData as unknown as T,
      };
    }

    case 'EXPAND_LAND': {
      const payload = (message as { payload: ExpandLandPayload }).payload;
      if (!payload || typeof payload !== 'object') {
        return {
          success: false,
          error: 'EXPAND_LAND requires payload object.',
          errorCode: 'CIV_INVALID_EXPAND_PAYLOAD',
        };
      }

      const rawPayload = payload as unknown as Record<string, unknown>;
      if ('direction' in rawPayload || 'slotIndex' in rawPayload) {
        return {
          success: false,
          error:
            'EXPAND_LAND requires origin coordinates only; direction and slotIndex are not supported.',
          errorCode: 'CIV_EXPAND_UNSUPPORTED_FIELDS',
        };
      }

      if (!isValidCoordinate(payload.origin)) {
        return {
          success: false,
          error: 'EXPAND_LAND requires valid origin coordinates.',
          errorCode: 'CIV_INVALID_EXPAND_ORIGIN_TYPE',
        };
      }

      if (payload.origin.x % CHUNK_WIDTH !== 0 || payload.origin.y % CHUNK_HEIGHT !== 0) {
        return {
          success: false,
          error: `Land expansion failed: INVALID_ORIGIN (origin must align to ${CHUNK_WIDTH}x${CHUNK_HEIGHT} chunk grid).`,
          errorCode: 'CIV_INVALID_EXPAND_ORIGIN_GRID',
          errorParams: { chunkWidth: CHUNK_WIDTH, chunkHeight: CHUNK_HEIGHT },
        };
      }

      const existingJobs = mockCivilizationState.jobs ?? [];
      if (getExpandJobAtOrigin(payload.origin, existingJobs)) {
        return {
          success: false,
          error: 'This territory chunk is already being cleared.',
          errorCode: 'CIV_EXPAND_ALREADY_QUEUED',
        };
      }

      const playerLevel = Math.min(
        mockState.economy.level ?? calculatePlayerLevel(mockState.economy.totalXP),
        calculatePlayerLevel(mockState.economy.totalXP)
      );
      const expandBuffSummary = getVillagerBuffSummary(
        mockCivilizationState.villagers,
        mockCivilizationState.founderRole
      );
      const clearingCount = getClearingOrigins(existingJobs).length;
      const evalResult = evaluateExpansion({
        chunkCount: mockCivilizationState.grid.chunks.length + clearingCount,
        playerLevel,
        coins: mockState.economy.focusCoins,
        discountRate: expandBuffSummary.expansionDiscountRate,
      });

      if (!evalResult.canExpand) {
        return evalResult.reason === 'LEVEL_TOO_LOW'
          ? {
              success: false,
              error: `Land expansion #${evalResult.purchaseIndex} requires Player Level ${evalResult.requiredLevel} (current: ${playerLevel})`,
              errorCode: 'CIV_EXPAND_REQUIRES_LEVEL',
              errorParams: {
                purchaseIndex: evalResult.purchaseIndex,
                requiredLevel: evalResult.requiredLevel,
                currentLevel: playerLevel,
              },
            }
          : {
              success: false,
              error: `Insufficient coins: chunk expansion #${evalResult.purchaseIndex} costs ${evalResult.cost} Coins (current balance: ${mockState.economy.focusCoins})`,
              errorCode: 'CIV_INSUFFICIENT_EXPAND_COINS',
              errorParams: {
                purchaseIndex: evalResult.purchaseIndex,
                cost: evalResult.cost,
                balance: mockState.economy.focusCoins,
              },
            };
      }

      const totalCrew = getTotalVillagerCount(
        mockCivilizationState.villagers,
        mockCivilizationState.founderRole
      );
      if (totalCrew < EXPAND_JOB_SPEC.crew) {
        return {
          success: false,
          error: `Requires at least ${EXPAND_JOB_SPEC.crew} villagers for this job (currently ${totalCrew}).`,
          errorCode: 'CIV_NOT_ENOUGH_VILLAGERS',
          errorParams: { requiredCrew: EXPAND_JOB_SPEC.crew, totalVillagers: totalCrew },
        };
      }

      const expCheck = mockGridMap.canExpandChunk(payload.origin);
      if (!expCheck.canExpand) {
        return {
          success: false,
          error: `Land expansion failed: ${expCheck.reason || 'cannot expand chunk'}`,
          errorCode: 'CIV_LAND_EXPANSION_FAILED',
          errorParams: { reason: expCheck.reason || 'cannot expand chunk' },
        };
      }

      mockState.economy.focusCoins -= evalResult.cost;

      const originCopy = { x: payload.origin.x, y: payload.origin.y };
      const rawJob: ConstructionJob = {
        id: `job_${now}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'expand',
        status: 'PENDING',
        origin: originCopy,
        purchaseIndex: evalResult.purchaseIndex,
        crewRequired: EXPAND_JOB_SPEC.crew,
        totalSeconds: EXPAND_JOB_SPEC.durationSeconds,
        remainingSeconds: EXPAND_JOB_SPEC.durationSeconds,
        paidCoins: evalResult.cost,
        createdAt: now,
      };
      const nextJobs = assignJobsFifo([...existingJobs, rawJob], totalCrew).jobs;
      const finalJob = nextJobs.find((j) => j.id === rawJob.id) ?? rawJob;

      mockCivilizationState = {
        ...mockCivilizationState,
        jobs: nextJobs,
        lastUpdated: now,
      };

      const resData: ExpandLandResponseData = {
        newChunk: originCopy,
        civilizationState: mockCivilizationState,
        economy: { ...mockState.economy },
        cost: evalResult.cost,
        job: finalJob,
      };

      return {
        success: true,
        data: resData as unknown as T,
      };
    }

    case 'CANCEL_CONSTRUCTION_JOB': {
      const payload = (message as { payload?: CancelConstructionJobPayload }).payload;
      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.jobId !== 'string' ||
        payload.jobId.trim().length === 0
      ) {
        return {
          success: false,
          error: 'CANCEL_CONSTRUCTION_JOB requires a valid jobId.',
          errorCode: 'CIV_INVALID_CANCEL_JOB_PAYLOAD',
        };
      }

      const existingJobs = mockCivilizationState.jobs ?? [];
      const targetJob = existingJobs.find((j) => j.id === payload.jobId);
      if (!targetJob) {
        return {
          success: false,
          error: `Construction job "${payload.jobId}" not found.`,
          errorCode: 'CIV_JOB_NOT_FOUND',
          errorParams: { jobId: payload.jobId },
        };
      }

      const jobsToCancel =
        targetJob.kind === 'upgrade' &&
        targetJob.buildingId &&
        typeof targetJob.targetLevel === 'number'
          ? existingJobs.filter(
              (j) =>
                j.kind === 'upgrade' &&
                j.buildingId === targetJob.buildingId &&
                typeof j.targetLevel === 'number' &&
                j.targetLevel >= targetJob.targetLevel!
            )
          : [targetJob];

      const cancelledSet = new Set(jobsToCancel.map((j) => j.id));
      let refundedCoins = 0;
      for (const j of jobsToCancel) {
        const rate = j.remainingSeconds === j.totalSeconds ? 1 : BUILDING_DEMOLISH_REFUND_RATE;
        refundedCoins += j.paidCoins * rate;
      }

      let nextBuildings = mockCivilizationState.buildings;
      if (targetJob.kind === 'place' && targetJob.buildingId) {
        const removalRes = mockGridMap.removeBuilding(targetJob.buildingId);
        if (!removalRes.success) {
          return {
            success: false,
            error: `Building removal failed: ${removalRes.reason || 'unknown'}`,
            errorCode: 'CIV_BUILDING_REMOVAL_FAILED',
            errorParams: { reason: removalRes.reason || 'unknown' },
          };
        }
        nextBuildings = mockCivilizationState.buildings.filter((b) => b.id !== targetJob.buildingId);
      }

      mockState.economy.focusCoins += refundedCoins;
      const remainingJobs = existingJobs.filter((j) => !cancelledSet.has(j.id));
      const totalCrew = getTotalVillagerCount(
        mockCivilizationState.villagers,
        mockCivilizationState.founderRole
      );
      const nextJobs = assignJobsFifo(remainingJobs, totalCrew).jobs;

      mockCivilizationState = {
        ...mockCivilizationState,
        grid: mockGridMap.toSnapshot(),
        buildings: nextBuildings,
        jobs: nextJobs,
        lastUpdated: now,
      };

      const resData: CancelConstructionJobResponseData = {
        cancelledJobIds: Array.from(cancelledSet),
        refundedCoins,
        civilizationState: mockCivilizationState,
        economy: { ...mockState.economy },
      };

      return {
        success: true,
        data: resData as unknown as T,
      };
    }

    case 'RECRUIT_VILLAGER': {
      const payload = (message as { payload?: RecruitVillagerPayload }).payload;
      if (!payload || typeof payload !== 'object' || !isVillagerRole(payload.role)) {
        return {
          success: false,
          error: 'RECRUIT_VILLAGER requires a valid villager role (elder | crafter | woodworker).',
          errorCode: 'CIV_INVALID_VILLAGER_ROLE',
          errorParams: {
            role: payload && typeof payload === 'object' ? String((payload as { role?: unknown }).role) : '',
          },
        };
      }

      const role = payload.role;
      const currentVillagers = mockCivilizationState.villagers ?? [];
      const existingJobs = mockCivilizationState.jobs ?? [];
      const caveBuilding = findVillageCave(mockCivilizationState.buildings, existingJobs);
      const evalResult = evaluateRecruitment({
        caveBuilding,
        villagers: currentVillagers,
        founderRole: mockCivilizationState.founderRole,
        playerCoins: mockState.economy.focusCoins,
        role,
      });

      if (!evalResult.canRecruit) {
        switch (evalResult.reason) {
          case 'CIV_NO_VILLAGE_CAVE':
            return {
              success: false,
              error: 'You need a Rock Shelter to recruit villagers.',
              errorCode: 'CIV_NO_VILLAGE_CAVE',
            };
          case 'CIV_VILLAGER_CAPACITY_REACHED':
            return {
              success: false,
              error: `Village capacity reached (${evalResult.currentCount}/${evalResult.capacity}). Upgrade your Rock Shelter to house more villagers.`,
              errorCode: 'CIV_VILLAGER_CAPACITY_REACHED',
              errorParams: {
                currentCount: evalResult.currentCount,
                capacity: evalResult.capacity,
              },
            };
          case 'CIV_VILLAGER_INSUFFICIENT_COINS':
            return {
              success: false,
              error: `Insufficient coins: recruiting a villager costs ${evalResult.cost} Coins (current balance: ${mockState.economy.focusCoins}).`,
              errorCode: 'CIV_VILLAGER_INSUFFICIENT_COINS',
              errorParams: {
                cost: evalResult.cost,
                balance: mockState.economy.focusCoins,
              },
            };
          default:
            return {
              success: false,
              error: 'RECRUIT_VILLAGER requires a valid villager role.',
              errorCode: 'CIV_INVALID_VILLAGER_ROLE',
            };
        }
      }

      const villager: Villager = {
        id: `vil_${now}_${Math.random().toString(36).slice(2, 8)}`,
        role,
        recruitedAt: now,
      };

      mockState.economy.focusCoins -= evalResult.cost;
      const nextVillagers = applyRecruitment(currentVillagers, villager);
      const nextTotalCrew = getTotalVillagerCount(nextVillagers, mockCivilizationState.founderRole);
      const nextJobs = assignJobsFifo(existingJobs, nextTotalCrew).jobs;
      mockCivilizationState = {
        ...mockCivilizationState,
        villagers: nextVillagers,
        jobs: nextJobs,
        lastUpdated: now,
      };
      syncMockAwards(now);

      const resData: RecruitVillagerResponseData = {
        villager,
        civilizationState: mockCivilizationState,
        economy: { ...mockState.economy },
        cost: evalResult.cost,
      };

      return {
        success: true,
        data: resData as unknown as T,
      };
    }

    case 'SELECT_FOUNDER': {
      const payload = (message as { payload?: SelectFounderPayload }).payload;
      if (!payload || typeof payload !== 'object' || !isVillagerRole(payload.role)) {
        return {
          success: false,
          error: 'SELECT_FOUNDER requires a valid villager role (elder | crafter | woodworker).',
          errorCode: 'CIV_INVALID_FOUNDER_PAYLOAD',
          errorParams: {
            role:
              payload && typeof payload === 'object'
                ? String((payload as { role?: unknown }).role)
                : '',
          },
        };
      }

      if (
        mockCivilizationState.founderRole &&
        isVillagerRole(mockCivilizationState.founderRole)
      ) {
        return {
          success: false,
          error: 'Founder villager has already been selected.',
          errorCode: 'CIV_FOUNDER_ALREADY_SELECTED',
        };
      }

      const role = payload.role;
      const existingJobs = mockCivilizationState.jobs ?? [];
      const nextTotalCrew = getTotalVillagerCount(mockCivilizationState.villagers, role);
      const nextJobs = assignJobsFifo(existingJobs, nextTotalCrew).jobs;
      mockCivilizationState = {
        ...mockCivilizationState,
        founderRole: role,
        jobs: nextJobs,
        lastUpdated: now,
      };
      syncMockAwards(now);

      const resData: SelectFounderResponseData = {
        founderRole: role,
        civilizationState: mockCivilizationState,
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
          errorCode: 'INVALID_LANGUAGE',
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
          errorCode: 'INVALID_CHIME_FLAG',
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
      syncSimulatedMusicWithSession();
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
        return {
          success: false,
          error: `Track '${payload?.trackId}' was not found in the Lofi music catalog.`,
          errorCode: 'MUSIC_TRACK_NOT_FOUND',
          errorParams: payload?.trackId ? { trackId: payload.trackId } : undefined,
        };
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
        pausePreviewAudio();
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

    case 'SET_MUSIC_PLAYER_EXPANDED': {
      const payload = (message as { payload?: { expanded?: unknown } }).payload;
      if (!payload || typeof payload.expanded !== 'boolean') {
        return {
          success: false,
          error: 'SET_MUSIC_PLAYER_EXPANDED requires boolean expanded flag.',
          errorCode: 'INVALID_MUSIC_PLAYER_EXPANDED_FLAG',
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

    case 'GET_DAILY_STATS': {
      const todayKey =
        mockState.todayStats?.date && isValidDateKey(mockState.todayStats.date)
          ? mockState.todayStats.date
          : getLocalDateKey();
      const stats = mockCustomDailyStats
        ? {
            ...mockCustomDailyStats,
            ...(mockState.todayStats?.date === todayKey
              ? { [todayKey]: { ...mockState.todayStats } }
              : {}),
          }
        : buildSimulatedDailyStats(todayKey, mockState.todayStats);
      return { success: true, data: stats as unknown as T };
    }

    case 'GET_QUEST_STATE': {
      mockQuestState = rolloverQuestState(mockQuestState, now);
      const data: GetQuestStateResponseData = {
        questState: mockQuestState,
        resetCountdown: getResetCountdown(now, mockQuestState),
        unclaimedCount: countUnclaimed(mockQuestState, now),
      };
      return { success: true, data: data as unknown as T };
    }

    case 'CLAIM_QUEST_REWARD': {
      const rawPayload = (message as { payload?: unknown }).payload;
      if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
        return {
          success: false,
          error: 'CLAIM_QUEST_REWARD requires payload with period and questId.',
          errorCode: 'INVALID_QUEST_PAYLOAD' satisfies QuestErrorCode,
        };
      }
      const raw = rawPayload as Record<string, unknown>;
      if (raw.period !== 'DAILY' && raw.period !== 'WEEKLY') {
        return {
          success: false,
          error: "CLAIM_QUEST_REWARD requires valid period ('DAILY' | 'WEEKLY').",
          errorCode: 'INVALID_QUEST_PAYLOAD' satisfies QuestErrorCode,
        };
      }
      if (
        typeof raw.questId !== 'string' ||
        !raw.questId.trim() ||
        raw.questId.length > 64 ||
        /[\r\n\t<>"]/.test(raw.questId)
      ) {
        return {
          success: false,
          error: 'CLAIM_QUEST_REWARD requires valid questId.',
          errorCode: 'INVALID_QUEST_PAYLOAD' satisfies QuestErrorCode,
        };
      }
      const period: QuestPeriod = raw.period;
      const questId = raw.questId.trim();
      if (!ALL_QUEST_DEFINITIONS.some((def) => def.id === questId)) {
        return {
          success: false,
          error: `Unknown quest "${questId}".`,
          errorCode: 'UNKNOWN_QUEST' satisfies QuestErrorCode,
          errorParams: { questId },
        };
      }
      const def = getQuestDefinition(period, questId);
      if (!def) {
        return {
          success: false,
          error: `Quest "${questId}" does not belong to period ${period}.`,
          errorCode: 'QUEST_PERIOD_MISMATCH' satisfies QuestErrorCode,
          errorParams: { questId, period },
        };
      }

      const preRolloverState = mockQuestState;
      const rolled = rolloverQuestState(preRolloverState, now);
      mockQuestState = rolled;

      const didRoll =
        (period === 'DAILY' && rolled.dailyDateKey !== preRolloverState.dailyDateKey) ||
        (period === 'WEEKLY' && rolled.weeklyStartKey !== preRolloverState.weeklyStartKey);
      const priorEntry =
        period === 'DAILY'
          ? preRolloverState.daily[questId]
          : preRolloverState.weekly[questId];

      const claimRes = claimQuest(rolled, period, questId, now);
      if (!claimRes.claimed) {
        const entry = period === 'DAILY' ? rolled.daily[questId] : rolled.weekly[questId];
        const periodDateKey = period === 'DAILY' ? rolled.dailyDateKey : rolled.weeklyStartKey;
        const ledgerKey = makeClaimLedgerKey(period, periodDateKey, questId);

        if (entry?.claimed || rolled.recentClaimedKeys.includes(ledgerKey)) {
          return {
            success: false,
            error: `Quest "${questId}" reward has already been claimed.`,
            errorCode: 'QUEST_ALREADY_CLAIMED' satisfies QuestErrorCode,
            errorParams: { questId },
          };
        }

        if (didRoll && priorEntry && priorEntry.progress >= priorEntry.target && !priorEntry.claimed) {
          return {
            success: false,
            error: `Quest "${questId}" reward expired after period reset.`,
            errorCode: 'QUEST_EXPIRED' satisfies QuestErrorCode,
            errorParams: { questId },
          };
        }

        const progress = entry?.progress ?? 0;
        const target = entry?.target ?? def.target;
        return {
          success: false,
          error: `Quest "${questId}" is not completed yet (${progress}/${target}).`,
          errorCode: 'QUEST_NOT_COMPLETED' satisfies QuestErrorCode,
          errorParams: { questId, progress, target },
        };
      }

      mockQuestState = claimRes.state;
      const newTotalXP = Math.max(0, mockState.economy.totalXP + claimRes.xp);
      mockState.economy = {
        ...mockState.economy,
        focusCoins: mockState.economy.focusCoins + claimRes.coins,
        totalXP: newTotalXP,
        level: calculatePlayerLevel(newTotalXP),
      };
      syncMockAwards(now, {
        questsClaimedDelta: 1,
        checkPerfectDay: period === 'DAILY',
      });

      const data: ClaimQuestRewardResponseData = {
        questState: mockQuestState,
        economy: { ...mockState.economy },
        claimedCoins: claimRes.coins,
        claimedXp: claimRes.xp,
      };
      return { success: true, data: data as unknown as T };
    }

    case 'GET_AWARDS_STATE': {
      const evalRes = syncMockAwards(now);
      const data: GetAwardsStateResponseData = {
        awardState: evalRes.nextState,
        awards: evalRes.viewModels,
        unseenCount: evalRes.unseenCount,
        era: mockCivilizationState.era,
      };
      return { success: true, data: data as unknown as T };
    }

    case 'MARK_AWARDS_SEEN': {
      const payload = (message as { payload?: MarkAwardsSeenPayload }).payload;
      if (payload !== undefined) {
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          return {
            success: false,
            error: 'MARK_AWARDS_SEEN payload must be an object.',
            errorCode: 'INVALID_AWARDS_PAYLOAD',
          };
        }
        if (
          payload.awardIds !== undefined &&
          (!Array.isArray(payload.awardIds) ||
            payload.awardIds.some((id) => typeof id !== 'string' || id.trim().length === 0))
        ) {
          return {
            success: false,
            error: 'MARK_AWARDS_SEEN awardIds must be an array of non-empty strings.',
            errorCode: 'INVALID_AWARDS_PAYLOAD',
          };
        }
      }

      const context = buildMockAwardContext(now);
      const evalRes = evaluateAwards(sanitizeAwardState(mockAwardState), context);
      const seenRes = markAwardsAsSeen(evalRes.nextState, payload?.awardIds);
      mockAwardState = seenRes.nextState;
      const awards = buildAwardViewModels(seenRes.nextState, context);
      const data: MarkAwardsSeenResponseData = {
        awardState: seenRes.nextState,
        awards,
        unseenCount: countUnseenAwards(seenRes.nextState),
      };
      return { success: true, data: data as unknown as T };
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
 * Typed client helper: upgrade an existing building on the civilization grid.
 */
export async function upgradeBuildingClient(
  payload: UpgradeBuildingPayload
): Promise<MessageResponse<UpgradeBuildingResponseData>> {
  return sendExtensionMessage<UpgradeBuildingResponseData>({
    action: 'UPGRADE_BUILDING',
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
 * Typed client helper: recruit 1 villager into the Rock Shelter.
 */
export async function recruitVillagerClient(
  payload: RecruitVillagerPayload
): Promise<MessageResponse<RecruitVillagerResponseData>> {
  return sendExtensionMessage<RecruitVillagerResponseData>({
    action: 'RECRUIT_VILLAGER',
    payload,
  });
}

/**
 * Typed client helper: select the permanent free Founder Villager once.
 */
export async function selectFounderClient(
  payload: SelectFounderPayload
): Promise<MessageResponse<SelectFounderResponseData>> {
  return sendExtensionMessage<SelectFounderResponseData>({
    action: 'SELECT_FOUNDER',
    payload,
  });
}

/**
 * Typed client helper: cancel a queued/active construction job and refund coins.
 */
export async function cancelConstructionJobClient(
  payload: CancelConstructionJobPayload
): Promise<MessageResponse<CancelConstructionJobResponseData>> {
  return sendExtensionMessage<CancelConstructionJobResponseData>({
    action: 'CANCEL_CONSTRUCTION_JOB',
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

/**
 * Typed client helper: fetch all persisted DailyStatRecord entries keyed by 'YYYY-MM-DD'.
 */
export async function getDailyStatsClient(): Promise<
  MessageResponse<Record<string, DailyStatRecord>>
> {
  return sendExtensionMessage<Record<string, DailyStatRecord>>({
    action: 'GET_DAILY_STATS',
  });
}

/**
 * Typed client helper: fetch Quest progression, reset countdowns, and unclaimed count.
 */
export async function getQuestStateClient(): Promise<MessageResponse<GetQuestStateResponseData>> {
  return sendExtensionMessage<GetQuestStateResponseData>({
    action: 'GET_QUEST_STATE',
  });
}

/**
 * Typed client helper: claim reward for a completed Quest.
 */
export async function claimQuestRewardClient(
  payload: ClaimQuestRewardPayload
): Promise<MessageResponse<ClaimQuestRewardResponseData>> {
  return sendExtensionMessage<ClaimQuestRewardResponseData>({
    action: 'CLAIM_QUEST_REWARD',
    payload,
  });
}

/**
 * Typed client helper: fetch evaluated Awards progression, tiers, and unseen count.
 */
export async function getAwardsStateClient(): Promise<MessageResponse<GetAwardsStateResponseData>> {
  return sendExtensionMessage<GetAwardsStateResponseData>({
    action: 'GET_AWARDS_STATE',
  });
}

/**
 * Typed client helper: mark newly unlocked Awards (all or subset) as seen.
 */
export async function markAwardsSeenClient(
  payload?: MarkAwardsSeenPayload
): Promise<MessageResponse<MarkAwardsSeenResponseData>> {
  return sendExtensionMessage<MarkAwardsSeenResponseData>({
    action: 'MARK_AWARDS_SEEN',
    ...(payload ? { payload } : {}),
  });
}

/**
 * Test-only helper to seed the in-memory simulator CivilizationState & Economy.
 */
export function seedMockCivilizationForTest(
  civState: CivilizationState,
  economyPatch?: Partial<PlayerEconomy>
): void {
  mockCivilizationState = civState;
  mockGridMap = GridMap.fromSnapshot(civState.grid);
  if (economyPatch) {
    mockState.economy = {
      ...mockState.economy,
      ...economyPatch,
    };
  }
}

if (
  typeof import.meta !== 'undefined' &&
  typeof import.meta.env !== 'undefined' &&
  import.meta.env.DEV === true
) {
  registerSimStateAdapter({
    getFullState: () => mockState,
    setFullState: (next) => {
      mockState = next;
    },
    getProfiles: () => mockProfiles,
    setProfiles: (next) => {
      mockProfiles = next;
    },
    getCivState: () => mockCivilizationState,
    setCivState: (next) => {
      mockCivilizationState = next;
      mockGridMap = GridMap.fromSnapshot(next.grid);
    },
    getQuestState: () => mockQuestState,
    setQuestState: (next) => {
      mockQuestState = next;
    },
    getAwardState: () => mockAwardState,
    setAwardState: (next) => {
      mockAwardState = sanitizeAwardState(next);
    },
    getMusicState: () => mockMusicState,
    setMusicState: (next) => {
      mockMusicState = next;
    },
    getCustomDailyStats: () => mockCustomDailyStats,
    setCustomDailyStats: (next) => {
      mockCustomDailyStats = next;
    },
    buildDefaultDailyStats: (todayDateKey, liveTodayStats, useMaxPreset = false) =>
      buildSimulatedDailyStats(todayDateKey, liveTodayStats, useMaxPreset),
    runCoreMessage: <R = unknown>(msg: ExtensionMessage) => simulateMessageResponse<R>(msg),
    syncMusicWithSession: () => syncSimulatedMusicWithSession(),
  });
}
