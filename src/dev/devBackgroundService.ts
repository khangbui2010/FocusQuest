import { StorageManager } from '../storage/storageManager.ts';
import { STORAGE_KEYS } from '../storage/storageKeys.ts';
import { CURRENT_SCHEMA_VERSION } from '../storage/migrations/migrationRunner.ts';
import { SessionCoordinator } from '../background/sessionCoordinator.ts';
import { CivilizationCoordinator } from '../background/civilizationCoordinator.ts';
import { QuestCoordinator } from '../background/questCoordinator.ts';
import { MessageResponse } from '../types/messages.ts';
import { PlayerEconomy } from '../types/economy.ts';
import { DailyStatRecord, UserSettings } from '../types/storageSchema.ts';
import { FocusProfile } from '../types/profiles.ts';
import { SessionSnapshot } from '../types/session.ts';
import { isTerminalSessionStatus } from '../core/timer/timeCalculator.ts';
import { TimerStateMachine } from '../core/timer/timerStateMachine.ts';
import { calculateLifetimeFocusMinutes } from '../core/stats/statsAggregator.ts';
import { getLocalDateKey } from '../core/utils/dateUtils.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
} from '../core/civilization/civilizationState.ts';
import { createInitialQuestState } from '../core/quests/questEngine.ts';
import { backfillAwardsFromHistory } from '../core/awards/awardsEngine.ts';
import { createInitialAwardState } from '../core/awards/awardsState.ts';
import { isVillagerRole } from '../ui/components/civilization/spriteRegistry.ts';
import {
  DevExportBundle,
  DevSnapshotData,
  DevTimeSpeed,
} from './devTypes.ts';
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

export interface DevBackgroundDeps {
  storageManager: StorageManager;
  sessionCoordinator: SessionCoordinator;
  civilizationCoordinator: CivilizationCoordinator;
  questCoordinator: QuestCoordinator;
}

export interface DevBackgroundController {
  handleMessage: (message: unknown) => Promise<MessageResponse<unknown> | null>;
  getTimeSpeed: () => DevTimeSpeed;
  setTimeSpeed: (speed: DevTimeSpeed) => void;
}

function isDevActionMessage(
  msg: unknown
): msg is { action: string; payload?: unknown } {
  return Boolean(
    msg &&
      typeof msg === 'object' &&
      'action' in msg &&
      typeof (msg as { action?: unknown }).action === 'string' &&
      (msg as { action: string }).action.startsWith('DEV_')
  );
}

function shiftSessionClockBack(session: SessionSnapshot, shiftMs: number): SessionSnapshot {
  const safeShift = Math.max(0, Math.floor(shiftMs));
  if (safeShift <= 0) return session;
  return {
    ...session,
    startedAt: session.startedAt - safeShift,
    lastCheckpointAt:
      typeof session.lastCheckpointAt === 'number'
        ? session.lastCheckpointAt - safeShift
        : session.lastCheckpointAt,
    lastHeartbeatAt:
      typeof session.lastHeartbeatAt === 'number'
        ? session.lastHeartbeatAt - safeShift
        : session.lastHeartbeatAt,
    pomodoroState: session.pomodoroState
      ? {
          ...session.pomodoroState,
          phaseStartedAt: session.pomodoroState.phaseStartedAt - safeShift,
        }
      : undefined,
  };
}

export function createDevBackgroundController(
  deps: DevBackgroundDeps
): DevBackgroundController {
  let timeSpeed: DevTimeSpeed = 1;

  async function readSnapshot(nowMs: number = Date.now()): Promise<DevSnapshotData> {
    const economy = await deps.storageManager.getEconomy();
    const civ = await deps.civilizationCoordinator.getCivilizationState();
    const dailyStats = await deps.storageManager.getDailyStats();
    const session = await deps.storageManager.getCurrentSession();
    const questState = await deps.storageManager.getQuests(nowMs);
    const awards = await deps.storageManager.getAwards();
    const todayKey = getLocalDateKey(nowMs);

    return {
      economy,
      civ,
      eraEvaluation: buildEraEvaluationSummary(civ, economy, dailyStats),
      session,
      questState,
      awards,
      lifetimeFocusMinutes: calculateLifetimeFocusMinutes(dailyStats),
      todayFocusMinutes: dailyStats[todayKey]?.totalFocusMinutes ?? 0,
      timeSpeed,
    };
  }

  async function advanceActiveSessionByMs(deltaMs: number): Promise<SessionSnapshot | null> {
    const safeDelta = Math.max(0, Math.floor(deltaMs));
    if (safeDelta <= 0) {
      return deps.storageManager.getCurrentSession();
    }

    const updated = await deps.storageManager.runExclusive(async () => {
      const current = await deps.storageManager.getCurrentSession();
      if (!current || current.status !== 'RUNNING') {
        return current;
      }
      const shifted = shiftSessionClockBack(current, safeDelta);
      await deps.storageManager.setCurrentSession(shifted);
      return shifted;
    });

    if (!updated || updated.status !== 'RUNNING') {
      return updated;
    }

    const now = Date.now();
    if (updated.mode === 'COUNTDOWN') {
      const targetFinish =
        updated.startedAt + updated.targetMinutes * 60 * 1000 + updated.totalPauseMs;
      if (now >= targetFinish) {
        return deps.sessionCoordinator.completeCountdown();
      }
    } else if (
      (updated.mode === 'POMODORO_COUNTDOWN' || updated.mode === 'POMODORO_STOPWATCH') &&
      updated.pomodoroState &&
      updated.pomodoroConfig
    ) {
      const ps = updated.pomodoroState;
      const targetFinish =
        ps.phaseStartedAt +
        ps.phaseTargetDurationMinutes * 60 * 1000 +
        (ps.phaseTotalPauseMs ?? 0);
      if (now >= targetFinish) {
        return deps.sessionCoordinator.advancePomodoroStage(undefined, ps.currentPhase);
      }
    }

    return updated;
  }

  async function skipFocusWait(): Promise<SessionSnapshot | null> {
    let current = await deps.storageManager.getCurrentSession();
    if (!current || current.status === 'IDLE' || isTerminalSessionStatus(current.status)) {
      throw new Error('No active focus session to skip.');
    }

    if (current.status === 'PAUSED') {
      current = await deps.sessionCoordinator.resumeSession(false);
    }

    if (current.mode === 'COUNTDOWN') {
      await deps.storageManager.runExclusive(async () => {
        const s = await deps.storageManager.getCurrentSession();
        if (!s || s.status !== 'RUNNING') return;
        const now = Date.now();
        const targetFinish = s.startedAt + s.targetMinutes * 60 * 1000 + s.totalPauseMs;
        const neededShift = Math.max(0, targetFinish - now + 1500);
        await deps.storageManager.setCurrentSession(shiftSessionClockBack(s, neededShift));
      });
      return deps.sessionCoordinator.completeCountdown();
    }

    if (current.mode === 'POMODORO_COUNTDOWN') {
      for (let guard = 0; guard < 200; guard += 1) {
        const s = await deps.storageManager.getCurrentSession();
        if (!s || s.status !== 'RUNNING' || !s.pomodoroState) {
          return s;
        }
        const phase = s.pomodoroState.currentPhase;
        const completedBefore = s.pomodoroState.completedFocusCount;
        await deps.storageManager.runExclusive(async () => {
          const latest = await deps.storageManager.getCurrentSession();
          if (!latest || latest.status !== 'RUNNING' || !latest.pomodoroState) return;
          const now = Date.now();
          const ps = latest.pomodoroState;
          const targetFinish =
            ps.phaseStartedAt + ps.phaseTargetDurationMinutes * 60 * 1000 + (ps.phaseTotalPauseMs ?? 0);
          const neededShift = Math.max(0, targetFinish - now + 1500);
          await deps.storageManager.setCurrentSession({
            ...latest,
            pomodoroState: {
              ...ps,
              phaseStartedAt: ps.phaseStartedAt - neededShift,
            },
          });
        });
        const next = await deps.sessionCoordinator.advancePomodoroStage(undefined, phase);
        if (!next || next.status === 'COMPLETED' || isTerminalSessionStatus(next.status)) {
          return next;
        }
        if (
          next.pomodoroState?.currentPhase === phase &&
          next.pomodoroState?.completedFocusCount === completedBefore
        ) {
          return next;
        }
      }
      return deps.storageManager.getCurrentSession();
    }

    if (current.mode === 'POMODORO_STOPWATCH') {
      let s = await deps.storageManager.getCurrentSession();
      if (s && s.status === 'RUNNING' && s.pomodoroState) {
        if (s.pomodoroState.completedFocusCount === 0 && s.pomodoroState.currentPhase !== 'FOCUS') {
          const breakPhase = s.pomodoroState.currentPhase;
          await deps.storageManager.runExclusive(async () => {
            const latest = await deps.storageManager.getCurrentSession();
            if (!latest || !latest.pomodoroState) return;
            const now = Date.now();
            const ps = latest.pomodoroState;
            const targetFinish =
              ps.phaseStartedAt +
              ps.phaseTargetDurationMinutes * 60 * 1000 +
              (ps.phaseTotalPauseMs ?? 0);
            const neededShift = Math.max(0, targetFinish - now + 1500);
            await deps.storageManager.setCurrentSession({
              ...latest,
              pomodoroState: {
                ...ps,
                phaseStartedAt: ps.phaseStartedAt - neededShift,
              },
            });
          });
          s = await deps.sessionCoordinator.advancePomodoroStage(undefined, breakPhase);
        }

        if (s && s.status === 'RUNNING' && s.pomodoroState?.currentPhase === 'FOCUS') {
          await deps.storageManager.runExclusive(async () => {
            const latest = await deps.storageManager.getCurrentSession();
            if (!latest || !latest.pomodoroState) return;
            const now = Date.now();
            const ps = latest.pomodoroState;
            const intervalMins =
              latest.pomodoroConfig?.focusIntervalDurationMinutes ??
              latest.pomodoroConfig?.focusDurationMinutes ??
              25;
            const targetFinish =
              ps.phaseStartedAt + intervalMins * 60 * 1000 + (ps.phaseTotalPauseMs ?? 0);
            const neededShift = Math.max(0, targetFinish - now + 1500);
            await deps.storageManager.setCurrentSession({
              ...latest,
              pomodoroState: {
                ...ps,
                phaseStartedAt: ps.phaseStartedAt - neededShift,
              },
            });
          });
        }
      }
      const finished = await deps.sessionCoordinator.finishStopwatch();
      return finished.session;
    }

    // Standard STOPWATCH: ensure at least 5 focus minutes so threshold passes when testing skip
    await deps.storageManager.runExclusive(async () => {
      const s = await deps.storageManager.getCurrentSession();
      if (!s || s.status !== 'RUNNING') return;
      const now = Date.now();
      const targetMins = 5;
      const currentFocusMs = Math.max(0, now - s.startedAt - s.totalPauseMs);
      const minFocusMs = targetMins * 60 * 1000 + 1500;
      if (currentFocusMs < minFocusMs) {
        const neededShift = minFocusMs - currentFocusMs;
        await deps.storageManager.setCurrentSession(shiftSessionClockBack(s, neededShift));
      }
    });
    const finished = await deps.sessionCoordinator.finishStopwatch();
    return finished.session;
  }

  async function mutateCivState(
    updater: (civ: CivilizationState, nowMs: number) => CivilizationState
  ): Promise<DevSnapshotData> {
    const nowMs = Date.now();
    await deps.storageManager.runExclusive(async () => {
      const civ = await deps.civilizationCoordinator.getCivilizationState();
      const nextCiv = updater(civ, nowMs);
      await deps.storageManager.setCivilizationState(nextCiv);
      deps.civilizationCoordinator.refreshCachedBonuses(nextCiv);
    });
    return readSnapshot(nowMs);
  }

  async function clearSessionBeforeFullReplace(): Promise<void> {
    const existing = await deps.storageManager.getCurrentSession();
    if (existing && TimerStateMachine.isActive(existing.status)) {
      await deps.sessionCoordinator.giveUpCountdown();
    }
    await deps.sessionCoordinator.resetSession();
  }

  async function handleMessage(message: unknown): Promise<MessageResponse<unknown> | null> {
    if (!isDevActionMessage(message)) {
      return null;
    }

    const action = message.action;
    const payload = message.payload;
    const nowMs = Date.now();

    try {
      switch (action) {
        case 'DEV_GET_SNAPSHOT': {
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_SET_COINS': {
          const amount = (payload as { amount?: unknown } | undefined)?.amount;
          if (!isStrictFiniteNumber(amount) || amount < 0) {
            return { success: false, error: 'Invalid Coins amount.' };
          }
          await deps.storageManager.updateEconomy((eco) => applyDevSetCoins(eco, amount));
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_SET_LEVEL': {
          const level = (payload as { level?: unknown } | undefined)?.level;
          if (!isStrictFiniteNumber(level) || level < 1) {
            return { success: false, error: 'Invalid Player Level.' };
          }
          await deps.storageManager.updateEconomy((eco) => applyDevSetLevel(eco, level));
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_SET_FOCUS_MINUTES': {
          const minutes = (payload as { minutes?: unknown } | undefined)?.minutes;
          if (!isStrictFiniteNumber(minutes) || minutes < 0) {
            return { success: false, error: 'Invalid focus minutes.' };
          }
          await deps.storageManager.runExclusive(async () => {
            const stats = await deps.storageManager.getDailyStats();
            const updated = applyDevSetTodayFocusMinutes(stats, minutes, nowMs);
            await deps.storageManager.setDailyStats(updated);
          });
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_SET_TIME_SPEED': {
          const speed = (payload as { speed?: unknown } | undefined)?.speed;
          if (!isValidDevTimeSpeed(speed)) {
            return { success: false, error: 'Time speed must be 1, 10, 60, or 600.' };
          }
          timeSpeed = speed;
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_ADVANCE_ACTIVE_SESSION_MS': {
          const rawDelta = (payload as { deltaMs?: unknown } | undefined)?.deltaMs;
          if (!isStrictFiniteNumber(rawDelta) || rawDelta < 0) {
            return { success: false, error: 'Invalid advance duration (deltaMs).' };
          }
          await advanceActiveSessionByMs(rawDelta);
          return { success: true, data: await readSnapshot(Date.now()) };
        }

        case 'DEV_SKIP_FOCUS_WAIT': {
          await skipFocusWait();
          return { success: true, data: await readSnapshot(Date.now()) };
        }

        case 'DEV_COMPLETE_ALL_JOBS': {
          return {
            success: true,
            data: await mutateCivState((civ, ts) => applyDevCompleteAllJobs(civ, ts)),
          };
        }

        case 'DEV_PLACE_FREE_BUILDING': {
          const definitionId = (payload as { definitionId?: unknown } | undefined)?.definitionId;
          if (typeof definitionId !== 'string' || definitionId.trim().length === 0) {
            return { success: false, error: 'Missing building definitionId.' };
          }
          return {
            success: true,
            data: await mutateCivState((civ, ts) =>
              applyDevPlaceFreeBuilding(civ, definitionId, ts)
            ),
          };
        }

        case 'DEV_MAX_BUILDINGS': {
          return {
            success: true,
            data: await mutateCivState((civ, ts) => applyDevMaxBuildings(civ, ts)),
          };
        }

        case 'DEV_UNLOCK_LAND': {
          const rawChunks = (payload as { chunks?: unknown } | undefined)?.chunks;
          if (rawChunks !== undefined && (!isStrictFiniteNumber(rawChunks) || rawChunks < 1)) {
            return { success: false, error: 'Invalid land chunk count.' };
          }
          const chunks = (rawChunks ?? 1) >= 3 ? 3 : 1;
          return {
            success: true,
            data: await mutateCivState((civ, ts) => applyDevUnlockLand(civ, chunks, ts)),
          };
        }

        case 'DEV_RECRUIT_FREE': {
          const role = (payload as { role?: unknown } | undefined)?.role;
          if (!isVillagerRole(role)) {
            return { success: false, error: 'Invalid villager role.' };
          }
          return {
            success: true,
            data: await mutateCivState((civ, ts) => applyDevRecruitFree(civ, role, ts)),
          };
        }

        case 'DEV_FILL_ALL_ROLES': {
          return {
            success: true,
            data: await mutateCivState((civ, ts) => applyDevFillAllRoles(civ, ts)),
          };
        }

        case 'DEV_MEET_ERA_REQUIREMENTS': {
          await deps.storageManager.runExclusive(async () => {
            const civ = await deps.civilizationCoordinator.getCivilizationState();
            const economy = await deps.storageManager.getEconomy();
            const dailyStats = await deps.storageManager.getDailyStats();
            const next = applyDevMeetEraRequirements({ civ, economy, dailyStats, nowMs });
            await deps.storageManager.setCivilizationState(next.civ);
            await deps.storageManager.setEconomy(next.economy);
            await deps.storageManager.setDailyStats(next.dailyStats);
            deps.civilizationCoordinator.refreshCachedBonuses(next.civ);
          });
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_COMPLETE_ALL_QUESTS': {
          await deps.storageManager.updateQuests(
            (q) => applyDevCompleteAllQuests(q, nowMs),
            nowMs
          );
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_ROLLOVER_QUESTS': {
          const period = (payload as { period?: unknown } | undefined)?.period;
          if (period !== 'DAILY' && period !== 'WEEKLY') {
            return { success: false, error: 'Period must be DAILY or WEEKLY.' };
          }
          await deps.storageManager.updateQuests(
            (q) => applyDevRolloverQuests(q, period, nowMs),
            nowMs
          );
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_UNLOCK_ALL_AWARDS': {
          const civ = await deps.civilizationCoordinator.getCivilizationState();
          await deps.storageManager.updateAwards((cur) =>
            applyDevUnlockAllAwards(cur, nowMs, civ.era)
          );
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_RESET_AWARDS': {
          await deps.storageManager.setAwards(createInitialAwardState());
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_FAST_FORWARD_DAY': {
          const rawDays = (payload as { days?: unknown } | undefined)?.days;
          if (rawDays !== undefined && (!isStrictFiniteNumber(rawDays) || rawDays < 1)) {
            return { success: false, error: 'Invalid fast-forward days.' };
          }
          const days = rawDays ?? 1;
          await deps.storageManager.runExclusive(async () => {
            const questState = await deps.storageManager.getQuests(nowMs);
            const dailyStats = await deps.storageManager.getDailyStats();
            const next = applyDevFastForwardDays({
              questState,
              dailyStats,
              days,
              nowMs,
            });
            await deps.storageManager.setQuests(next.questState);
            await deps.storageManager.setDailyStats(next.dailyStats);
          });
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_SEED_DEMO_DATA': {
          const seeded = buildDevSeedDemoState(nowMs);
          await deps.storageManager.runExclusive(async () => {
            await deps.storageManager.setEconomy(seeded.economy);
            await deps.storageManager.setCivilizationState(seeded.civ);
            await deps.storageManager.setQuests(seeded.questState);
            await deps.storageManager.setDailyStats(seeded.dailyStats);
            const awardsEval = backfillAwardsFromHistory(createInitialAwardState(), {
              economy: seeded.economy,
              dailyStats: seeded.dailyStats,
              quests: seeded.questState,
              civilization: seeded.civ,
              todayDateKey: getLocalDateKey(nowMs),
              nowMs,
            });
            await deps.storageManager.setAwards(awardsEval.nextState);
            deps.civilizationCoordinator.refreshCachedBonuses(seeded.civ);
          });
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_APPLY_PRESET': {
          const presetId = (payload as { presetId?: unknown } | undefined)?.presetId;
          if (!isValidDevPresetId(presetId)) {
            return { success: false, error: 'Unknown dev presetId.' };
          }
          const presetState = buildDevPresetState(presetId, nowMs);
          await clearSessionBeforeFullReplace();
          if (presetId === 'newcomer') {
            timeSpeed = 1;
          }
          await deps.storageManager.runExclusive(async () => {
            await deps.storageManager.setCurrentSession(null);
            await deps.storageManager.setEconomy(presetState.economy);
            await deps.storageManager.setCivilizationState(presetState.civ);
            await deps.storageManager.setQuests(presetState.questState);
            await deps.storageManager.setDailyStats(presetState.dailyStats);
            const awardsEval = backfillAwardsFromHistory(createInitialAwardState(), {
              economy: presetState.economy,
              dailyStats: presetState.dailyStats,
              quests: presetState.questState,
              civilization: presetState.civ,
              todayDateKey: getLocalDateKey(nowMs),
              nowMs,
            });
            await deps.storageManager.setAwards(awardsEval.nextState);
            deps.civilizationCoordinator.refreshCachedBonuses(presetState.civ);
          });
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_EXPORT_STATE': {
          const [economy, civilization, quests, awards, dailyStats, profiles, activeProfileId, settings] =
            await Promise.all([
              deps.storageManager.getEconomy(),
              deps.civilizationCoordinator.getCivilizationState(),
              deps.storageManager.getQuests(nowMs),
              deps.storageManager.getAwards(),
              deps.storageManager.getDailyStats(),
              deps.storageManager.getProfiles(),
              deps.storageManager.getActiveProfileId(),
              deps.storageManager.getSettings(),
            ]);
          const bundle: DevExportBundle = {
            exportedAt: nowMs,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            economy,
            civilization,
            quests,
            awards,
            dailyStats,
            profiles,
            activeProfileId,
            settings,
          };
          return { success: true, data: bundle };
        }

        case 'DEV_IMPORT_STATE': {
          const rawInput = (payload as { bundle?: unknown } | undefined)?.bundle;
          const sanitized = sanitizeImportedBundle(rawInput, nowMs);
          await clearSessionBeforeFullReplace();

          await deps.storageManager.runExclusive(async () => {
            await deps.storageManager.setCurrentSession(null);
            await deps.storageManager.setEconomy(sanitized.economy);
            await deps.storageManager.setCivilizationState(sanitized.civ);
            await deps.storageManager.setQuests(sanitized.quests);
            await deps.storageManager.setDailyStats(sanitized.dailyStats);
            const nextAwards =
              sanitized.awards ??
              backfillAwardsFromHistory(createInitialAwardState(), {
                economy: sanitized.economy,
                dailyStats: sanitized.dailyStats,
                quests: sanitized.quests,
                civilization: sanitized.civ,
                todayDateKey: getLocalDateKey(nowMs),
                nowMs,
              }).nextState;
            await deps.storageManager.setAwards(nextAwards);
            if (sanitized.profiles && sanitized.profiles.length > 0) {
              await deps.storageManager.setProfiles(sanitized.profiles);
            }
            if (sanitized.activeProfileId) {
              await deps.storageManager.setActiveProfileId(sanitized.activeProfileId);
            }
            if (sanitized.settings) {
              await deps.storageManager.setSettings(sanitized.settings);
            }
            deps.civilizationCoordinator.refreshCachedBonuses(sanitized.civ);
          });
          return { success: true, data: await readSnapshot(nowMs) };
        }

        case 'DEV_RESET_ALL_DATA': {
          timeSpeed = 1;
          await clearSessionBeforeFullReplace();
          await deps.storageManager.runExclusive(async () => {
            const emptyCiv = createInitialCivilizationState();
            const emptyQuests = createInitialQuestState(nowMs);
            const emptyEconomy: PlayerEconomy = {
              focusCoins: 0,
              totalXP: 0,
              level: 1,
            };
            const defaultSettings: UserSettings = {
              soundEnabled: false,
              notificationsEnabled: true,
            };
            await deps.storageManager.setCurrentSession(null);
            await deps.storageManager.clearSessionLifecycleMarker();
            await deps.storageManager.setEconomy(emptyEconomy);
            await deps.storageManager.setCivilizationState(emptyCiv);
            await deps.storageManager.setQuests(emptyQuests);
            await deps.storageManager.setAwards(createInitialAwardState());
            await deps.storageManager.setDailyStats({});
            await deps.storageManager.setSettings(defaultSettings);
            deps.civilizationCoordinator.refreshCachedBonuses(emptyCiv);
          });
          return { success: true, data: await readSnapshot(nowMs) };
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

  return {
    handleMessage,
    getTimeSpeed: () => timeSpeed,
    setTimeSpeed: (speed) => {
      if (isValidDevTimeSpeed(speed)) {
        timeSpeed = speed;
      }
    },
  };
}
