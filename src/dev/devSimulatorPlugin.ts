import {
  getSimStateAdapter,
  registerSimMessagePlugin,
  registerSimTickHook,
  registerTimeScaleProvider,
  SimStateAdapter,
} from '../ui/services/devRuntimeBridge.ts';
import { MessageResponse } from '../types/messages.ts';
import { SessionSnapshot } from '../types/session.ts';
import { DailyStatRecord } from '../types/storageSchema.ts';
import { CURRENT_SCHEMA_VERSION } from '../storage/migrations/migrationRunner.ts';
import { isTerminalSessionStatus } from '../core/timer/timeCalculator.ts';
import { calculateLifetimeFocusMinutes, isValidDateKey } from '../core/stats/statsAggregator.ts';
import { getLocalDateKey } from '../core/utils/dateUtils.ts';
import { createInitialCivilizationState } from '../core/civilization/civilizationState.ts';
import { createInitialQuestState } from '../core/quests/questEngine.ts';
import { backfillAwardsFromHistory } from '../core/awards/awardsEngine.ts';
import { createInitialAwardState } from '../core/awards/awardsState.ts';
import { isVillagerRole } from '../ui/components/civilization/spriteRegistry.ts';
import { DevExportBundle, DevSnapshotData, DevTimeSpeed } from './devTypes.ts';
import {
  applyDevCompleteAllJobs,
  applyDevCompleteAllQuests,
  applyDevFastForwardDays,
  applyDevFillAllRoles,
  applyDevMaxBuildings,
  applyDevMeetEraRequirements,
  applyDevPlaceFreeBuilding,
  applyDevRecruitFree,
  applyDevRolloverQuests,
  applyDevSetCoins,
  applyDevSetLevel,
  applyDevSetTodayFocusMinutes,
  applyDevUnlockAllAwards,
  applyDevUnlockLand,
  buildDevPresetState,
  buildDevSeedDemoState,
  buildEraEvaluationSummary,
  isStrictFiniteNumber,
  isValidDevPresetId,
  isValidDevTimeSpeed,
  sanitizeImportedBundle,
} from './devStateHelpers.ts';

let simulatorTimeSpeed: DevTimeSpeed = 1;

export function getSimulatorTimeSpeed(): DevTimeSpeed {
  return simulatorTimeSpeed;
}

export function setSimulatorTimeSpeed(speed: DevTimeSpeed): void {
  if (isValidDevTimeSpeed(speed)) {
    simulatorTimeSpeed = speed;
  }
}

function resolveEffectiveDailyStats(
  adapter: SimStateAdapter,
  nowMs: number = Date.now()
): Record<string, DailyStatRecord> {
  const custom = adapter.getCustomDailyStats();
  const state = adapter.getFullState();
  const todayKey =
    state.todayStats?.date && isValidDateKey(state.todayStats.date)
      ? state.todayStats.date
      : getLocalDateKey(nowMs);
  if (custom) {
    return {
      ...custom,
      ...(state.todayStats ? { [todayKey]: { ...state.todayStats } } : {}),
    };
  }
  return adapter.buildDefaultDailyStats(todayKey, state.todayStats);
}

function buildSimSnapshot(adapter: SimStateAdapter, nowMs: number = Date.now()): DevSnapshotData {
  const state = adapter.getFullState();
  const civ = adapter.getCivState();
  const questState = adapter.getQuestState();
  const awards = adapter.getAwardState();
  const dailyStats = resolveEffectiveDailyStats(adapter, nowMs);
  const todayKey = getLocalDateKey(nowMs);

  return {
    economy: { ...state.economy },
    civ,
    eraEvaluation: buildEraEvaluationSummary(civ, state.economy, dailyStats),
    session: state.currentSession,
    questState,
    awards,
    lifetimeFocusMinutes: calculateLifetimeFocusMinutes(dailyStats),
    todayFocusMinutes: state.todayStats?.totalFocusMinutes ?? dailyStats[todayKey]?.totalFocusMinutes ?? 0,
    timeSpeed: simulatorTimeSpeed,
  };
}

function shiftSimSessionBack(session: SessionSnapshot, deltaMs: number): SessionSnapshot {
  const safe = Math.max(0, Math.floor(deltaMs));
  if (safe <= 0) return session;
  return {
    ...session,
    startedAt: session.startedAt - safe,
    lastCheckpointAt:
      typeof session.lastCheckpointAt === 'number'
        ? session.lastCheckpointAt - safe
        : session.lastCheckpointAt,
    lastHeartbeatAt:
      typeof session.lastHeartbeatAt === 'number'
        ? session.lastHeartbeatAt - safe
        : session.lastHeartbeatAt,
    pomodoroState: session.pomodoroState
      ? {
          ...session.pomodoroState,
          phaseStartedAt: session.pomodoroState.phaseStartedAt - safe,
        }
      : undefined,
  };
}

function advanceSimActiveSessionByMs(adapter: SimStateAdapter, deltaMs: number): void {
  const state = adapter.getFullState();
  const current = state.currentSession;
  if (!current || current.status !== 'RUNNING' || deltaMs <= 0) {
    return;
  }
  adapter.setFullState({
    ...state,
    currentSession: shiftSimSessionBack(current, deltaMs),
  });
  adapter.runCoreMessage({ action: 'GET_SESSION_STATE' });
}

function skipSimFocusWait(adapter: SimStateAdapter): void {
  let state = adapter.getFullState();
  let current = state.currentSession;
  if (!current || current.status === 'IDLE' || isTerminalSessionStatus(current.status)) {
    throw new Error('No active focus session to skip.');
  }
  if (current.status === 'PAUSED') {
    adapter.runCoreMessage({ action: 'RESUME_SESSION' });
    state = adapter.getFullState();
    current = state.currentSession;
  }
  if (!current) return;

  const now = Date.now();
  if (current.mode === 'COUNTDOWN') {
    const targetFinish = current.startedAt + current.targetMinutes * 60 * 1000 + current.totalPauseMs;
    const shift = Math.max(0, targetFinish - now + 1500);
    adapter.setFullState({
      ...state,
      currentSession: shiftSimSessionBack(current, shift),
    });
    adapter.runCoreMessage({ action: 'GET_SESSION_STATE' });
    return;
  }

  if (current.mode === 'POMODORO_COUNTDOWN') {
    for (let guard = 0; guard < 200; guard += 1) {
      const latest = adapter.getFullState().currentSession;
      if (!latest || latest.status !== 'RUNNING' || !latest.pomodoroState) break;
      const prevPhase = latest.pomodoroState.currentPhase;
      const prevCompleted = latest.pomodoroState.completedFocusCount;
      adapter.runCoreMessage({ action: 'ADVANCE_POMODORO_STAGE' });
      const after = adapter.getFullState().currentSession;
      if (!after || after.status === 'COMPLETED' || isTerminalSessionStatus(after.status)) {
        break;
      }
      if (
        after.pomodoroState?.currentPhase === prevPhase &&
        after.pomodoroState?.completedFocusCount === prevCompleted
      ) {
        break;
      }
    }
    return;
  }

  if (current.mode === 'POMODORO_STOPWATCH') {
    const ps = current.pomodoroState;
    if (ps && ps.completedFocusCount === 0) {
      if (ps.currentPhase !== 'FOCUS') {
        adapter.runCoreMessage({ action: 'ADVANCE_POMODORO_STAGE' });
      }
      const nextState = adapter.getFullState();
      const s = nextState.currentSession;
      if (s?.pomodoroState && s.pomodoroState.currentPhase === 'FOCUS') {
        const intervalMins =
          s.pomodoroConfig?.focusIntervalDurationMinutes ??
          s.pomodoroConfig?.focusDurationMinutes ??
          25;
        const targetFinish =
          s.pomodoroState.phaseStartedAt +
          intervalMins * 60 * 1000 +
          (s.pomodoroState.phaseTotalPauseMs ?? 0);
        const shift = Math.max(0, targetFinish - Date.now() + 1500);
        adapter.setFullState({
          ...nextState,
          currentSession: {
            ...s,
            pomodoroState: {
              ...s.pomodoroState,
              phaseStartedAt: s.pomodoroState.phaseStartedAt - shift,
            },
          },
        });
      }
    }
    adapter.runCoreMessage({ action: 'FINISH_STOPWATCH' });
    return;
  }

  // Standard STOPWATCH -> ensure >= 5m focus duration
  const minMs = 5 * 60 * 1000 + 1500;
  const elapsedMs = Math.max(0, now - current.startedAt - current.totalPauseMs);
  if (elapsedMs < minMs) {
    adapter.setFullState({
      ...state,
      currentSession: shiftSimSessionBack(current, minMs - elapsedMs),
    });
  }
  adapter.runCoreMessage({ action: 'FINISH_STOPWATCH' });
}

export function handleSimDevMessage(message: {
  readonly action: string;
  readonly payload?: unknown;
}): MessageResponse<unknown> | null {
  if (!message.action.startsWith('DEV_')) {
    return null;
  }

  const adapter = getSimStateAdapter();
  if (!adapter) {
    return { success: false, error: 'Simulator state adapter unavailable.' };
  }

  const nowMs = Date.now();
  const payload = message.payload;

  try {
    switch (message.action) {
      case 'DEV_GET_SNAPSHOT':
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };

      case 'DEV_SET_COINS': {
        const amount = (payload as { amount?: unknown } | undefined)?.amount;
        if (!isStrictFiniteNumber(amount) || amount < 0) {
          return { success: false, error: 'Invalid Coins amount.' };
        }
        const st = adapter.getFullState();
        adapter.setFullState({
          ...st,
          economy: applyDevSetCoins(st.economy, amount),
        });
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_SET_LEVEL': {
        const level = (payload as { level?: unknown } | undefined)?.level;
        if (!isStrictFiniteNumber(level) || level < 1) {
          return { success: false, error: 'Invalid Player Level.' };
        }
        const st = adapter.getFullState();
        adapter.setFullState({
          ...st,
          economy: applyDevSetLevel(st.economy, level),
        });
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_SET_FOCUS_MINUTES': {
        const minutes = (payload as { minutes?: unknown } | undefined)?.minutes;
        if (!isStrictFiniteNumber(minutes) || minutes < 0) {
          return { success: false, error: 'Invalid focus minutes.' };
        }
        const baseStats = resolveEffectiveDailyStats(adapter, nowMs);
        const updatedStats = applyDevSetTodayFocusMinutes(baseStats, minutes, nowMs);
        const todayKey = getLocalDateKey(nowMs);
        adapter.setCustomDailyStats(updatedStats);
        const st = adapter.getFullState();
        adapter.setFullState({
          ...st,
          todayStats: updatedStats[todayKey],
          lifetimeFocusMinutes: calculateLifetimeFocusMinutes(updatedStats),
        });
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_SET_TIME_SPEED': {
        const speed = (payload as { speed?: unknown } | undefined)?.speed;
        if (!isValidDevTimeSpeed(speed)) {
          return { success: false, error: 'Time speed must be 1, 10, 60, or 600.' };
        }
        simulatorTimeSpeed = speed;
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_ADVANCE_ACTIVE_SESSION_MS': {
        const rawDelta = (payload as { deltaMs?: unknown } | undefined)?.deltaMs;
        if (!isStrictFiniteNumber(rawDelta) || rawDelta < 0) {
          return { success: false, error: 'Invalid advance duration (deltaMs).' };
        }
        advanceSimActiveSessionByMs(adapter, rawDelta);
        return { success: true, data: buildSimSnapshot(adapter, Date.now()) };
      }

      case 'DEV_SKIP_FOCUS_WAIT': {
        skipSimFocusWait(adapter);
        return { success: true, data: buildSimSnapshot(adapter, Date.now()) };
      }

      case 'DEV_COMPLETE_ALL_JOBS': {
        adapter.setCivState(applyDevCompleteAllJobs(adapter.getCivState(), nowMs));
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_PLACE_FREE_BUILDING': {
        const definitionId = (payload as { definitionId?: unknown } | undefined)?.definitionId;
        if (typeof definitionId !== 'string' || definitionId.trim().length === 0) {
          return { success: false, error: 'Missing building definitionId.' };
        }
        adapter.setCivState(applyDevPlaceFreeBuilding(adapter.getCivState(), definitionId, nowMs));
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_MAX_BUILDINGS': {
        adapter.setCivState(applyDevMaxBuildings(adapter.getCivState(), nowMs));
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_UNLOCK_LAND': {
        const rawChunks = (payload as { chunks?: unknown } | undefined)?.chunks;
        if (rawChunks !== undefined && (!isStrictFiniteNumber(rawChunks) || rawChunks < 1)) {
          return { success: false, error: 'Invalid land chunk count.' };
        }
        adapter.setCivState(
          applyDevUnlockLand(adapter.getCivState(), (rawChunks ?? 1) >= 3 ? 3 : 1, nowMs)
        );
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_RECRUIT_FREE': {
        const role = (payload as { role?: unknown } | undefined)?.role;
        if (!isVillagerRole(role)) {
          return { success: false, error: 'Invalid villager role.' };
        }
        adapter.setCivState(applyDevRecruitFree(adapter.getCivState(), role, nowMs));
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_FILL_ALL_ROLES': {
        adapter.setCivState(applyDevFillAllRoles(adapter.getCivState(), nowMs));
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_MEET_ERA_REQUIREMENTS': {
        const st = adapter.getFullState();
        const dailyStats = resolveEffectiveDailyStats(adapter, nowMs);
        const next = applyDevMeetEraRequirements({
          civ: adapter.getCivState(),
          economy: st.economy,
          dailyStats,
          nowMs,
        });
        const todayKey = getLocalDateKey(nowMs);
        adapter.setCivState(next.civ);
        adapter.setCustomDailyStats(next.dailyStats);
        adapter.setFullState({
          ...st,
          economy: next.economy,
          todayStats: next.dailyStats[todayKey] ?? st.todayStats,
          lifetimeFocusMinutes: calculateLifetimeFocusMinutes(next.dailyStats),
        });
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_COMPLETE_ALL_QUESTS': {
        adapter.setQuestState(applyDevCompleteAllQuests(adapter.getQuestState(), nowMs));
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_ROLLOVER_QUESTS': {
        const period = (payload as { period?: unknown } | undefined)?.period;
        if (period !== 'DAILY' && period !== 'WEEKLY') {
          return { success: false, error: 'Period must be DAILY or WEEKLY.' };
        }
        adapter.setQuestState(applyDevRolloverQuests(adapter.getQuestState(), period, nowMs));
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_UNLOCK_ALL_AWARDS': {
        const civ = adapter.getCivState();
        adapter.setAwardState(applyDevUnlockAllAwards(adapter.getAwardState(), nowMs, civ.era));
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_RESET_AWARDS': {
        adapter.setAwardState(createInitialAwardState());
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_FAST_FORWARD_DAY': {
        const rawDays = (payload as { days?: unknown } | undefined)?.days;
        if (rawDays !== undefined && (!isStrictFiniteNumber(rawDays) || rawDays < 1)) {
          return { success: false, error: 'Invalid fast-forward days.' };
        }
        const days = rawDays ?? 1;
        const dailyStats = resolveEffectiveDailyStats(adapter, nowMs);
        const next = applyDevFastForwardDays({
          questState: adapter.getQuestState(),
          dailyStats,
          days,
          nowMs,
        });
        const todayKey = getLocalDateKey(nowMs);
        adapter.setQuestState(next.questState);
        adapter.setCustomDailyStats(next.dailyStats);
        const st = adapter.getFullState();
        adapter.setFullState({
          ...st,
          todayStats: next.dailyStats[todayKey] ?? {
            date: todayKey,
            totalFocusMinutes: 0,
            completedSessions: 0,
            abandonedSessions: 0,
            coinsEarned: 0,
            xpEarned: 0,
          },
          lifetimeFocusMinutes: calculateLifetimeFocusMinutes(next.dailyStats),
        });
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_SEED_DEMO_DATA': {
        const seeded = buildDevSeedDemoState(nowMs);
        const todayKey = getLocalDateKey(nowMs);
        adapter.setCivState(seeded.civ);
        adapter.setQuestState(seeded.questState);
        adapter.setCustomDailyStats(seeded.dailyStats);
        adapter.setAwardState(
          backfillAwardsFromHistory(createInitialAwardState(), {
            economy: seeded.economy,
            dailyStats: seeded.dailyStats,
            quests: seeded.questState,
            civilization: seeded.civ,
            todayDateKey: todayKey,
            nowMs,
          }).nextState
        );
        const st = adapter.getFullState();
        adapter.setFullState({
          ...st,
          economy: seeded.economy,
          todayStats: seeded.dailyStats[todayKey],
          lifetimeFocusMinutes: calculateLifetimeFocusMinutes(seeded.dailyStats),
        });
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_APPLY_PRESET': {
        const presetId = (payload as { presetId?: unknown } | undefined)?.presetId;
        if (!isValidDevPresetId(presetId)) {
          return { success: false, error: 'Unknown dev presetId.' };
        }
        if (presetId === 'newcomer') {
          simulatorTimeSpeed = 1;
        }
        const preset = buildDevPresetState(presetId, nowMs);
        const todayKey = getLocalDateKey(nowMs);
        adapter.setCivState(preset.civ);
        adapter.setQuestState(preset.questState);
        adapter.setCustomDailyStats(preset.dailyStats);
        adapter.setAwardState(
          backfillAwardsFromHistory(createInitialAwardState(), {
            economy: preset.economy,
            dailyStats: preset.dailyStats,
            quests: preset.questState,
            civilization: preset.civ,
            todayDateKey: todayKey,
            nowMs,
          }).nextState
        );
        const st = adapter.getFullState();
        adapter.setFullState({
          ...st,
          currentSession: null,
          isBlockingActive: false,
          economy: preset.economy,
          todayStats: preset.dailyStats[todayKey] ?? {
            date: todayKey,
            totalFocusMinutes: 0,
            completedSessions: 0,
            abandonedSessions: 0,
            coinsEarned: 0,
            xpEarned: 0,
          },
          lifetimeFocusMinutes: calculateLifetimeFocusMinutes(preset.dailyStats),
        });
        adapter.syncMusicWithSession();
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_EXPORT_STATE': {
        const st = adapter.getFullState();
        const bundle: DevExportBundle = {
          exportedAt: nowMs,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          economy: st.economy,
          civilization: adapter.getCivState(),
          quests: adapter.getQuestState(),
          awards: adapter.getAwardState(),
          dailyStats: resolveEffectiveDailyStats(adapter, nowMs),
          profiles: adapter.getProfiles(),
          activeProfileId: st.activeProfile?.id ?? '',
          settings: st.settings,
        };
        return { success: true, data: bundle };
      }

      case 'DEV_IMPORT_STATE': {
        const rawInput = (payload as { bundle?: unknown } | undefined)?.bundle;
        const sanitized = sanitizeImportedBundle(rawInput, nowMs);
        const todayKey = getLocalDateKey(nowMs);
        adapter.setCivState(sanitized.civ);
        adapter.setQuestState(sanitized.quests);
        adapter.setCustomDailyStats(sanitized.dailyStats);
        adapter.setAwardState(
          sanitized.awards ??
            backfillAwardsFromHistory(createInitialAwardState(), {
              economy: sanitized.economy,
              dailyStats: sanitized.dailyStats,
              quests: sanitized.quests,
              civilization: sanitized.civ,
              todayDateKey: todayKey,
              nowMs,
            }).nextState
        );
        if (sanitized.profiles && sanitized.profiles.length > 0) {
          adapter.setProfiles(sanitized.profiles);
        }
        const st = adapter.getFullState();
        const activeProfile =
          adapter.getProfiles().find((p) => p.id === sanitized.activeProfileId) ??
          st.activeProfile;
        adapter.setFullState({
          ...st,
          currentSession: null,
          isBlockingActive: false,
          economy: sanitized.economy,
          activeProfile,
          todayStats: sanitized.dailyStats[todayKey] ?? {
            date: todayKey,
            totalFocusMinutes: 0,
            completedSessions: 0,
            abandonedSessions: 0,
            coinsEarned: 0,
            xpEarned: 0,
          },
          lifetimeFocusMinutes: calculateLifetimeFocusMinutes(sanitized.dailyStats),
          settings: sanitized.settings ?? st.settings,
        });
        adapter.syncMusicWithSession();
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      case 'DEV_RESET_ALL_DATA': {
        simulatorTimeSpeed = 1;
        const todayKey = getLocalDateKey(nowMs);
        const st = adapter.getFullState();
        const emptyStats: Record<string, DailyStatRecord> = {};
        adapter.setCivState(createInitialCivilizationState());
        adapter.setQuestState(createInitialQuestState(nowMs));
        adapter.setAwardState(createInitialAwardState());
        adapter.setCustomDailyStats(emptyStats);
        adapter.setFullState({
          ...st,
          currentSession: null,
          isBlockingActive: false,
          economy: {
            focusCoins: 0,
            totalXP: 0,
            level: 1,
          },
          todayStats: {
            date: todayKey,
            totalFocusMinutes: 0,
            completedSessions: 0,
            abandonedSessions: 0,
            coinsEarned: 0,
            xpEarned: 0,
          },
          lifetimeFocusMinutes: 0,
          settings: {
            soundEnabled: false,
            notificationsEnabled: true,
          },
        });
        adapter.syncMusicWithSession();
        return { success: true, data: buildSimSnapshot(adapter, nowMs) };
      }

      default:
        return null;
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function initDevSimulatorPlugin(): void {
  if (
    typeof import.meta === 'undefined' ||
    typeof import.meta.env === 'undefined' ||
    import.meta.env.DEV !== true
  ) {
    return;
  }

  registerSimMessagePlugin(handleSimDevMessage);
  registerTimeScaleProvider(() => simulatorTimeSpeed);
  registerSimTickHook((elapsedRealMs) => {
    const adapter = getSimStateAdapter();
    if (!adapter || simulatorTimeSpeed <= 1) return;
    advanceSimActiveSessionByMs(adapter, elapsedRealMs * (simulatorTimeSpeed - 1));
  });
}

initDevSimulatorPlugin();
