import { StorageManager } from '../storage/storageManager.ts';
import { IAlarmsAdapter } from '../chrome/alarmsAdapter.ts';
import { INotificationsAdapter } from '../chrome/notificationsAdapter.ts';
import { IBadgeAdapter } from '../chrome/badgeAdapter.ts';
import { BlockingCoordinator, isWebsiteBlockingActive } from './blockingCoordinator.ts';
import { ProfileManager } from '../core/profiles/profileManager.ts';
import { TimerStateMachine } from '../core/timer/timerStateMachine.ts';
import { TimeCalculator, MAX_PAUSE_DURATION_MS } from '../core/timer/timeCalculator.ts';
import { RewardEngine } from '../core/reward/rewardEngine.ts';
import { getCoinBonusMultiplier } from '../core/economy/coinBonus.ts';
import { MultiplierRules } from '../core/reward/multiplierRules.ts';
import {
  SessionMode,
  SessionSnapshot,
  PomodoroConfig,
  PomodoroPhase,
  PomodoroState,
} from '../types/session.ts';
import { CoinBonus } from '../types/economy.ts';
import { FocusProfile } from '../types/profiles.ts';
import { FullSessionStateResponse } from '../types/messages.ts';
import { LifecycleReason, LifecycleEventContext } from '../types/lifecycle.ts';
import { getLocalDateKey } from '../core/utils/dateUtils.ts';
import { calculateLifetimeFocusMinutes } from '../core/stats/statsAggregator.ts';
import { formatSessionNotificationContent } from './notificationFormatter.ts';
import { TranslationKey } from '../i18n/types.ts';
import { toQuestOutcomeDelta } from '../core/quests/questEngine.ts';
import { QuestOutcomeDelta } from '../types/quests.ts';
import { AppError } from '../types/errors.ts';

export const ALARM_NAMES = {
  COUNTDOWN_FINISH: 'FQ_ALARM_COUNTDOWN_FINISH',
  PAUSE_AUTO_RESUME: 'FQ_ALARM_PAUSE_AUTO_RESUME',
  HEARTBEAT: 'FQ_ALARM_HEARTBEAT',
  POMODORO_STAGE: 'FQ_ALARM_POMODORO_STAGE',
};

export function buildPauseAlarmName(sessionId: string, pauseStartedAt: number): string {
  return `${ALARM_NAMES.PAUSE_AUTO_RESUME}_${sessionId}_${pauseStartedAt}`;
}

export function parsePauseAlarmName(name: string): { sessionId: string; pauseStartedAt: number } | null {
  const prefix = `${ALARM_NAMES.PAUSE_AUTO_RESUME}_`;
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  const lastUnderscore = rest.lastIndexOf('_');
  if (lastUnderscore === -1) return null;
  const sessionId = rest.slice(0, lastUnderscore);
  const pauseStartedAt = Number(rest.slice(lastUnderscore + 1));
  if (!sessionId || isNaN(pauseStartedAt)) return null;
  return { sessionId, pauseStartedAt };
}

export function buildPomodoroStageAlarmName(
  sessionId: string,
  interval: number,
  phase: PomodoroPhase,
  phaseStartedAt: number
): string {
  return `${ALARM_NAMES.POMODORO_STAGE}_${sessionId}_${interval}_${phase}_${phaseStartedAt}`;
}

export function parsePomodoroStageAlarmName(name: string): {
  sessionId: string;
  interval: number;
  phase: PomodoroPhase;
  phaseStartedAt: number;
} | null {
  const prefix = `${ALARM_NAMES.POMODORO_STAGE}_`;
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  const match = rest.match(/^(.+)_(\d+)_(FOCUS|SHORT_BREAK|LONG_BREAK)_(\d+)$/);
  if (!match) return null;
  const sessionId = match[1];
  const interval = Number(match[2]);
  const phase = match[3] as PomodoroPhase;
  const phaseStartedAt = Number(match[4]);
  if (!sessionId || isNaN(interval) || !phase || isNaN(phaseStartedAt)) return null;
  return { sessionId, interval, phase, phaseStartedAt };
}

export const LIFECYCLE_PRIORITY: Record<LifecycleReason, number> = {
  EXTENSION_RELOADED: 40,
  EXTENSION_RE_ENABLED: 40,
  BROWSER_STARTUP: 30,
  BROWSER_UPDATED: 30,
  EXTENSION_UPDATED: 20,
  SERVICE_WORKER_WAKE: 10,
  UNKNOWN: 0,
};

export interface SessionEndedHookEvent {
  sessionId: string;
  status: 'COMPLETED' | 'ABANDONED' | 'INTERRUPTED';
  mode: SessionMode;
}

export class SessionCoordinator {
  private rewardEngine = new RewardEngine();
  private inFlightRecoveryPromise: Promise<SessionSnapshot | null> | null = null;
  private inFlightContext: LifecycleEventContext | null = null;
  private lastProcessedStartupSessionId: string | null = null;
  private isInitialized = false;
  private dispatchedCompletionNotificationIds = new Set<string>();

  constructor(
    private storage: StorageManager,
    private profileManager: ProfileManager,
    private alarms: IAlarmsAdapter,
    private notifications: INotificationsAdapter,
    private badge: IBadgeAdapter,
    private blockingCoordinator: BlockingCoordinator,
    /**
     * Source of civilization coin bonuses. Phase 5A has no bonus-granting
     * systems yet, so the default provider returns none. Buildings/technology/
     * milestones will provide their own bonuses here in later phases, keeping
     * the owning system as the single source of truth.
     */
    private coinBonusProvider: () => readonly CoinBonus[] = () => [],
    private onSessionEndedHook?: (event: SessionEndedHookEvent) => Promise<void> | void,
    private onSessionSyncHook?: (
      session: SessionSnapshot | null,
      reason?: string
    ) => Promise<void> | void
  ) {}

  /** Additive coin bonus factor applied exactly once per reward calculation. */
  private getCoinBonusFactor(): number {
    return getCoinBonusMultiplier(this.coinBonusProvider());
  }

  /**
   * Dispatch a session completion notification strictly once per session,
   * honoring persisted notificationSent, in-memory dedup, and UserSettings.notificationsEnabled.
   * Never throws into SessionCoordinator or MusicCoordinator.
   */
  private async notifySessionCompletedInternal(params: {
    session: SessionSnapshot;
    persistSnapshot: SessionSnapshot;
    titleKey: TranslationKey;
    messageKey: TranslationKey;
    messageParams: Record<string, string | number>;
  }): Promise<boolean> {
    const sessionId = params.session.id;
    if (
      params.session.notificationSent ||
      params.persistSnapshot.notificationSent ||
      this.dispatchedCompletionNotificationIds.has(sessionId)
    ) {
      return false;
    }

    try {
      const settings = await this.storage.getSettings().catch(() => null);
      if (settings && settings.notificationsEnabled === false) {
        return false;
      }

      const { title, message } = formatSessionNotificationContent({
        language: settings?.language,
        titleKey: params.titleKey,
        messageKey: params.messageKey,
        messageParams: params.messageParams,
      });
      await this.notifications.create(`fq_finish_${sessionId}`, {
        title,
        message,
      });

      this.dispatchedCompletionNotificationIds.add(sessionId);
      params.persistSnapshot.notificationSent = true;
      await this.storage.setCurrentSession({ ...params.persistSnapshot });
      return true;
    } catch (err) {
      console.warn('Failed to dispatch finish notification:', err);
      return false;
    }
  }

  /**
   * Dispatch a Pomodoro phase-transition notification (Short/Long Break or Break Ended).
   * Honors UserSettings.notificationsEnabled and isolates errors.
   */
  private async notifyPomodoroPhaseInternal(
    notificationId: string,
    titleKey: TranslationKey,
    messageKey: TranslationKey,
    messageParams?: Record<string, string | number>
  ): Promise<void> {
    try {
      const settings = await this.storage.getSettings().catch(() => null);
      if (settings && settings.notificationsEnabled === false) {
        return;
      }
      const { title, message } = formatSessionNotificationContent({
        language: settings?.language,
        titleKey,
        messageKey,
        messageParams,
      });
      await this.notifications.create(notificationId, {
        title,
        message,
      });
    } catch (err) {
      console.warn('Failed to dispatch pomodoro phase notification:', err);
    }
  }

  /**
   * Notify optional lifecycle observer (e.g. MusicCoordinator) that a session reached a terminal state.
   * Strictly error-isolated so audio/offscreen issues can never disrupt session settlement or notifications.
   */
  private async triggerSessionEndedHookInternal(
    session: SessionSnapshot,
    status: 'COMPLETED' | 'ABANDONED' | 'INTERRUPTED'
  ): Promise<void> {
    if (!this.onSessionEndedHook) {
      return;
    }
    try {
      await this.onSessionEndedHook({
        sessionId: session.id,
        status,
        mode: session.mode,
      });
    } catch (err) {
      console.warn('[SessionCoordinator] Isolated onSessionEndedHook error:', err);
    }
  }

  /**
   * Notify optional observer (e.g. MusicCoordinator.sync) of active session/phase changes.
   * Strictly error-isolated so audio/offscreen errors can never disrupt timer transitions.
   */
  private async triggerSessionSyncHookInternal(
    session: SessionSnapshot | null,
    reason?: string
  ): Promise<void> {
    if (!this.onSessionSyncHook) {
      return;
    }
    try {
      await this.onSessionSyncHook(session, reason);
    } catch (err) {
      console.warn('[SessionCoordinator] Isolated onSessionSyncHook error:', err);
    }
  }

  /**
   * Ensure Service Worker state is rehydrated upon receiving any business event (Alarm, Message, Tab update).
   */
  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    await this.handleLifecycleEvent({ reason: 'SERVICE_WORKER_WAKE' });
  }

  private getTodayDateKey(nowMs?: number): string {
    return getLocalDateKey(nowMs);
  }

  private buildQuestOutcomeDeltaSafe(
    session: SessionSnapshot,
    completedDateKey: string
  ): QuestOutcomeDelta | undefined {
    try {
      return toQuestOutcomeDelta(session, completedDateKey) ?? undefined;
    } catch (err) {
      console.warn('[SessionCoordinator] Isolated quest outcome delta error:', err);
      return undefined;
    }
  }

  /**
   * Internal helper to record daily stats directly within an active mutex transaction.
   */
  private async recordDailyFocusInternal(delta: {
    focusMinutes: number;
    isCompleted: boolean;
    isAbandoned: boolean;
    coins: number;
    xp: number;
  }): Promise<void> {
    const todayKey = this.getTodayDateKey();
    const allStats = await this.storage.getDailyStats();
    const existing = allStats[todayKey] ?? {
      date: todayKey,
      totalFocusMinutes: 0,
      completedSessions: 0,
      abandonedSessions: 0,
      coinsEarned: 0,
      xpEarned: 0,
    };

    allStats[todayKey] = {
      date: todayKey,
      totalFocusMinutes: Math.max(0, existing.totalFocusMinutes + delta.focusMinutes),
      completedSessions: existing.completedSessions + (delta.isCompleted ? 1 : 0),
      abandonedSessions: existing.abandonedSessions + (delta.isAbandoned ? 1 : 0),
      coinsEarned: Math.max(0, existing.coinsEarned + delta.coins),
      xpEarned: Math.max(0, existing.xpEarned + delta.xp),
    };

    await this.storage.setDailyStats(allStats);
  }

  /**
   * Internal helper to update economy directly within an active mutex transaction.
   */
  private async updateEconomyInternal(coinsDelta: number, xpDelta: number): Promise<void> {
    if (coinsDelta === 0 && xpDelta === 0) return;
    const current = await this.storage.getEconomy();
    await this.storage.setEconomy({
      ...current,
      focusCoins: Math.max(0, current.focusCoins + coinsDelta),
      totalXP: Math.max(0, current.totalXP + xpDelta),
    });
  }

  /**
   * Get the complete operational state for UI synchronization.
   */
  async getFullState(): Promise<FullSessionStateResponse> {
    let session = await this.storage.getCurrentSession();

    // Auto-reconcile elapsed Pomodoro stage if time reached zero
    if (
      session &&
      session.status === 'RUNNING' &&
      (session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH') &&
      session.pomodoroState &&
      session.pomodoroConfig
    ) {
      const pState = session.pomodoroState;
      const pConfig = session.pomodoroConfig;
      const stageMins =
        pState.currentPhase === 'FOCUS'
          ? (pConfig.focusIntervalDurationMinutes ?? pConfig.focusDurationMinutes ?? 25)
          : (pState.phaseTargetDurationMinutes || (pState.currentPhase === 'LONG_BREAK' ? 15 : 5));
      const targetFinishTime =
        pState.phaseStartedAt + stageMins * 60 * 1000 + pState.phaseTotalPauseMs;

      if (Date.now() >= targetFinishTime) {
        const expectedAlarmName = buildPomodoroStageAlarmName(
          session.id,
          pState.currentInterval,
          pState.currentPhase,
          pState.phaseStartedAt
        );
        try {
          const advanced = await this.advancePomodoroStage(expectedAlarmName);
          if (advanced) {
            session = advanced;
          }
        } catch (err) {
          console.warn('[POMODORO] Auto-reconcile on getFullState error:', err);
        }
      }
    }

    let activeProfile = null;
    try {
      activeProfile = await this.profileManager.getActiveProfile();
    } catch {
      // Ignore if no profiles
    }
    const economy = await this.storage.getEconomy();
    const stats = await this.storage.getDailyStats();
    const settings = await this.storage.getSettings();
    const todayStats = stats[this.getTodayDateKey()] ?? null;
    const isBlockingActive = isWebsiteBlockingActive(session);
    const lifetimeFocusMinutes = calculateLifetimeFocusMinutes(stats);

    return {
      currentSession: session,
      activeProfile,
      economy,
      todayStats,
      isBlockingActive,
      lifetimeFocusMinutes,
      settings,
    };
  }

  /**
   * Start a new focus session (Countdown, Stopwatch, Pomodoro Countdown, or Pomodoro Stopwatch).
   */
  async startSession(
    mode: SessionMode,
    targetMinutes: number,
    profileId: string,
    pomodoroConfig?: PomodoroConfig
  ): Promise<SessionSnapshot> {
    const newSession = await this.storage.runExclusive(async () => {
      const current = await this.storage.getCurrentSession();
      if (current && TimerStateMachine.isActive(current.status)) {
        throw new AppError(
          'SESSION_ALREADY_ACTIVE',
          `Cannot start session: a session is already in status '${current.status}'.`,
          { status: current.status }
        );
      }

      const profiles = await this.storage.getProfiles();
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile) {
        throw new AppError(
          'SESSION_PROFILE_NOT_FOUND',
          `Cannot start session: profile with ID '${profileId}' not found.`,
          { profileId }
        );
      }

      await this.storage.setActiveProfileId(profileId);

      const now = Date.now();
      const isPomodoro = mode === 'POMODORO_COUNTDOWN' || mode === 'POMODORO_STOPWATCH';
      const validatedPomoConfig = isPomodoro
        ? TimeCalculator.validatePomodoroConfig(pomodoroConfig).config
        : undefined;

      let lockedMultiplier = 1.0;
      let initialCoins = 0;
      let initialXp = 0;
      if (mode === 'COUNTDOWN') {
        lockedMultiplier = MultiplierRules.getCountdownMultiplier(targetMinutes);
      } else if (mode === 'POMODORO_COUNTDOWN' && validatedPomoConfig) {
        const intervalDuration =
          validatedPomoConfig.focusIntervalDurationMinutes ?? validatedPomoConfig.focusDurationMinutes;
        const intervalsPerCycle =
          validatedPomoConfig.focusIntervalsPerCycle ?? validatedPomoConfig.targetFocusSessions;
        const cycles = validatedPomoConfig.numberOfCycles ?? 3;
        const totalQuestMinutes = intervalDuration * intervalsPerCycle * cycles;
        lockedMultiplier = MultiplierRules.getCountdownMultiplier(totalQuestMinutes);
        initialCoins = totalQuestMinutes * 1.5 * lockedMultiplier * this.getCoinBonusFactor();
        initialXp = totalQuestMinutes * 5.0 * lockedMultiplier;
      }

      const effectiveTargetMinutes =
        mode === 'COUNTDOWN'
          ? targetMinutes
          : isPomodoro && validatedPomoConfig
          ? validatedPomoConfig.focusIntervalDurationMinutes ?? validatedPomoConfig.focusDurationMinutes
          : 0;

      const created: SessionSnapshot = {
        id: `sess_${now}_${Math.random().toString(36).slice(2, 7)}`,
        mode,
        profileId,
        status: 'RUNNING',
        targetMinutes: effectiveTargetMinutes,
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
        notificationSent: false,
        pauseExpiresAt: null,
        pomodoroConfig: validatedPomoConfig,
        pomodoroState:
          isPomodoro && validatedPomoConfig
            ? {
                currentPhase: 'FOCUS',
                currentInterval: 1,
                currentCycle: 1,
                completedFocusCount: 0,
                phaseStartedAt: now,
                phaseTargetDurationMinutes:
                  validatedPomoConfig.focusIntervalDurationMinutes ?? validatedPomoConfig.focusDurationMinutes,
                phaseTotalPauseMs: 0,
                totalCompletedFocusMinutes: 0,
                accumulatedCoins: initialCoins,
                accumulatedXp: initialXp,
              }
            : undefined,
      };

      await this.storage.setCurrentSession(created);
      await this.storage.setSessionLifecycleMarker(created.id);

      // Schedule alarms and set badge
      if (mode === 'COUNTDOWN') {
        const finishTime = now + targetMinutes * 60 * 1000;
        await this.alarms.create(ALARM_NAMES.COUNTDOWN_FINISH, { when: finishTime });
        await this.badge.setBadgeText(`${targetMinutes}m`);
        await this.badge.setBadgeBackgroundColor('#10B981'); // Emerald green
      } else if (isPomodoro && validatedPomoConfig) {
        const intervalDuration =
          validatedPomoConfig.focusIntervalDurationMinutes ?? validatedPomoConfig.focusDurationMinutes;
        const finishTime = now + intervalDuration * 60 * 1000;
        const alarmName = buildPomodoroStageAlarmName(created.id, 1, 'FOCUS', now);
        await this.alarms.create(alarmName, { when: finishTime });
        console.log(`[POMODORO] Stage alarm scheduled: name=${alarmName}, when=${finishTime}`);

        await this.badge.setBadgeText(`${intervalDuration}m`);
        await this.badge.setBadgeBackgroundColor('#10B981'); // Emerald green
      } else {
        await this.badge.setBadgeText('RUN');
        await this.badge.setBadgeBackgroundColor('#3B82F6'); // Blue
      }

      // Schedule periodic heartbeat alarm (1 minute) for lifecycle tracking and checkpointing
      await this.alarms.create(ALARM_NAMES.HEARTBEAT, { periodInMinutes: 1 });

      // Activate declarativeNetRequest blocking and redirect any already-open blocked tabs
      await this.blockingCoordinator.syncBlocking(isWebsiteBlockingActive(created), profile);

      this.lastProcessedStartupSessionId = null;
      return created;
    });

    await this.triggerSessionSyncHookInternal(newSession, 'STARTED');
    return newSession;
  }

  /**
   * Pause the active session.
   */
  async pauseSession(): Promise<SessionSnapshot> {
    const updated = await this.storage.runExclusive(async () => {
      const session = await this.storage.getCurrentSession();
      if (!session) {
        throw new AppError('NO_ACTIVE_SESSION_PAUSE', 'No active session to pause.');
      }

      const transition = TimerStateMachine.transition(session.status, 'PAUSE', {
        pauseCount: session.pauseCount,
      });

      if (!transition.success) {
        throw new AppError('INVALID_TIMER_TRANSITION', transition.error ?? 'Invalid timer transition');
      }

      const now = Date.now();
      const pauseExpiresAt = now + MAX_PAUSE_DURATION_MS;

      // Checkpoint any elapsed focus time up to the exact moment of pausing
      let newAccumulated = session.accumulatedFocusMs ?? 0;
      const isBreak =
        session.pomodoroState &&
        (session.pomodoroState.currentPhase === 'SHORT_BREAK' ||
          session.pomodoroState.currentPhase === 'LONG_BREAK');
      if (!isBreak) {
        const lastCheckpoint =
          session.lastCheckpointAt ??
          (session.pomodoroState?.currentPhase === 'FOCUS'
            ? session.pomodoroState.phaseStartedAt
            : session.startedAt);
        const deltaMs = Math.max(0, now - lastCheckpoint);
        newAccumulated += deltaMs;
      }

      const nextSession: SessionSnapshot = {
        ...session,
        status: 'PAUSED',
        currentPauseStartedAt: now,
        pauseExpiresAt,
        pauseCount: session.pauseCount + 1,
        lastHeartbeatAt: now,
        lastCheckpointAt: now,
        accumulatedFocusMs: newAccumulated,
      };

      await this.storage.setCurrentSession(nextSession);

      // Set dynamic Auto-resume alarm after 5 minutes
      const dynamicAlarmName = buildPauseAlarmName(session.id, now);
      await this.alarms.create(dynamicAlarmName, { when: pauseExpiresAt });

      // If Countdown or Pomodoro (Countdown or Stopwatch), temporarily clear the stage alarm while paused
      if (session.mode === 'COUNTDOWN') {
        await this.alarms.clear(ALARM_NAMES.COUNTDOWN_FINISH);
      } else if (
        session.mode === 'POMODORO_COUNTDOWN' ||
        session.mode === 'POMODORO_STOPWATCH'
      ) {
        if (session.pomodoroState) {
          const alarmName = buildPomodoroStageAlarmName(
            session.id,
            session.pomodoroState.currentInterval,
            session.pomodoroState.currentPhase,
            session.pomodoroState.phaseStartedAt
          );
          await this.alarms.clear(alarmName);
        }
      }

      // Website blocking is CLEARED immediately during pause, allowing full website access
      await this.blockingCoordinator.syncBlocking(false, null);

      await this.badge.setBadgeText('PAUSE');
      await this.badge.setBadgeBackgroundColor('#F59E0B'); // Amber/Orange

      return nextSession;
    });

    await this.triggerSessionSyncHookInternal(updated, 'PAUSED');
    return updated;
  }

  /**
   * Resume a paused session (manual user click or auto-resume).
   */
  async resumeSession(isAutoResume: boolean = false, fromAlarmName?: string): Promise<SessionSnapshot> {
    const result = await this.storage.runExclusive(async () => {
      const session = await this.storage.getCurrentSession();
      if (!session) {
        throw new AppError('NO_SESSION_RESUME', 'No session to resume.');
      }

      // Stale alarm protection: if triggered by alarm, verify alarm matches this session's active pause
      if (fromAlarmName) {
        const parsed = parsePauseAlarmName(fromAlarmName);
        if (parsed) {
          if (parsed.sessionId !== session.id || parsed.pauseStartedAt !== session.currentPauseStartedAt) {
            console.warn(`Ignoring stale pause auto-resume alarm '${fromAlarmName}' for session '${session.id}'`);
            return { session, didTransition: false };
          }
        }
      }

      if (session.status !== 'PAUSED') {
        return { session, didTransition: false };
      }

      const event = isAutoResume ? 'AUTO_RESUME' : 'RESUME';
      const transition = TimerStateMachine.transition(session.status, event);

      if (!transition.success) {
        throw new AppError('INVALID_TIMER_TRANSITION', transition.error ?? 'Invalid timer transition');
      }

      const now = Date.now();
      const pauseStart = session.currentPauseStartedAt ?? now;
      const pauseRecord = TimeCalculator.finalizePause(pauseStart, now);

      const totalPauseMs = session.totalPauseMs + pauseRecord.durationMs;
      const pauseHistory = [...session.pauseHistory, pauseRecord];

      let updatedPomodoroState = session.pomodoroState;
      if (session.pomodoroState) {
        updatedPomodoroState = {
          ...session.pomodoroState,
          phaseTotalPauseMs: session.pomodoroState.phaseTotalPauseMs + pauseRecord.durationMs,
        };
      }

      const updated: SessionSnapshot = {
        ...session,
        status: 'RUNNING',
        currentPauseStartedAt: null,
        pauseExpiresAt: null,
        totalPauseMs,
        pauseHistory,
        lastHeartbeatAt: now,
        lastCheckpointAt: now,
        pomodoroState: updatedPomodoroState,
      };

      await this.storage.setCurrentSession(updated);

      // Ensure periodic heartbeat alarm is running
      await this.ensureHeartbeatAlarm();

      // Clear dynamic pause alarm and default pause alarm
      if (session.currentPauseStartedAt) {
        await this.alarms.clear(buildPauseAlarmName(session.id, session.currentPauseStartedAt));
      }
      await this.alarms.clear(ALARM_NAMES.PAUSE_AUTO_RESUME);

      // Restore website blocking rules only if the resumed session may block
      // (FOCUS, or non-Pomodoro modes). Breaks remain fully unblocked.
      let activeProfile = null;
      try {
        activeProfile = await this.profileManager.getActiveProfile();
      } catch {
        // ignore
      }

      await this.blockingCoordinator.syncBlocking(isWebsiteBlockingActive(updated), activeProfile);

      // If Countdown, re-calculate and schedule remaining finish alarm
      if (session.mode === 'COUNTDOWN') {
        const remainingTargetMs = session.targetMinutes * 60 * 1000;
        const newFinishTime = session.startedAt + remainingTargetMs + totalPauseMs;
        await this.alarms.create(ALARM_NAMES.COUNTDOWN_FINISH, { when: newFinishTime });

        const elapsed = TimeCalculator.calculateElapsedTime({
          startedAt: session.startedAt,
          currentTime: now,
          status: 'RUNNING',
          currentPauseStartedAt: null,
          totalCompletedPauseMs: totalPauseMs,
        });
        const remainingMinutes = Math.max(0, session.targetMinutes - elapsed.actualFocusMinutes);
        await this.badge.setBadgeText(`${remainingMinutes}m`);
        await this.badge.setBadgeBackgroundColor('#10B981');
      } else if (
        session.mode === 'POMODORO_COUNTDOWN' ||
        session.mode === 'POMODORO_STOPWATCH'
      ) {
        if (session.pomodoroState && session.pomodoroConfig) {
          const phaseTarget = session.pomodoroState.phaseTargetDurationMinutes;
          if (phaseTarget > 0) {
            const phaseTotalPause = updatedPomodoroState?.phaseTotalPauseMs ?? 0;
            const newFinishTime =
              session.pomodoroState.phaseStartedAt + phaseTarget * 60 * 1000 + phaseTotalPause;
            const alarmName = buildPomodoroStageAlarmName(
              session.id,
              session.pomodoroState.currentInterval,
              session.pomodoroState.currentPhase,
              session.pomodoroState.phaseStartedAt
            );
            await this.alarms.create(alarmName, { when: newFinishTime });
          }

          if (session.pomodoroState.currentPhase === 'FOCUS') {
            const focusMinutes =
              session.pomodoroConfig.focusIntervalDurationMinutes ?? session.pomodoroConfig.focusDurationMinutes;
            await this.badge.setBadgeText(`${focusMinutes}m`);
            await this.badge.setBadgeBackgroundColor('#10B981');
          } else {
            await this.badge.setBadgeText('REST');
            await this.badge.setBadgeBackgroundColor('#06B6D4');
          }
        }
      } else {
        await this.badge.setBadgeText('RUN');
        await this.badge.setBadgeBackgroundColor('#3B82F6');
      }

      return { session: updated, didTransition: true };
    });

    if (result.didTransition) {
      await this.triggerSessionSyncHookInternal(result.session, 'RESUMED');
    }
    return result.session;
  }

  /**
   * Give up or end a focus session (Countdown, Pomodoro Countdown, or Pomodoro Stopwatch).
   * For Countdown: Awards 0 Coins/XP, preserves actual elapsed focus minutes into daily stats.
   * For Pomodoro: Preserves all previously completed intervals and adds current elapsed focus minutes.
   */
  async giveUpCountdown(): Promise<SessionSnapshot> {
    const updated = await this.storage.runExclusive(async () => {
      const session = await this.storage.getCurrentSession();
      if (!session) {
        throw new AppError('NO_SESSION_GIVE_UP', 'No session to give up.');
      }

      if (
        session.mode !== 'COUNTDOWN' &&
        session.mode !== 'POMODORO_COUNTDOWN' &&
        session.mode !== 'POMODORO_STOPWATCH'
      ) {
        throw new AppError(
          'STOPWATCH_GIVE_UP_DISALLOWED',
          "Give up is not applicable to standard Stopwatch sessions. Use 'FINISH'."
        );
      }

      const transition = TimerStateMachine.transition(session.status, 'GIVE_UP');
      if (!transition.success) {
        throw new AppError('INVALID_TIMER_TRANSITION', transition.error ?? 'Invalid timer transition');
      }

      const now = Date.now();
      // If was paused, finalize the pause first
      let totalPauseMs = session.totalPauseMs;
      let currentPauseDurationMs = 0;
      const pauseHistory = [...session.pauseHistory];
      if (session.status === 'PAUSED' && session.currentPauseStartedAt) {
        const pRecord = TimeCalculator.finalizePause(session.currentPauseStartedAt, now);
        totalPauseMs += pRecord.durationMs;
        currentPauseDurationMs = pRecord.durationMs;
        pauseHistory.push(pRecord);
      }

      const isPomodoro =
        session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH';

      let focusMinutesToRecord = 0;
      if (isPomodoro && session.pomodoroState) {
        // Record all completed focus minutes plus any partial minutes from an in-progress FOCUS phase
        focusMinutesToRecord = session.pomodoroState.totalCompletedFocusMinutes;
        const phasePause = session.pomodoroState.phaseTotalPauseMs + currentPauseDurationMs;
        if (session.pomodoroState.currentPhase === 'FOCUS') {
          const rawFocusMs = Math.max(
            0,
            now - session.pomodoroState.phaseStartedAt - phasePause
          );
          focusMinutesToRecord += Math.floor(rawFocusMs / 60000);
        }
      } else {
        const elapsed = TimeCalculator.calculateElapsedTime({
          startedAt: session.startedAt,
          currentTime: now,
          status: 'RUNNING',
          currentPauseStartedAt: null,
          totalCompletedPauseMs: totalPauseMs,
        });
        focusMinutesToRecord = elapsed.actualFocusMinutes;
      }

      const nextSession: SessionSnapshot = {
        ...session,
        status: 'ABANDONED',
        currentPauseStartedAt: null,
        totalPauseMs,
        pauseHistory,
        completedAt: now,
        rewardProcessed: true,
      };

      await this.storage.commitSessionOutcomeInternal({
        session: nextSession,
        dailyStatDelta:
          focusMinutesToRecord > 0
            ? {
                date: this.getTodayDateKey(),
                focusMinutes: focusMinutesToRecord,
                isCompleted: false,
                isAbandoned: true,
                coins: 0,
                xp: 0,
              }
            : undefined,
      });

      // Cleanup Chrome infrastructure
      await this.alarms.clearAll();
      await this.blockingCoordinator.syncBlocking(false, null);
      await this.badge.clearBadge();
      await this.storage.clearSessionLifecycleMarker();

      return nextSession;
    });

    await this.triggerSessionEndedHookInternal(updated, 'ABANDONED');
    return updated;
  }

  /**
   * Finish a Stopwatch session.
   * Applies threshold (>= 5 mins), calculates multiplier tier, awards rewards.
   */
  async finishStopwatch(): Promise<{ session: SessionSnapshot; coinsEarned: number; xpEarned: number }> {
    const result = await this.storage.runExclusive(async () => {
      const session = await this.storage.getCurrentSession();
      if (!session) {
        throw new AppError('NO_ACTIVE_STOPWATCH_FINISH', 'No active stopwatch session to finish.');
      }

      if (session.mode !== 'STOPWATCH' && session.mode !== 'POMODORO_STOPWATCH') {
        throw new AppError(
          'COUNTDOWN_FINISH_STOPWATCH_DISALLOWED',
          "Cannot finish countdown with 'finishStopwatch'. Countdown finishes when target is met."
        );
      }

      // Idempotency guard: if already completed or processed, return gracefully without duplicate rewards
      if (session.rewardProcessed || session.status === 'COMPLETED') {
        return {
          session,
          coinsEarned: 0,
          xpEarned: 0,
          didTransition: false,
        };
      }

      const transition = TimerStateMachine.transition(session.status, 'FINISH');
      if (!transition.success) {
        throw new AppError('INVALID_TIMER_TRANSITION', transition.error ?? 'Invalid timer transition');
      }

      const now = Date.now();
      let totalPauseMs = session.totalPauseMs;
      let currentPauseDurationMs = 0;
      const pauseHistory = [...session.pauseHistory];
      if (session.status === 'PAUSED' && session.currentPauseStartedAt) {
        const pRecord = TimeCalculator.finalizePause(session.currentPauseStartedAt, now);
        totalPauseMs += pRecord.durationMs;
        currentPauseDurationMs = pRecord.durationMs;
        pauseHistory.push(pRecord);
      }

      if (session.mode === 'POMODORO_STOPWATCH') {
        let pState = session.pomodoroState;
        const pConfig = session.pomodoroConfig;
        const intervalDuration =
          pConfig?.focusIntervalDurationMinutes ?? pConfig?.focusDurationMinutes ?? 25;

        // Account for any active pause duration finalized upon finish
        const phaseTotalPauseMs = (pState?.phaseTotalPauseMs ?? 0) + currentPauseDurationMs;
        if (pState && currentPauseDurationMs > 0) {
          pState = {
            ...pState,
            phaseTotalPauseMs,
          };
        }

        let intervalCompletedAtFinish = false;
        // If currently in FOCUS and this interval reached 100% completion before manual finish
        if (pState && pState.currentPhase === 'FOCUS') {
          const targetFinishTime =
            pState.phaseStartedAt + intervalDuration * 60 * 1000 + phaseTotalPauseMs;
          if (now >= targetFinishTime) {
            intervalCompletedAtFinish = true;
            // Focus interval completed 100% - count it before final settlement
            const newCompleted = pState.completedFocusCount + 1;
            const newFocusMins = newCompleted * intervalDuration;
            const previewReward = this.rewardEngine.calculatePomodoroCumulativeReward({
              mode: 'POMODORO_STOPWATCH',
              totalCompletedFocusMinutes: newFocusMins,
              coinBonuses: this.coinBonusProvider(),
            });
            pState = {
              ...pState,
              completedFocusCount: newCompleted,
              totalCompletedFocusMinutes: newFocusMins,
              accumulatedCoins: previewReward.totalCoins,
              accumulatedXp: previewReward.totalXp,
            };
          }
        }

        const completedIntervals = pState?.completedFocusCount ?? 0;
        const rewardFocusMinutes = completedIntervals * intervalDuration;

        // Calculate actual focus minutes for daily stats:
        // Completed intervals + any partial focus minutes from an in-progress FOCUS interval
        let actualFocusMinutes = rewardFocusMinutes;
        if (pState && pState.currentPhase === 'FOCUS' && !intervalCompletedAtFinish) {
          const rawCurrentFocusMs = Math.max(0, now - pState.phaseStartedAt - phaseTotalPauseMs);
          actualFocusMinutes += Math.floor(rawCurrentFocusMs / 60000);
        }

        let finalMultiplier = 1.0;
        let finalCoins = 0;
        let finalXp = 0;

        if (rewardFocusMinutes > 0) {
          const settlement = this.rewardEngine.calculatePomodoroCumulativeReward({
            mode: 'POMODORO_STOPWATCH',
            totalCompletedFocusMinutes: rewardFocusMinutes,
            coinBonuses: this.coinBonusProvider(),
          });
          finalMultiplier = settlement.multiplier;
          finalCoins = settlement.totalCoins;
          finalXp = settlement.totalXp;
        }

        console.log(
          `[POMODORO] Manual Finish settlement: completedIntervals=${completedIntervals}, rewardMinutes=${rewardFocusMinutes}, actualFocusMinutes=${actualFocusMinutes}, coins=${finalCoins}, xp=${finalXp}`
        );

        const updated: SessionSnapshot = {
          ...session,
          status: 'COMPLETED',
          currentPauseStartedAt: null,
          pauseExpiresAt: null,
          totalPauseMs,
          pauseHistory,
          completedAt: now,
          rewardProcessed: true,
          lockedMultiplier: finalMultiplier,
          pomodoroState: pState
            ? {
                ...pState,
                totalCompletedFocusMinutes: rewardFocusMinutes,
                accumulatedCoins: finalCoins,
                accumulatedXp: finalXp,
              }
            : undefined,
        };

        const completedDateKey = this.getTodayDateKey(now);
        const questOutcomeDelta = this.buildQuestOutcomeDeltaSafe(updated, completedDateKey);

        // Atomically commit session, economy, daily stats, and quests in one storage write
        await this.storage.commitSessionOutcomeInternal({
          session: updated,
          economyDelta: {
            coins: finalCoins,
            xp: finalXp,
          },
          dailyStatDelta:
            actualFocusMinutes > 0
              ? {
                  date: completedDateKey,
                  focusMinutes: actualFocusMinutes,
                  isCompleted: completedIntervals > 0,
                  isAbandoned: false,
                  coins: finalCoins,
                  xp: finalXp,
                }
              : undefined,
          questOutcomeDelta,
        });

        await this.alarms.clearAll();
        await this.blockingCoordinator.syncBlocking(false, null);
        await this.badge.clearBadge();
        await this.storage.clearSessionLifecycleMarker();

        if (completedIntervals > 0) {
          await this.notifySessionCompletedInternal({
            session,
            persistSnapshot: updated,
            titleKey: 'notif.missionCompleteTitle',
            messageKey: 'notif.pomoStopwatchCompleteMsg',
            messageParams: {
              count: completedIntervals,
              minutes: actualFocusMinutes > 0 ? actualFocusMinutes : rewardFocusMinutes,
              coins: finalCoins,
              xp: finalXp,
            },
          });
        }

        return {
          session: updated,
          coinsEarned: finalCoins,
          xpEarned: finalXp,
          didTransition: true,
        };
      }

      const elapsed = TimeCalculator.calculateElapsedTime({
        startedAt: session.startedAt,
        currentTime: now,
        status: 'RUNNING',
        currentPauseStartedAt: null,
        totalCompletedPauseMs: totalPauseMs,
      });

      const actualFocusMinutes = Math.max(
        elapsed.actualFocusMinutes,
        session.accumulatedFocusMs !== undefined
          ? Math.floor(
              (session.accumulatedFocusMs +
                Math.max(0, now - (session.lastCheckpointAt ?? session.startedAt))) /
                60000
            )
          : 0
      );

      const rewardResult = this.rewardEngine.calculateReward({
        mode: 'STOPWATCH',
        status: 'COMPLETED',
        targetMinutes: 0,
        actualFocusMinutes,
        coinBonuses: this.coinBonusProvider(),
      });

      const updated: SessionSnapshot = {
        ...session,
        status: 'COMPLETED',
        currentPauseStartedAt: null,
        totalPauseMs,
        pauseHistory,
        completedAt: now,
        rewardProcessed: true,
        lockedMultiplier: rewardResult.multiplier,
      };

      const completedDateKey = this.getTodayDateKey(now);
      const questOutcomeDelta = this.buildQuestOutcomeDeltaSafe(updated, completedDateKey);

      // Atomically commit session, economy, daily stats, and quests in one storage write
      await this.storage.commitSessionOutcomeInternal({
        session: updated,
        economyDelta: {
          coins: rewardResult.coinsEarned,
          xp: rewardResult.xpEarned,
        },
        dailyStatDelta:
          actualFocusMinutes > 0
            ? {
                date: completedDateKey,
                focusMinutes: actualFocusMinutes,
                isCompleted: rewardResult.isThresholdMet,
                isAbandoned: !rewardResult.isThresholdMet,
                coins: rewardResult.coinsEarned,
                xp: rewardResult.xpEarned,
              }
            : undefined,
        questOutcomeDelta,
      });

      await this.alarms.clearAll();
      await this.blockingCoordinator.syncBlocking(false, null);
      await this.badge.clearBadge();
      await this.storage.clearSessionLifecycleMarker();

      if (rewardResult.isThresholdMet) {
        await this.notifySessionCompletedInternal({
          session,
          persistSnapshot: updated,
          titleKey: 'notif.missionCompleteTitle',
          messageKey: 'notif.stopwatchCompleteMsg',
          messageParams: {
            minutes: actualFocusMinutes,
            coins: rewardResult.coinsEarned,
            xp: rewardResult.xpEarned,
          },
        });
      }

      return {
        session: updated,
        coinsEarned: rewardResult.coinsEarned,
        xpEarned: rewardResult.xpEarned,
        didTransition: true,
      };
    });

    if (result.didTransition) {
      await this.triggerSessionEndedHookInternal(result.session, 'COMPLETED');
    }

    return {
      session: result.session,
      coinsEarned: result.coinsEarned,
      xpEarned: result.xpEarned,
    };
  }

  /**
   * Complete a Countdown session when target duration is reached.
   * Can be triggered by Countdown Alarm or background recovery.
   * Guaranteed idempotent.
   */
  async completeCountdown(): Promise<SessionSnapshot | null> {
    const result = await this.storage.runExclusive(async () => {
      const session = await this.storage.getCurrentSession();
      if (!session || session.mode !== 'COUNTDOWN') {
        return { session: null, didTransition: false };
      }

      // Idempotency check: already processed
      if (session.rewardProcessed || session.status === 'COMPLETED') {
        return { session, didTransition: false };
      }

      const now = Date.now();
      const elapsed = TimeCalculator.calculateElapsedTime({
        startedAt: session.startedAt,
        currentTime: now,
        status: 'RUNNING',
        currentPauseStartedAt: null,
        totalCompletedPauseMs: session.totalPauseMs,
      });

      // Calculate 100% completed rewards
      const rewardResult = this.rewardEngine.calculateReward({
        mode: 'COUNTDOWN',
        status: 'COMPLETED',
        targetMinutes: session.targetMinutes,
        actualFocusMinutes: elapsed.actualFocusMinutes,
        lockedMultiplier: session.lockedMultiplier,
        coinBonuses: this.coinBonusProvider(),
      });

      const updated: SessionSnapshot = {
        ...session,
        status: 'COMPLETED',
        currentPauseStartedAt: null,
        completedAt: now,
        rewardProcessed: true,
      };

      const completedDateKey = this.getTodayDateKey(now);
      const questOutcomeDelta = this.buildQuestOutcomeDeltaSafe(updated, completedDateKey);

      // Atomically commit session, economy, daily stats, and quests in one storage write
      await this.storage.commitSessionOutcomeInternal({
        session: updated,
        economyDelta: {
          coins: rewardResult.coinsEarned,
          xp: rewardResult.xpEarned,
        },
        dailyStatDelta: {
          date: completedDateKey,
          focusMinutes: session.targetMinutes,
          isCompleted: true,
          isAbandoned: false,
          coins: rewardResult.coinsEarned,
          xp: rewardResult.xpEarned,
        },
        questOutcomeDelta,
      });

      // Send Chrome Notification strictly once per session (error-isolated)
      await this.notifySessionCompletedInternal({
        session,
        persistSnapshot: updated,
        titleKey: 'notif.missionCompleteTitle',
        messageKey: 'notif.countdownCompleteMsg',
        messageParams: {
          minutes: session.targetMinutes,
          coins: rewardResult.coinsEarned,
          xp: rewardResult.xpEarned,
        },
      });

      await this.alarms.clearAll();
      await this.blockingCoordinator.syncBlocking(false, null);
      await this.badge.clearBadge();
      await this.storage.clearSessionLifecycleMarker();

      return { session: updated, didTransition: true };
    });

    if (result.didTransition && result.session) {
      await this.triggerSessionEndedHookInternal(result.session, 'COMPLETED');
    }

    return result.session;
  }

  /**
   * Single source of truth for the real DNR state per Pomodoro phase.
   * Only an active FOCUS phase may keep blocking rules installed; every break
   * phase (short or long) must remove them from Chrome, not just in the UI.
   */
  private async applyBlockingForPhase(
    phase: PomodoroPhase,
    activeProfile: FocusProfile | null
  ): Promise<void> {
    await this.blockingCoordinator.syncBlocking(phase === 'FOCUS', activeProfile);
  }

  /**
   * Advance to the next Pomodoro stage (Focus -> Short/Long Break -> Focus).
   * Safe against stale alarms, concurrent race conditions, and Service Worker restarts.
   *
   * `expectedPhase` is an atomic guard for callers that read the phase before
   * acquiring the storage mutex (e.g. MessageHandler). If the background alarm
   * already advanced the session in the meantime, the request becomes a no-op.
   */
  async advancePomodoroStage(
    fromAlarmName?: string,
    expectedPhase?: PomodoroPhase
  ): Promise<SessionSnapshot | null> {
    const result = await this.storage.runExclusive(async () => {
      const session = await this.storage.getCurrentSession();
      if (
        !session ||
        (session.mode !== 'POMODORO_COUNTDOWN' && session.mode !== 'POMODORO_STOPWATCH') ||
        !session.pomodoroState ||
        !session.pomodoroConfig
      ) {
        return { session: null as SessionSnapshot | null, hookType: 'none' as const };
      }

      const pState = session.pomodoroState;
      const pConfig = session.pomodoroConfig;

      // Atomic stale-request guard (closes the TOCTOU window between the
      // MessageHandler phase check and this mutex-protected transition).
      if (expectedPhase && pState.currentPhase !== expectedPhase) {
        console.log(
          `[POMODORO] Transition ignored: reason=stale-phase-request, expectedPhase=${expectedPhase}, ` +
            `actualPhase=${pState.currentPhase}, session=${session.id}, interval=${pState.currentInterval}, ` +
            `cycle=${pState.currentCycle ?? 1}, phaseStartedAt=${pState.phaseStartedAt}`
        );
        return { session, hookType: 'none' as const };
      }

      // Construct the exact expected alarm name for the active session, interval, phase, and start timestamp
      const expectedAlarmName = buildPomodoroStageAlarmName(
        session.id,
        pState.currentInterval,
        pState.currentPhase,
        pState.phaseStartedAt
      );

      // Stale or forged alarm protection.
      if (fromAlarmName) {
        const parsed = parsePomodoroStageAlarmName(fromAlarmName);

        if (!parsed || parsed.sessionId !== session.id) {
          console.warn(
            `[POMODORO] Alarm validation rejected: reason=forged-identity, received='${fromAlarmName}', ` +
              `expected='${expectedAlarmName}', session=${session.id}`
          );
          if (session.mode === 'POMODORO_STOPWATCH' && pState.currentPhase === 'FOCUS') {
            throw new AppError(
              'INVALID_POMODORO_ALARM',
              `Invalid or forged alarm name for Pomodoro Stopwatch: '${fromAlarmName}'.`,
              { alarmName: fromAlarmName }
            );
          }
          return { session, hookType: 'none' as const };
        }

        if (fromAlarmName === expectedAlarmName) {
          console.log(`[POMODORO] Alarm validation passed: name=${fromAlarmName}`);
        } else if (parsed.phaseStartedAt < pState.phaseStartedAt) {
          console.log(
            `[POMODORO] Alarm ignored: reason=stale-phase-alarm, received='${fromAlarmName}', ` +
              `currentPhase=${pState.currentPhase}, currentPhaseStartedAt=${pState.phaseStartedAt}, ` +
              `alarmPhaseStartedAt=${parsed.phaseStartedAt}, session=${session.id}`
          );
          return { session, hookType: 'none' as const };
        } else {
          console.warn(
            `[POMODORO] Alarm validation rejected: reason=identity-mismatch, received='${fromAlarmName}', ` +
              `expected='${expectedAlarmName}', session=${session.id}`
          );
          if (session.mode === 'POMODORO_STOPWATCH' && pState.currentPhase === 'FOCUS') {
            throw new AppError(
              'INVALID_POMODORO_ALARM',
              `Invalid or forged alarm name for Pomodoro Stopwatch: '${fromAlarmName}'.`,
              { alarmName: fromAlarmName }
            );
          }
          return { session, hookType: 'none' as const };
        }
      }

      if (!TimerStateMachine.isActive(session.status)) {
        return { session, hookType: 'none' as const };
      }

      const now = Date.now();

      // If currently paused, finalize the pause first
      let totalPauseMs = session.totalPauseMs;
      let phaseTotalPauseMs = pState.phaseTotalPauseMs;
      const pauseHistory = [...session.pauseHistory];
      if (session.status === 'PAUSED' && session.currentPauseStartedAt) {
        const pRecord = TimeCalculator.finalizePause(session.currentPauseStartedAt, now);
        totalPauseMs += pRecord.durationMs;
        phaseTotalPauseMs += pRecord.durationMs;
        pauseHistory.push(pRecord);
      }

      let activeProfile = null;
      try {
        activeProfile = await this.profileManager.getActiveProfile();
      } catch {
        // ignore
      }

      // CASE 1: Currently in FOCUS -> Complete Focus interval, transition to BREAK or Quest Completion
      if (pState.currentPhase === 'FOCUS') {
        const intervalDuration = pConfig.focusIntervalDurationMinutes ?? pConfig.focusDurationMinutes ?? 25;
        const targetFinishTime = pState.phaseStartedAt + intervalDuration * 60 * 1000 + phaseTotalPauseMs;
        const isTimeElapsed = now >= targetFinishTime;

        if (session.mode === 'POMODORO_STOPWATCH') {
          if (!fromAlarmName && !isTimeElapsed) {
            console.warn(`[POMODORO] Alarm validation rejected: manual early interval completion attempted in Stopwatch mode`);
            throw new AppError(
              'POMODORO_EARLY_COMPLETE_STOPWATCH',
              'Manual early interval completion is prohibited in Pomodoro Stopwatch.'
            );
          }
          if (fromAlarmName && fromAlarmName !== expectedAlarmName) {
            console.warn(`[POMODORO] Alarm validation rejected: alarm name mismatch '${fromAlarmName}' !== '${expectedAlarmName}'`);
            throw new AppError(
              'INVALID_POMODORO_ALARM',
              `Invalid or forged alarm name for Pomodoro Stopwatch: '${fromAlarmName}'.`,
              { alarmName: fromAlarmName }
            );
          }
        } else if (session.mode === 'POMODORO_COUNTDOWN') {
          if (fromAlarmName && fromAlarmName !== expectedAlarmName) {
            console.warn(`[POMODORO] Alarm validation rejected: alarm name mismatch '${fromAlarmName}' !== '${expectedAlarmName}'`);
            throw new AppError(
              'INVALID_POMODORO_ALARM',
              `Invalid or forged alarm name for Pomodoro: '${fromAlarmName}'.`,
              { alarmName: fromAlarmName }
            );
          }
        }

        console.log(`[POMODORO] Alarm validation passed: phase=FOCUS, interval=${pState.currentInterval}`);

        console.log(
          `[POMODORO] Completing Focus Interval ${pState.currentInterval} of Cycle ${pState.currentCycle ?? 1} (${intervalDuration}m completed)`
        );

        const intervalsPerCycle = pConfig.focusIntervalsPerCycle ?? pConfig.targetFocusSessions ?? 4;
        const cycles = pConfig.numberOfCycles ?? 3;
        const newCompletedCount = pState.completedFocusCount + 1;
        const newTotalFocusMinutes = newCompletedCount * intervalDuration;

        // BRANCH 1A: Pomodoro Countdown
        if (session.mode === 'POMODORO_COUNTDOWN') {
          const totalPlannedIntervals = intervalsPerCycle * cycles;
          const plannedFocusMinutes = totalPlannedIntervals * intervalDuration;
          const cdMultiplier =
            session.lockedMultiplier || MultiplierRules.getCountdownMultiplier(plannedFocusMinutes);
          const totalCoins = plannedFocusMinutes * 1.5 * cdMultiplier * this.getCoinBonusFactor();
          const totalXp = plannedFocusMinutes * 5.0 * cdMultiplier;
          console.log(`[POMODORO] Reward recalculated: multiplier=${cdMultiplier}x, totalCoins=${totalCoins}, totalXp=${totalXp}`);

          // Check if ALL planned intervals across all cycles are completed
          if (newCompletedCount >= totalPlannedIntervals) {
            const updated: SessionSnapshot = {
              ...session,
              status: 'COMPLETED',
              currentPauseStartedAt: null,
              pauseExpiresAt: null,
              totalPauseMs,
              pauseHistory,
              completedAt: now,
              rewardProcessed: true,
              lockedMultiplier: cdMultiplier,
              pomodoroState: {
                ...pState,
                currentPhase: 'FOCUS',
                completedFocusCount: newCompletedCount,
                totalCompletedFocusMinutes: plannedFocusMinutes,
                accumulatedCoins: totalCoins,
                accumulatedXp: totalXp,
              },
            };

            const completedDateKey = this.getTodayDateKey(now);
            const questOutcomeDelta = this.buildQuestOutcomeDeltaSafe(updated, completedDateKey);

            // Settlement occurs ONCE at 100% mission completion
            await this.storage.commitSessionOutcomeInternal({
              session: updated,
              economyDelta: {
                coins: totalCoins,
                xp: totalXp,
              },
              dailyStatDelta: {
                date: completedDateKey,
                focusMinutes: plannedFocusMinutes,
                isCompleted: true,
                isAbandoned: false,
                coins: totalCoins,
                xp: totalXp,
              },
              questOutcomeDelta,
            });
            console.log(`[POMODORO] Focus completion persisted: completedCount=${newCompletedCount}, totalFocusMins=${plannedFocusMinutes}`);

            await this.alarms.clearAll();
            await this.blockingCoordinator.syncBlocking(false, null);
            await this.badge.clearBadge();
            await this.storage.clearSessionLifecycleMarker();

            await this.notifySessionCompletedInternal({
              session,
              persistSnapshot: updated,
              titleKey: 'notif.missionCompleteTitle',
              messageKey: 'notif.pomoCompleteMsg',
              messageParams: {
                minutes: plannedFocusMinutes,
                coins: totalCoins,
                xp: totalXp,
              },
            });

            return { session: updated, hookType: 'ended' as const };
          }

          // Incomplete quest: transition to Break (Short or Long). Wallet is NOT credited yet.
          const isLongBreak = newCompletedCount % intervalsPerCycle === 0;
          const nextPhase: PomodoroPhase = isLongBreak ? 'LONG_BREAK' : 'SHORT_BREAK';
          const breakDurationMinutes = isLongBreak
            ? pConfig.longBreakDurationMinutes
            : pConfig.shortBreakDurationMinutes;

          const updatedState: PomodoroState = {
            ...pState,
            currentPhase: nextPhase,
            completedFocusCount: newCompletedCount,
            phaseStartedAt: now,
            phaseTargetDurationMinutes: breakDurationMinutes,
            phaseTotalPauseMs: 0,
            totalCompletedFocusMinutes: newTotalFocusMinutes,
            accumulatedCoins: totalCoins,
            accumulatedXp: totalXp,
          };

          const updated: SessionSnapshot = {
            ...session,
            status: 'RUNNING',
            currentPauseStartedAt: null,
            pauseExpiresAt: null,
            totalPauseMs,
            pauseHistory,
            lastHeartbeatAt: now,
            lastCheckpointAt: now,
            accumulatedFocusMs: (session.accumulatedFocusMs ?? 0) + intervalDuration * 60 * 1000,
            lockedMultiplier: cdMultiplier,
            pomodoroState: updatedState,
          };

          await this.storage.setCurrentSession(updated);
          console.log(
            `[POMODORO] Phase transition: reason=focus-complete, session=${session.id}, ` +
              `from=FOCUS, to=${nextPhase}, interval=${pState.currentInterval}, ` +
              `cycle=${pState.currentCycle ?? 1}, completedFocusCount=${newCompletedCount}, ` +
              `phaseStartedAt=${now}, phaseTargetDurationMinutes=${breakDurationMinutes}`
          );
          await this.applyBlockingForPhase(nextPhase, activeProfile);
          await this.badge.setBadgeText('REST');
          await this.badge.setBadgeBackgroundColor('#06B6D4'); // Cyan

          // Drop the alarm that completed the Focus phase before scheduling the
          // break alarm, so no leftover Focus alarm can end the new phase.
          await this.alarms.clear(expectedAlarmName);
          const breakFinishTime = now + breakDurationMinutes * 60 * 1000;
          const alarmName = buildPomodoroStageAlarmName(
            session.id,
            pState.currentInterval,
            nextPhase,
            now
          );
          await this.alarms.create(alarmName, { when: breakFinishTime });
          console.log(
            `[POMODORO] Next phase alarm scheduled: name=${alarmName}, when=${breakFinishTime}, ` +
              `now=${now}, phase=${nextPhase}`
          );

          await this.notifyPomodoroPhaseInternal(
            `fq_pomodoro_${session.id}_c${pState.currentCycle ?? 1}_i${pState.currentInterval}_${nextPhase}_${now}`,
            isLongBreak ? 'notif.longBreakTitle' : 'notif.shortBreakTitle',
            'notif.pomoCdBreakMsg',
            { minutes: breakDurationMinutes }
          );

          return { session: updated, hookType: 'sync' as const };
        }

        // BRANCH 1B: Pomodoro Stopwatch (Infinite cycles, recalculate accumulated reward on total focus time)
        const newMultiplier = MultiplierRules.getSessionMultiplier(newTotalFocusMinutes);
        const accumulatedCoins =
          newTotalFocusMinutes * 1.0 * newMultiplier * this.getCoinBonusFactor();
        const accumulatedXp = newTotalFocusMinutes * 3.0 * newMultiplier;
        console.log(`[POMODORO] Reward recalculated: multiplier=${newMultiplier}x, accumulatedCoins=${accumulatedCoins}, accumulatedXp=${accumulatedXp}`);

        const isLongBreak = newCompletedCount % intervalsPerCycle === 0;
        const nextPhase: PomodoroPhase = isLongBreak ? 'LONG_BREAK' : 'SHORT_BREAK';
        const breakDurationMinutes = isLongBreak
          ? pConfig.longBreakDurationMinutes
          : pConfig.shortBreakDurationMinutes;

        const updatedState: PomodoroState = {
          ...pState,
          currentPhase: nextPhase,
          completedFocusCount: newCompletedCount,
          phaseStartedAt: now,
          phaseTargetDurationMinutes: breakDurationMinutes,
          phaseTotalPauseMs: 0,
          totalCompletedFocusMinutes: newTotalFocusMinutes,
          accumulatedCoins,
          accumulatedXp,
        };

        const updated: SessionSnapshot = {
          ...session,
          status: 'RUNNING',
          currentPauseStartedAt: null,
          pauseExpiresAt: null,
          totalPauseMs,
          pauseHistory,
          lastHeartbeatAt: now,
          lastCheckpointAt: now,
          accumulatedFocusMs: (session.accumulatedFocusMs ?? 0) + intervalDuration * 60 * 1000,
          lockedMultiplier: newMultiplier,
          pomodoroState: updatedState,
        };

        await this.storage.setCurrentSession(updated);
        console.log(
          `[POMODORO] Phase transition: reason=focus-complete, session=${session.id}, ` +
            `from=FOCUS, to=${nextPhase}, interval=${pState.currentInterval}, ` +
            `cycle=${pState.currentCycle ?? 1}, completedFocusCount=${newCompletedCount}, ` +
            `phaseStartedAt=${now}, phaseTargetDurationMinutes=${breakDurationMinutes}`
        );

        // CLEAR website blocking rules during break (websites freely accessible)
        await this.applyBlockingForPhase(nextPhase, activeProfile);

        // Update badge
        await this.badge.setBadgeText('REST');
        await this.badge.setBadgeBackgroundColor('#06B6D4'); // Cyan

        // Schedule break alarm (drop the completed Focus alarm first)
        await this.alarms.clear(expectedAlarmName);
        const breakFinishTime = now + breakDurationMinutes * 60 * 1000;
        const alarmName = buildPomodoroStageAlarmName(
          session.id,
          pState.currentInterval,
          nextPhase,
          now
        );
        await this.alarms.create(alarmName, { when: breakFinishTime });
        console.log(
          `[POMODORO] Next phase alarm scheduled: name=${alarmName}, when=${breakFinishTime}, ` +
            `now=${now}, phase=${nextPhase}`
        );

        // Dispatch Chrome notification
        await this.notifyPomodoroPhaseInternal(
          `fq_pomodoro_${session.id}_c${pState.currentCycle ?? 1}_i${pState.currentInterval}_${nextPhase}_${now}`,
          isLongBreak ? 'notif.longBreakTitle' : 'notif.shortBreakTitle',
          'notif.pomoSwBreakMsg',
          {
            coins: accumulatedCoins,
            xp: accumulatedXp,
            minutes: breakDurationMinutes,
          }
        );

        return { session: updated, hookType: 'sync' as const };
      }

      // CASE 2: Currently in BREAK (Short or Long) -> Transition to FOCUS
      const fromPhase = pState.currentPhase;
      let nextCycle = pState.currentCycle ?? 1;
      let nextInterval: number;

      if (pState.currentPhase === 'LONG_BREAK') {
        // Cycle completed: increment cycle number and reset interval number to 1
        nextCycle += 1;
        nextInterval = 1;
      } else {
        // Same cycle: step to next interval in cycle
        nextInterval = pState.currentInterval + 1;
      }

      const focusIntervalMinutes =
        pConfig.focusIntervalDurationMinutes ?? pConfig.focusDurationMinutes ?? 25;
      const targetFocusMinutes = focusIntervalMinutes;

      const updatedState: PomodoroState = {
        ...pState,
        currentPhase: 'FOCUS',
        currentInterval: nextInterval,
        currentCycle: nextCycle,
        phaseStartedAt: now,
        phaseTargetDurationMinutes: targetFocusMinutes,
        phaseTotalPauseMs: 0,
      };

      const updated: SessionSnapshot = {
        ...session,
        status: 'RUNNING',
        currentPauseStartedAt: null,
        pauseExpiresAt: null,
        totalPauseMs,
        pauseHistory,
        lastHeartbeatAt: now,
        lastCheckpointAt: now,
        pomodoroState: updatedState,
      };

      await this.storage.setCurrentSession(updated);
      console.log(
        `[POMODORO] Phase transition: reason=break-complete, session=${session.id}, ` +
          `from=${fromPhase}, to=FOCUS, interval=${nextInterval}, cycle=${nextCycle}, ` +
          `phaseStartedAt=${now}, phaseTargetDurationMinutes=${targetFocusMinutes}`
      );

      // RESTORE website blocking rules and redirect open tabs
      await this.applyBlockingForPhase('FOCUS', activeProfile);

      // Update badge
      await this.badge.setBadgeText(`${focusIntervalMinutes}m`);
      await this.badge.setBadgeBackgroundColor('#10B981'); // Emerald green

      // Drop the completed break alarm before scheduling the next Focus alarm
      await this.alarms.clear(expectedAlarmName);

      // Schedule next focus alarm for Pomodoro (Countdown or Stopwatch)
      const finishTime = now + focusIntervalMinutes * 60 * 1000;
      const alarmName = buildPomodoroStageAlarmName(
        session.id,
        nextInterval,
        'FOCUS',
        now
      );
      await this.alarms.create(alarmName, { when: finishTime });
      console.log(
        `[POMODORO] Next phase alarm scheduled: name=${alarmName}, when=${finishTime}, ` +
          `now=${now}, phase=FOCUS`
      );

      // Dispatch Chrome notification
      await this.notifyPomodoroPhaseInternal(
        `fq_pomodoro_${session.id}_c${nextCycle}_i${nextInterval}_FOCUS_${now}`,
        'notif.breakEndedTitle',
        'notif.breakEndedMsg',
        {
          interval: nextInterval,
          cycle: nextCycle,
        }
      );

      return { session: updated, hookType: 'sync' as const };
    });

    if (result.hookType === 'ended' && result.session) {
      await this.triggerSessionEndedHookInternal(result.session, 'COMPLETED');
    } else if (result.hookType === 'sync' && result.session) {
      await this.triggerSessionSyncHookInternal(result.session, 'PHASE_CHANGED');
    }
    return result.session;
  }

  /**
   * Handle recovery when Extension was Disabled or Reloaded while browser was open.
   * Countdown & Pomodoro Countdown: INTERRUPTED, Reward = 0, valid minutes recorded to Daily Stats, rewardProcessed = true.
   * Stopwatch: INTERRUPTED, Reward = 0, valid minutes recorded to Daily Stats, rewardProcessed = true.
   * Pomodoro Stopwatch (per PRODUCT_SPEC §9): EXTENSION_DISABLED/EXTENSION_RELOADED earns 0 Coins/XP, valid minutes recorded to Daily Stats, rewardProcessed = true.
   */
  async handleExtensionDisabledRecovery(
    session: SessionSnapshot,
    interruptedReason: 'EXTENSION_DISABLED' | 'EXTENSION_RELOADED' = 'EXTENSION_DISABLED'
  ): Promise<SessionSnapshot> {
    const result = await this.storage.runExclusive(async () => {
      const current = await this.storage.getCurrentSession();
      if (!current || !TimerStateMachine.isActive(current.status)) {
        return { session: current ?? session, didTransition: false };
      }

      if (current.rewardProcessed) {
        return { session: current, didTransition: false };
      }

      const now = Date.now();
      const lastHeartbeat = current.lastHeartbeatAt || current.startedAt;
      let validMinutes = Math.floor(
        Math.max(0, lastHeartbeat - current.startedAt - current.totalPauseMs) / 60000
      );
      if (current.pomodoroState) {
        validMinutes = current.pomodoroState.totalCompletedFocusMinutes;
        if (current.pomodoroState.currentPhase === 'FOCUS') {
          const raw = Math.max(
            0,
            lastHeartbeat - current.pomodoroState.phaseStartedAt - current.pomodoroState.phaseTotalPauseMs
          );
          validMinutes += Math.floor(raw / 60000);
        }
      }

      if (current.mode === 'COUNTDOWN' || current.mode === 'POMODORO_COUNTDOWN') {
        const updated: SessionSnapshot = {
          ...current,
          status: 'INTERRUPTED',
          currentPauseStartedAt: null,
          pauseExpiresAt: null,
          completedAt: now,
          rewardProcessed: true,
          interruptedReason,
          lastKnownValidFocusMinutes: validMinutes,
          lockedMultiplier: 1.0,
          pomodoroState: current.pomodoroState
            ? {
                ...current.pomodoroState,
                accumulatedCoins: 0,
                accumulatedXp: 0,
              }
            : undefined,
        };

        await this.storage.commitSessionOutcomeInternal({
          session: updated,
          dailyStatDelta:
            validMinutes > 0
              ? {
                  date: this.getTodayDateKey(),
                  focusMinutes: validMinutes,
                  isCompleted: false,
                  isAbandoned: true,
                  coins: 0,
                  xp: 0,
                }
              : undefined,
        });

        await this.alarms.clearAll();
        await this.blockingCoordinator.syncBlocking(false, null);
        await this.badge.clearBadge();
        await this.storage.clearSessionLifecycleMarker();

        return { session: updated, didTransition: true };
      } else if (current.mode === 'POMODORO_STOPWATCH') {
        const pState = current.pomodoroState;

        const updated: SessionSnapshot = {
          ...current,
          status: 'INTERRUPTED',
          currentPauseStartedAt: null,
          pauseExpiresAt: null,
          completedAt: now,
          rewardProcessed: true,
          interruptedReason,
          lastKnownValidFocusMinutes: validMinutes,
          pomodoroState: pState
            ? {
                ...pState,
                accumulatedCoins: 0,
                accumulatedXp: 0,
              }
            : undefined,
        };

        await this.storage.commitSessionOutcomeInternal({
          session: updated,
          dailyStatDelta:
            validMinutes > 0
              ? {
                  date: this.getTodayDateKey(),
                  focusMinutes: validMinutes,
                  isCompleted: false,
                  isAbandoned: true,
                  coins: 0,
                  xp: 0,
                }
              : undefined,
        });

        await this.alarms.clearAll();
        await this.blockingCoordinator.syncBlocking(false, null);
        await this.badge.clearBadge();
        await this.storage.clearSessionLifecycleMarker();

        return { session: updated, didTransition: true };
      } else {
        const reward = this.rewardEngine.calculateInterruptedStopwatchReward(validMinutes);

        const updated: SessionSnapshot = {
          ...current,
          status: 'INTERRUPTED',
          currentPauseStartedAt: null,
          pauseExpiresAt: null,
          completedAt: now,
          rewardProcessed: true,
          interruptedReason,
          lastKnownValidFocusMinutes: validMinutes,
          lockedMultiplier: reward.multiplier,
        };

        await this.storage.commitSessionOutcomeInternal({
          session: updated,
          dailyStatDelta:
            validMinutes > 0
              ? {
                  date: this.getTodayDateKey(),
                  focusMinutes: validMinutes,
                  isCompleted: false,
                  isAbandoned: true,
                  coins: 0,
                  xp: 0,
                }
              : undefined,
        });

        await this.alarms.clearAll();
        await this.blockingCoordinator.syncBlocking(false, null);
        await this.badge.clearBadge();
        await this.storage.clearSessionLifecycleMarker();

        return { session: updated, didTransition: true };
      }
    });

    if (result.didTransition) {
      await this.triggerSessionEndedHookInternal(result.session, 'INTERRUPTED');
    }
    return result.session;
  }

  /**
   * Unified Lifecycle Recovery Handler for all Chrome events.
   * Prioritizes higher-fidelity lifecycle signals and deduplicates concurrent/redundant recovery invocations.
   */
  async handleLifecycleEvent(context: LifecycleEventContext): Promise<SessionSnapshot | null> {
    const incomingPriority = LIFECYCLE_PRIORITY[context.reason] ?? 0;

    // Case A: A recovery is currently running in-flight
    if (this.inFlightRecoveryPromise && this.inFlightContext) {
      const inFlightPriority = LIFECYCLE_PRIORITY[this.inFlightContext.reason] ?? 0;

      // Case A1: Incoming event has strictly LOWER priority than in-flight event.
      // Example: in-flight is EXTENSION_RELOADED (40), incoming is EXTENSION_UPDATED (20).
      // The higher-priority event will penalize/interrupt the session.
      // The lower-priority update cannot and should not override it; it safely awaits the in-flight result.
      if (incomingPriority < inFlightPriority) {
        return this.inFlightRecoveryPromise;
      }

      // Case A2: Incoming event has the exact same priority and intent/reason.
      // Example: concurrent BROWSER_STARTUP events (onStartup + onExtensionLoaded(startup)).
      // Example: concurrent EXTENSION_RE_ENABLED events (onEnabled + onExtensionLoaded(enable)).
      // Re-running the identical lifecycle transition is redundant.
      if (incomingPriority === inFlightPriority && context.reason === this.inFlightContext.reason) {
        return this.inFlightRecoveryPromise;
      }

      // Case A3: Incoming event has HIGHER priority than in-flight event!
      // Example: in-flight is EXTENSION_UPDATED (20), incoming is EXTENSION_RELOADED (40).
      // Example: in-flight is BROWSER_STARTUP (30), incoming is EXTENSION_RELOADED (40).
      // We MUST NOT drop the higher-priority event.
      // Wait for the current lower-priority recovery to complete, and then immediately execute
      // the higher-priority recovery.
      const higherPriorityContext = context;
      return (async () => {
        try {
          await this.inFlightRecoveryPromise;
        } catch {
          // Ignore errors from previous in-flight run
        }
        return this.handleLifecycleEvent(higherPriorityContext);
      })();
    }

    const promise = this.executeLifecycleRecovery(context);
    this.inFlightRecoveryPromise = promise;
    this.inFlightContext = context;
    try {
      const result = await promise;
      this.isInitialized = true;
      return result;
    } finally {
      this.inFlightRecoveryPromise = null;
      this.inFlightContext = null;
    }
  }

  /**
   * Service Worker Lifecycle Recovery Handler.
   * Backward-compatible with previous recoverSession caller signature.
   */
  async recoverSession(options?: { isBrowserStartup?: boolean; reason?: LifecycleReason }): Promise<SessionSnapshot | null> {
    const reason: LifecycleReason =
      options?.reason ?? (options?.isBrowserStartup ? 'BROWSER_STARTUP' : 'UNKNOWN');
    return this.handleLifecycleEvent({
      reason,
      isBrowserStartup: options?.isBrowserStartup ?? (reason === 'BROWSER_STARTUP' || reason === 'BROWSER_UPDATED'),
    });
  }

  /**
   * Execute the lifecycle recovery workflow.
   */
  private async executeLifecycleRecovery(context: LifecycleEventContext): Promise<SessionSnapshot | null> {
    const reason = context.reason;
    const isStartup = reason === 'BROWSER_STARTUP' || reason === 'BROWSER_UPDATED' || !!context.isBrowserStartup;

    const session = await this.storage.getCurrentSession();
    if (!session) {
      await this.blockingCoordinator.syncBlocking(false, null);
      await this.badge.clearBadge();
      await this.storage.clearSessionLifecycleMarker();
      await this.triggerSessionSyncHookInternal(null, isStartup ? 'STARTUP_NO_SESSION' : reason);
      return null;
    }

    // 1. Terminal session with stale blocking rules -> clean up
    if (TimerStateMachine.isTerminal(session.status)) {
      await this.blockingCoordinator.syncBlocking(false, null);
      await this.badge.clearBadge();
      await this.storage.clearSessionLifecycleMarker();
      await this.triggerSessionSyncHookInternal(session, reason);
      return session;
    }

    // 2. Explicit Extension Disabled or Reloaded signal
    if (reason === 'EXTENSION_RE_ENABLED') {
      return this.handleExtensionDisabledRecovery(session, 'EXTENSION_DISABLED');
    }
    if (reason === 'EXTENSION_RELOADED') {
      return this.handleExtensionDisabledRecovery(session, 'EXTENSION_RELOADED');
    }

    // 3. Browser Startup: reconcile through dedicated browser startup recovery
    if (isStartup) {
      // If this session has already been recovered for startup in this SW lifecycle, avoid redundant duplicate work
      if (this.lastProcessedStartupSessionId === session.id) {
        return session;
      }
      this.lastProcessedStartupSessionId = session.id;
      return this.handleBrowserStartupRecovery(session);
    }

    // 4. Extension Update: preserve session state without disable penalty
    if (reason === 'EXTENSION_UPDATED') {
      await this.storage.setSessionLifecycleMarker(session.id);
      return this.reconcileActiveSession(session);
    }

    // 5. Service Worker wake-up or Unknown lifecycle
    const marker = await this.storage.getSessionLifecycleMarker();
    if (marker === session.id) {
      // Normal SW idle sleep/wake-up cycle
      return this.reconcileActiveSession(session);
    }

    // Marker is absent, but lifecycle signal is unconfirmed (e.g. Chrome < 155 or missing marker during business event).
    // RULE (Part 4.1): Do NOT call handleExtensionDisabledRecovery!
    // Do NOT transition session to INTERRUPTED!
    // Log diagnostic warning, preserve session integrity, re-arm alarms/rules, and re-establish marker.
    console.warn(`[FocusQuest] Session lifecycle reason '${reason}' with missing marker; preserving session integrity.`);
    await this.storage.setSessionLifecycleMarker(session.id);
    return this.reconcileActiveSession(session);
  }

  /**
   * Reconcile an active session's state, timers, alarms, and blocking rules.
   */
  private async reconcileActiveSession(snapshot: SessionSnapshot): Promise<SessionSnapshot> {
    const now = Date.now();
    let activeProfile = null;
    try {
      activeProfile = await this.profileManager.getActiveProfile();
    } catch {
      // ignore
    }

    // The profile lookup is async: an alarm or user action may have advanced the
    // phase while we were waiting. Re-read the authoritative session so stale
    // FOCUS reconciliation can never re-enable blocking during a break.
    const authoritative = await this.storage.getCurrentSession();
    if (!authoritative) {
      await this.blockingCoordinator.syncBlocking(false, null);
      return snapshot;
    }
    if (authoritative.id !== snapshot.id) {
      return authoritative;
    }
    const session = authoritative;

    // A. RUNNING Countdown: check if already passed target finish time while SW was asleep / browser was closed
    if (session.status === 'RUNNING' && session.mode === 'COUNTDOWN') {
      const targetFinishTime = session.startedAt + session.targetMinutes * 60 * 1000 + session.totalPauseMs;
      if (now >= targetFinishTime) {
        // Countdown finished while SW/browser was inactive -> Complete with 100% rewards
        const completed = await this.completeCountdown();
        return completed ?? session;
      }

      // Still running -> re-schedule alarm, update badge, and reconcile blocking rules
      await this.alarms.create(ALARM_NAMES.COUNTDOWN_FINISH, { when: targetFinishTime });
      const remainingMinutes = Math.max(1, Math.ceil((targetFinishTime - now) / 60000));
      await this.badge.setBadgeText(`${remainingMinutes}m`);
      await this.badge.setBadgeBackgroundColor('#10B981');
      await this.blockingCoordinator.syncBlocking(true, activeProfile);
      await this.triggerSessionSyncHookInternal(session, 'RECOVERY');
      return session;
    }

    // B. PAUSED session: check if pause exceeded 5 minutes
    if (session.status === 'PAUSED' && session.currentPauseStartedAt) {
      const pauseDuration = now - session.currentPauseStartedAt;
      if (pauseDuration >= MAX_PAUSE_DURATION_MS) {
        // Auto-resume triggered
        const resumed = await this.resumeSession(true);
        // If countdown finished during the elapsed time after auto-resume, complete it!
        if (resumed.mode === 'COUNTDOWN') {
          const targetFinishTime = resumed.startedAt + resumed.targetMinutes * 60 * 1000 + resumed.totalPauseMs;
          if (now >= targetFinishTime) {
            const completed = await this.completeCountdown();
            return completed ?? resumed;
          }
        }
        return resumed;
      }

      // Re-schedule remaining auto-resume dynamic alarm; website blocking remains cleared while paused
      const remainingPause = session.currentPauseStartedAt + MAX_PAUSE_DURATION_MS;
      await this.alarms.create(buildPauseAlarmName(session.id, session.currentPauseStartedAt), {
        when: remainingPause,
      });
      await this.badge.setBadgeText('PAUSE');
      await this.badge.setBadgeBackgroundColor('#F59E0B');
      await this.blockingCoordinator.syncBlocking(false, null);
      await this.triggerSessionSyncHookInternal(session, 'RECOVERY');
      return session;
    }

    // C. RUNNING Stopwatch
    if (session.status === 'RUNNING' && session.mode === 'STOPWATCH') {
      await this.badge.setBadgeText('RUN');
      await this.badge.setBadgeBackgroundColor('#3B82F6');
      await this.blockingCoordinator.syncBlocking(true, activeProfile);
      await this.triggerSessionSyncHookInternal(session, 'RECOVERY');
      return session;
    }

    // D. RUNNING Pomodoro (Countdown or Stopwatch)
    if (
      session.status === 'RUNNING' &&
      (session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH')
    ) {
      const pState = session.pomodoroState;
      const pConfig = session.pomodoroConfig;
      if (!pState || !pConfig) return session;

      if (pState.currentPhase === 'FOCUS') {
        await this.blockingCoordinator.syncBlocking(true, activeProfile);

        const intervalDuration =
          pConfig.focusIntervalDurationMinutes ?? pConfig.focusDurationMinutes;
        const targetFinishTime =
          pState.phaseStartedAt + intervalDuration * 60 * 1000 + pState.phaseTotalPauseMs;
        const expectedFocusAlarmName = buildPomodoroStageAlarmName(
          session.id,
          pState.currentInterval,
          'FOCUS',
          pState.phaseStartedAt
        );

        if (now >= targetFinishTime) {
          // Stage finished while SW asleep / browser was closed -> Advance to Break with valid expected alarm name
          const advanced = await this.advancePomodoroStage(expectedFocusAlarmName);
          return advanced ?? session;
        }

        // Re-schedule alarm
        await this.alarms.create(expectedFocusAlarmName, { when: targetFinishTime });
        const remainingMinutes = Math.max(1, Math.ceil((targetFinishTime - now) / 60000));
        await this.badge.setBadgeText(`${remainingMinutes}m`);
        await this.badge.setBadgeBackgroundColor('#10B981');
        await this.triggerSessionSyncHookInternal(session, 'RECOVERY');
        return session;
      }

      // BREAK Phase: Short or Long Break (Websites unblocked)
      await this.blockingCoordinator.syncBlocking(false, null);
      const breakFinishTime =
        pState.phaseStartedAt + pState.phaseTargetDurationMinutes * 60 * 1000 + pState.phaseTotalPauseMs;
      const expectedBreakAlarmName = buildPomodoroStageAlarmName(
        session.id,
        pState.currentInterval,
        pState.currentPhase,
        pState.phaseStartedAt
      );

      if (now >= breakFinishTime) {
        // Break finished while SW asleep / browser closed -> Advance to next Focus with valid expected alarm name
        const advanced = await this.advancePomodoroStage(expectedBreakAlarmName);
        return advanced ?? session;
      }

      // Re-schedule break alarm
      await this.alarms.create(expectedBreakAlarmName, { when: breakFinishTime });
      await this.badge.setBadgeText('REST');
      await this.badge.setBadgeBackgroundColor('#06B6D4');
      await this.triggerSessionSyncHookInternal(session, 'RECOVERY');
      return session;
    }

    return session;
  }

  /**
   * Record periodic heartbeat for crash estimation.
   */
  async updateHeartbeat(): Promise<void> {
    await this.storage.updateCurrentSession((session) => {
      if (!session || !TimerStateMachine.isActive(session.status)) {
        return session;
      }
      return {
        ...session,
        lastHeartbeatAt: Date.now(),
      };
    });
  }

  /**
   * Ensure that the periodic 1-minute heartbeat alarm is active.
   */
  async ensureHeartbeatAlarm(): Promise<void> {
    try {
      const existing = await this.alarms.get(ALARM_NAMES.HEARTBEAT);
      if (!existing) {
        await this.alarms.create(ALARM_NAMES.HEARTBEAT, { periodInMinutes: 1 });
      }
    } catch (err) {
      console.warn('[FocusQuest] Error checking/creating heartbeat alarm:', err);
    }
  }

  /**
   * Process periodic 1-minute heartbeat alarm.
   * Performs focus time checkpointing, auto-resume checks, and stage completions under concurrency safety.
   */
  async processHeartbeat(): Promise<void> {
    const session = await this.storage.getCurrentSession();
    if (!session || !TimerStateMachine.isActive(session.status)) {
      await this.alarms.clear(ALARM_NAMES.HEARTBEAT);
      return;
    }

    const now = Date.now();

    // 1. If PAUSED, check auto-resume (5 minutes limit)
    if (session.status === 'PAUSED') {
      if (session.currentPauseStartedAt && now - session.currentPauseStartedAt >= MAX_PAUSE_DURATION_MS) {
        await this.resumeSession(true);
        return;
      }
      // During pause, no focus time accumulates. Just keep heartbeat fresh.
      await this.storage.updateCurrentSession((s) => (s ? { ...s, lastHeartbeatAt: now } : s));
      return;
    }

    // 2. If RUNNING:
    if (session.status === 'RUNNING') {
      if (session.mode === 'COUNTDOWN') {
        const targetFinishTime =
          session.startedAt + session.targetMinutes * 60 * 1000 + session.totalPauseMs;
        if (now >= targetFinishTime) {
          await this.completeCountdown();
          return;
        }

        await this.storage.updateCurrentSession((s) => {
          if (!s || s.status !== 'RUNNING') return s;
          const lastCheckpoint = s.lastCheckpointAt ?? s.startedAt;
          const deltaMs = Math.max(0, now - lastCheckpoint);
          const newAccumulated = (s.accumulatedFocusMs ?? 0) + deltaMs;
          return {
            ...s,
            lastHeartbeatAt: now,
            lastCheckpointAt: now,
            accumulatedFocusMs: newAccumulated,
          };
        });

        const remainingMinutes = Math.max(1, Math.ceil((targetFinishTime - now) / 60000));
        await this.badge.setBadgeText(`${remainingMinutes}m`);
        await this.badge.setBadgeBackgroundColor('#10B981');
        return;
      }

      if (session.mode === 'STOPWATCH') {
        await this.storage.updateCurrentSession((s) => {
          if (!s || s.status !== 'RUNNING') return s;
          const lastCheckpoint = s.lastCheckpointAt ?? s.startedAt;
          const deltaMs = Math.max(0, now - lastCheckpoint);
          const newAccumulated = (s.accumulatedFocusMs ?? 0) + deltaMs;
          return {
            ...s,
            lastHeartbeatAt: now,
            lastCheckpointAt: now,
            accumulatedFocusMs: newAccumulated,
          };
        });

        await this.badge.setBadgeText('RUN');
        await this.badge.setBadgeBackgroundColor('#3B82F6');
        return;
      }

      if (session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH') {
        const pState = session.pomodoroState;
        const pConfig = session.pomodoroConfig;
        if (!pState || !pConfig) return;

        if (pState.currentPhase === 'FOCUS') {
          const intervalDuration =
            pConfig.focusIntervalDurationMinutes ?? pConfig.focusDurationMinutes;
          const phaseFinishTime =
            pState.phaseStartedAt + intervalDuration * 60 * 1000 + pState.phaseTotalPauseMs;

          if (now >= phaseFinishTime) {
            const expectedAlarmName = buildPomodoroStageAlarmName(
              session.id,
              pState.currentInterval,
              'FOCUS',
              pState.phaseStartedAt
            );
            await this.advancePomodoroStage(expectedAlarmName);
            return;
          }

          await this.storage.updateCurrentSession((s) => {
            if (!s || s.status !== 'RUNNING' || s.pomodoroState?.currentPhase !== 'FOCUS') {
              return s ? { ...s, lastHeartbeatAt: now } : s;
            }
            const lastCheckpoint = s.lastCheckpointAt ?? s.pomodoroState.phaseStartedAt;
            const deltaMs = Math.max(0, now - lastCheckpoint);
            const newAccumulated = (s.accumulatedFocusMs ?? 0) + deltaMs;
            return {
              ...s,
              lastHeartbeatAt: now,
              lastCheckpointAt: now,
              accumulatedFocusMs: newAccumulated,
            };
          });

          const remainingMinutes = Math.max(1, Math.ceil((phaseFinishTime - now) / 60000));
          await this.badge.setBadgeText(`${remainingMinutes}m`);
          await this.badge.setBadgeBackgroundColor('#10B981');
          return;
        }

        // BREAK phase: Break time is excluded from focus checkpoints
        const breakFinishTime =
          pState.phaseStartedAt +
          pState.phaseTargetDurationMinutes * 60 * 1000 +
          pState.phaseTotalPauseMs;

        if (now >= breakFinishTime) {
          const expectedAlarmName = buildPomodoroStageAlarmName(
            session.id,
            pState.currentInterval,
            pState.currentPhase,
            pState.phaseStartedAt
          );
          await this.advancePomodoroStage(expectedAlarmName);
          return;
        }

        await this.storage.updateCurrentSession((s) =>
          s
            ? {
                ...s,
                lastHeartbeatAt: now,
                lastCheckpointAt: now,
              }
            : s
        );

        await this.badge.setBadgeText('REST');
        await this.badge.setBadgeBackgroundColor('#06B6D4');
        return;
      }
    }
  }

  /**
   * Handle recovery on Browser Startup (Chrome was closed, killed, or crashed).
   * Browser downtime is NEVER counted as focus time.
   * - COUNTDOWN: interrupted with 0 rewards if downtime occurred or target passed in downtime.
   * - STOPWATCH: interrupted with 0 rewards. Checkpointed focus minutes preserved in Daily Stats.
   * - POMODORO_STOPWATCH: interrupted. Completed intervals awarded; checkpointed focus minutes logged in Daily Stats.
   * - POMODORO_COUNTDOWN: interrupted with 0 rewards. Completed focus minutes logged in Daily Stats. All-or-nothing!
   */
  async handleBrowserStartupRecovery(session: SessionSnapshot): Promise<SessionSnapshot> {
    const current = await this.storage.getCurrentSession();
    if (!current || !TimerStateMachine.isActive(current.status)) {
      return current ?? session;
    }
    if (current.id !== session.id) {
      return current;
    }

    const now = Date.now();

    // 0. PAUSED session: check if pause exceeded 5 minutes or restore pause alarm
    if (current.status === 'PAUSED') {
      return this.reconcileActiveSession(current);
    }

    const lastActivity =
      current.lastCheckpointAt ?? current.lastHeartbeatAt ?? current.startedAt;
    const downtimeMs = Math.max(0, now - lastActivity);

    // 1. COUNTDOWN
    if (current.mode === 'COUNTDOWN') {
      const targetFinishTime =
        current.startedAt + current.targetMinutes * 60 * 1000 + current.totalPauseMs;

      // If target finish time elapsed during downtime, or downtime occurred (>= 1s):
      // Countdown CANNOT be awarded completion. Downtime must NEVER be converted to focus time.
      if (now >= targetFinishTime || downtimeMs >= 1000) {
        const result = await this.storage.runExclusive(async () => {
          const latest = await this.storage.getCurrentSession();
          if (!latest || !TimerStateMachine.isActive(latest.status) || latest.rewardProcessed) {
            return { session: latest ?? current, didTransition: false };
          }

          const validMs =
            latest.accumulatedFocusMs && latest.accumulatedFocusMs > 0
              ? latest.accumulatedFocusMs
              : Math.max(
                  0,
                  (latest.lastCheckpointAt ?? latest.lastHeartbeatAt ?? latest.startedAt) -
                    latest.startedAt -
                    latest.totalPauseMs
                );
          const validMinutes = Math.floor(validMs / 60000);

          const updated: SessionSnapshot = {
            ...latest,
            status: 'INTERRUPTED',
            currentPauseStartedAt: null,
            pauseExpiresAt: null,
            completedAt: now,
            rewardProcessed: true,
            interruptedReason: 'BROWSER_CLOSED',
            lastKnownValidFocusMinutes: validMinutes,
            lockedMultiplier: 1.0,
          };

          await this.storage.commitSessionOutcomeInternal({
            session: updated,
            dailyStatDelta:
              validMinutes > 0
                ? {
                    date: this.getTodayDateKey(),
                    focusMinutes: validMinutes,
                    isCompleted: false,
                    isAbandoned: true,
                    coins: 0,
                    xp: 0,
                  }
                : undefined,
          });

          await this.alarms.clearAll();
          await this.blockingCoordinator.syncBlocking(false, null);
          await this.badge.clearBadge();
          await this.storage.clearSessionLifecycleMarker();

          return { session: updated, didTransition: true };
        });

        if (result.didTransition) {
          await this.triggerSessionEndedHookInternal(result.session, 'INTERRUPTED');
        }
        return result.session;
      }

      await this.storage.setSessionLifecycleMarker(current.id);
      await this.ensureHeartbeatAlarm();
      await this.alarms.create(ALARM_NAMES.COUNTDOWN_FINISH, { when: targetFinishTime });

      const remainingMinutes = Math.max(1, Math.ceil((targetFinishTime - now) / 60000));
      await this.badge.setBadgeText(`${remainingMinutes}m`);
      await this.badge.setBadgeBackgroundColor('#10B981');

      let activeProfile = null;
      try {
        activeProfile = await this.profileManager.getActiveProfile();
      } catch {
        // ignore
      }
      await this.blockingCoordinator.syncBlocking(true, activeProfile);
      await this.triggerSessionSyncHookInternal(current, 'BROWSER_STARTUP_ACTIVE');
      return current;
    }

    // 2. STOPWATCH
    if (current.mode === 'STOPWATCH') {
      const result = await this.storage.runExclusive(async () => {
        const latest = await this.storage.getCurrentSession();
        if (!latest || !TimerStateMachine.isActive(latest.status) || latest.rewardProcessed) {
          return { session: latest ?? current, didTransition: false };
        }

        const validMs =
          latest.accumulatedFocusMs && latest.accumulatedFocusMs > 0
            ? latest.accumulatedFocusMs
            : Math.max(
                0,
                (latest.lastCheckpointAt ?? latest.lastHeartbeatAt ?? latest.startedAt) -
                  latest.startedAt -
                  latest.totalPauseMs
              );
        const validMinutes = Math.floor(validMs / 60000);

        const updated: SessionSnapshot = {
          ...latest,
          status: 'INTERRUPTED',
          currentPauseStartedAt: null,
          pauseExpiresAt: null,
          completedAt: now,
          rewardProcessed: true,
          interruptedReason: 'BROWSER_CLOSED',
          lastKnownValidFocusMinutes: validMinutes,
          lockedMultiplier: 1.0,
        };

        await this.storage.commitSessionOutcomeInternal({
          session: updated,
          dailyStatDelta:
            validMinutes > 0
              ? {
                  date: this.getTodayDateKey(),
                  focusMinutes: validMinutes,
                  isCompleted: false,
                  isAbandoned: true,
                  coins: 0,
                  xp: 0,
                }
              : undefined,
        });

        await this.alarms.clearAll();
        await this.blockingCoordinator.syncBlocking(false, null);
        await this.badge.clearBadge();
        await this.storage.clearSessionLifecycleMarker();

        return { session: updated, didTransition: true };
      });

      if (result.didTransition) {
        await this.triggerSessionEndedHookInternal(result.session, 'INTERRUPTED');
      }
      return result.session;
    }

    // 3. POMODORO_STOPWATCH
    if (current.mode === 'POMODORO_STOPWATCH') {
      const result = await this.storage.runExclusive(async () => {
        const latest = await this.storage.getCurrentSession();
        if (!latest || !TimerStateMachine.isActive(latest.status) || latest.rewardProcessed) {
          return { session: latest ?? current, didTransition: false };
        }

        const pState = latest.pomodoroState;
        const completedCount = pState?.completedFocusCount ?? 0;
        const completedMinutes = pState?.totalCompletedFocusMinutes ?? 0;

        let partialMinutes = 0;
        if (pState && pState.currentPhase === 'FOCUS') {
          const checkpoint =
            latest.lastCheckpointAt ?? latest.lastHeartbeatAt ?? pState.phaseStartedAt;
          const partialMs = Math.max(
            0,
            checkpoint - pState.phaseStartedAt - pState.phaseTotalPauseMs
          );
          partialMinutes = Math.floor(partialMs / 60000);
        }

        const totalActualMinutes = completedMinutes + partialMinutes;
        const coinsEarned = completedCount > 0 ? pState?.accumulatedCoins ?? 0 : 0;
        const xpEarned = completedCount > 0 ? pState?.accumulatedXp ?? 0 : 0;

        const updated: SessionSnapshot = {
          ...latest,
          status: 'INTERRUPTED',
          currentPauseStartedAt: null,
          pauseExpiresAt: null,
          completedAt: now,
          rewardProcessed: true,
          interruptedReason: 'BROWSER_CLOSED',
          lastKnownValidFocusMinutes: totalActualMinutes,
          pomodoroState: pState
            ? {
                ...pState,
                totalCompletedFocusMinutes: completedMinutes,
                accumulatedCoins: coinsEarned,
                accumulatedXp: xpEarned,
              }
            : undefined,
        };

        await this.storage.commitSessionOutcomeInternal({
          session: updated,
          economyDelta:
            coinsEarned > 0 || xpEarned > 0
              ? {
                  coins: coinsEarned,
                  xp: xpEarned,
                }
              : undefined,
          dailyStatDelta:
            totalActualMinutes > 0
              ? {
                  date: this.getTodayDateKey(),
                  focusMinutes: totalActualMinutes,
                  isCompleted: completedCount > 0,
                  isAbandoned: completedCount === 0,
                  coins: coinsEarned,
                  xp: xpEarned,
                }
              : undefined,
        });

        await this.alarms.clearAll();
        await this.blockingCoordinator.syncBlocking(false, null);
        await this.badge.clearBadge();
        await this.storage.clearSessionLifecycleMarker();

        return { session: updated, didTransition: true };
      });

      if (result.didTransition) {
        await this.triggerSessionEndedHookInternal(result.session, 'INTERRUPTED');
      }
      return result.session;
    }

    // 4. POMODORO_COUNTDOWN
    if (current.mode === 'POMODORO_COUNTDOWN') {
      const pState = current.pomodoroState;
      const pConfig = current.pomodoroConfig;
      const intervalDuration =
        pConfig?.focusIntervalDurationMinutes ?? pConfig?.focusDurationMinutes ?? 25;
      const phaseTarget = pState ? (pState.phaseTargetDurationMinutes || intervalDuration) : 25;
      const phaseTargetFinishTime = pState
        ? pState.phaseStartedAt + phaseTarget * 60 * 1000 + pState.phaseTotalPauseMs
        : current.startedAt + 25 * 60 * 1000;

      // If downtime occurred (downtimeMs >= 1000) or phase target elapsed during downtime:
      // Pomodoro Countdown is ALL-OR-NOTHING. It ONLY earns rewards upon 100% full quest completion.
      // If interrupted before full completion: reward MUST be exactly 0 Coins and 0 XP.
      if (now >= phaseTargetFinishTime || downtimeMs >= 1000) {
        const result = await this.storage.runExclusive(async () => {
          const latest = await this.storage.getCurrentSession();
          if (!latest || !TimerStateMachine.isActive(latest.status) || latest.rewardProcessed) {
            return { session: latest ?? current, didTransition: false };
          }

          const latestPState = latest.pomodoroState;
          const completedMinutes = latestPState?.totalCompletedFocusMinutes ?? 0;

          let partialMinutes = 0;
          if (latestPState && latestPState.currentPhase === 'FOCUS') {
            const checkpoint =
              latest.lastCheckpointAt ?? latest.lastHeartbeatAt ?? latestPState.phaseStartedAt;
            const partialMs = Math.max(
              0,
              checkpoint - latestPState.phaseStartedAt - latestPState.phaseTotalPauseMs
            );
            partialMinutes = Math.floor(partialMs / 60000);
          }

          const totalActualMinutes = completedMinutes + partialMinutes;

          const updated: SessionSnapshot = {
            ...latest,
            status: 'INTERRUPTED',
            currentPauseStartedAt: null,
            pauseExpiresAt: null,
            completedAt: now,
            rewardProcessed: true,
            interruptedReason: 'BROWSER_CLOSED',
            lastKnownValidFocusMinutes: totalActualMinutes,
            pomodoroState: latestPState
              ? {
                  ...latestPState,
                  totalCompletedFocusMinutes: completedMinutes,
                  accumulatedCoins: 0,
                  accumulatedXp: 0,
                }
              : undefined,
          };

          await this.storage.commitSessionOutcomeInternal({
            session: updated,
            // 0 Coins and 0 XP - strictly no economyDelta
            dailyStatDelta:
              totalActualMinutes > 0
                ? {
                    date: this.getTodayDateKey(),
                    focusMinutes: totalActualMinutes,
                    isCompleted: false, // Never mark as completed if interrupted!
                    isAbandoned: true,
                    coins: 0,
                    xp: 0,
                  }
                : undefined,
          });

          await this.alarms.clearAll();
          await this.blockingCoordinator.syncBlocking(false, null);
          await this.badge.clearBadge();
          await this.storage.clearSessionLifecycleMarker();

          return { session: updated, didTransition: true };
        });

        if (result.didTransition) {
          await this.triggerSessionEndedHookInternal(result.session, 'INTERRUPTED');
        }
        return result.session;
      }

      // If 0 downtime (e.g. immediate test startup), restore active session
      await this.storage.setSessionLifecycleMarker(current.id);
      await this.ensureHeartbeatAlarm();
      return this.reconcileActiveSession(current);
    }

    return current;
  }

  /**
   * Reset session back to IDLE (only allowed when session is terminal: COMPLETED, ABANDONED, or INTERRUPTED).
   */
  async resetSession(): Promise<void> {
    await this.storage.runExclusive(async () => {
      const session = await this.storage.getCurrentSession();
      if (session && TimerStateMachine.isActive(session.status)) {
        throw new AppError(
          'SESSION_CANNOT_RESET_ACTIVE',
          `Cannot reset active session with status '${session.status}'. Finish or give up first.`,
          { status: session.status }
        );
      }
      await this.storage.setCurrentSession(null);
      await this.alarms.clearAll();
      await this.blockingCoordinator.syncBlocking(false, null);
      await this.badge.clearBadge();
      await this.storage.clearSessionLifecycleMarker();
    });
    await this.triggerSessionSyncHookInternal(null, 'RESET');
  }
}
