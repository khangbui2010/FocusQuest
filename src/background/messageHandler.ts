import { ExtensionMessage, MessageResponse } from '../types/messages.ts';
import { SessionCoordinator } from './sessionCoordinator.ts';
import { ProfileManager } from '../core/profiles/profileManager.ts';
import { StorageManager } from '../storage/storageManager.ts';
import { TimerStateMachine } from '../core/timer/timerStateMachine.ts';
import { CivilizationCoordinator } from './civilizationCoordinator.ts';
import { isValidCoordinate } from '../core/civilization/placementValidator.ts';
import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../core/civilization/constants.ts';
import { isSupportedLocale } from '../i18n/locale.ts';
import { MusicCoordinator } from './musicCoordinator.ts';
import {
  QuestCoordinator,
  QuestCoordinatorError,
  validateClaimQuestPayload,
} from './questCoordinator.ts';
import { AwardsCoordinator } from './awardsCoordinator.ts';
import { AppError, ErrorCode, extractCodedError } from '../types/errors.ts';

export class MessageHandler {
  private civilizationCoordinator: CivilizationCoordinator;
  private questCoordinator: QuestCoordinator;
  private awardsCoordinator: AwardsCoordinator;

  constructor(
    private sessionCoordinator: SessionCoordinator,
    private profileManager: ProfileManager,
    private storage: StorageManager,
    civilizationCoordinator?: CivilizationCoordinator,
    private musicCoordinator?: MusicCoordinator,
    questCoordinator?: QuestCoordinator,
    awardsCoordinator?: AwardsCoordinator
  ) {
    this.civilizationCoordinator = civilizationCoordinator ?? new CivilizationCoordinator(storage);
    this.questCoordinator = questCoordinator ?? new QuestCoordinator(storage);
    this.awardsCoordinator = awardsCoordinator ?? new AwardsCoordinator(storage);
  }

  private getMusicCoordinator(): MusicCoordinator {
    if (!this.musicCoordinator) {
      throw new AppError(
        'MUSIC_COORDINATOR_NOT_INITIALIZED',
        'Music coordinator is not initialized.'
      );
    }
    return this.musicCoordinator;
  }

  /**
   * Asserts that no focus session is active (RUNNING or PAUSED).
   * Rejects allowlist and profile mutations if a session is currently in progress.
   */
  private async assertNoActiveSession(
    code: ErrorCode = 'ACTIVE_SESSION_LOCK_ALLOWLIST',
    errorMessage?: string
  ): Promise<void> {
    const session = await this.storage.getCurrentSession();
    if (session && TimerStateMachine.isActive(session.status)) {
      throw new AppError(
        code,
        errorMessage || 'Allowlist cannot be modified during a focus session. Finish your session first.'
      );
    }
  }

  /**
   * Process incoming extension messages with complete validation and standardized response.
   */
  async handleMessage(message: unknown): Promise<MessageResponse> {
    if (!message || typeof message !== 'object' || !('action' in message)) {
      return {
        success: false,
        error: 'Invalid message format: missing action field.',
        errorCode: 'INVALID_MESSAGE_FORMAT',
      };
    }

    const msg = message as ExtensionMessage;

    try {
      switch (msg.action) {
        // --- Session Actions ---
        case 'GET_SESSION_STATE': {
          const fullState = await this.sessionCoordinator.getFullState();
          return { success: true, data: fullState };
        }

        case 'START_SESSION': {
          if (!msg.payload || !msg.payload.mode || !msg.payload.profileId) {
            return {
              success: false,
              error: 'START_SESSION requires mode and profileId.',
              errorCode: 'MISSING_START_SESSION_FIELDS',
            };
          }
          const validModes = ['COUNTDOWN', 'STOPWATCH', 'POMODORO_COUNTDOWN', 'POMODORO_STOPWATCH'];
          if (!validModes.includes(msg.payload.mode)) {
            return {
              success: false,
              error: `Invalid session mode: ${msg.payload.mode}`,
              errorCode: 'INVALID_SESSION_MODE',
              errorParams: { mode: String(msg.payload.mode) },
            };
          }
          if (msg.payload.mode === 'COUNTDOWN') {
            if (
              typeof msg.payload.targetMinutes !== 'number' ||
              !Number.isFinite(msg.payload.targetMinutes) ||
              msg.payload.targetMinutes <= 0 ||
              msg.payload.targetMinutes > 1440
            ) {
              return {
                success: false,
                error: 'COUNTDOWN requires targetMinutes between 1 and 1440.',
                errorCode: 'INVALID_TARGET_MINUTES',
              };
            }
          }
          if (msg.payload.assignedJobIds !== undefined) {
            if (
              !Array.isArray(msg.payload.assignedJobIds) ||
              msg.payload.assignedJobIds.some(
                (id) => typeof id !== 'string' || id.trim().length === 0
              )
            ) {
              return {
                success: false,
                error: 'assignedJobIds must be an array of non-empty job ID strings.',
                errorCode: 'SESSION_INVALID_JOB_ASSIGNMENT',
              };
            }
          }
          if (
            msg.payload.autoContinueJobs !== undefined &&
            typeof msg.payload.autoContinueJobs !== 'boolean'
          ) {
            return {
              success: false,
              error: 'autoContinueJobs must be a boolean.',
              errorCode: 'SESSION_INVALID_JOB_ASSIGNMENT',
            };
          }
          const {
            mode,
            targetMinutes,
            profileId,
            pomodoroConfig,
            assignedJobIds,
            autoContinueJobs,
          } = msg.payload;
          const jobOptions =
            assignedJobIds !== undefined || autoContinueJobs !== undefined
              ? { assignedJobIds, autoContinueJobs }
              : undefined;
          const session = await this.sessionCoordinator.startSession(
            mode,
            targetMinutes,
            profileId,
            pomodoroConfig,
            jobOptions
          );
          return { success: true, data: session };
        }

        case 'PAUSE_SESSION': {
          const session = await this.sessionCoordinator.pauseSession();
          return { success: true, data: session };
        }

        case 'RESUME_SESSION': {
          const session = await this.sessionCoordinator.resumeSession(false);
          return { success: true, data: session };
        }

        case 'GIVE_UP_SESSION': {
          const session = await this.sessionCoordinator.giveUpCountdown();
          return { success: true, data: session };
        }

        case 'FINISH_STOPWATCH': {
          const result = await this.sessionCoordinator.finishStopwatch();
          return { success: true, data: result };
        }

        case 'ADVANCE_POMODORO_STAGE': {
          const currentSession = await this.storage.getCurrentSession();

          // Idempotent no-op: a stale UI that still shows FOCUS after the
          // background alarm already entered a break must not be allowed to
          // end that break. ADVANCE is only valid from the stored FOCUS phase.
          if (
            currentSession?.pomodoroState &&
            currentSession.pomodoroState.currentPhase !== 'FOCUS'
          ) {
            console.log(
              `[POMODORO] ADVANCE_POMODORO_STAGE ignored: reason=stale-ui-phase, ` +
                `storedPhase=${currentSession.pomodoroState.currentPhase}, session=${currentSession.id}`
            );
            return { success: true, data: currentSession };
          }

          if (currentSession?.pomodoroState?.currentPhase === 'FOCUS') {
            const pConfig = currentSession.pomodoroConfig;
            const pState = currentSession.pomodoroState;
            const intervalMins = pConfig?.focusIntervalDurationMinutes ?? pConfig?.focusDurationMinutes ?? 25;
            const pauseMs = pState.phaseTotalPauseMs ?? 0;
            const targetFinishTime = pState.phaseStartedAt + intervalMins * 60 * 1000 + pauseMs;
            const now = Date.now();
            if (now < targetFinishTime) {
              const isPomoStopwatch = currentSession.mode === 'POMODORO_STOPWATCH';
              const errMsg = isPomoStopwatch
                ? 'Manual early interval completion is prohibited in Pomodoro Stopwatch.'
                : 'Manual early interval completion is prohibited during Focus phase.';
              return {
                success: false,
                error: errMsg,
                errorCode: isPomoStopwatch
                  ? 'POMODORO_EARLY_COMPLETE_STOPWATCH'
                  : 'POMODORO_EARLY_COMPLETE_FOCUS',
              };
            }
          }
          // Never forward any client-supplied alarm payload; internal coordinator controls alarm validation.
          // The expected phase is re-verified atomically inside the coordinator mutex.
          const session = await this.sessionCoordinator.advancePomodoroStage(undefined, 'FOCUS');
          return { success: true, data: session };
        }

        case 'SKIP_POMODORO_BREAK': {
          const currentSession = await this.storage.getCurrentSession();
          if (
            !currentSession ||
            !currentSession.pomodoroState ||
            currentSession.pomodoroState.currentPhase === 'FOCUS'
          ) {
            return {
              success: false,
              error: 'Cannot skip break while in Focus phase.',
              errorCode: 'CANNOT_SKIP_BREAK_IN_FOCUS',
            };
          }
          // Passing the observed break phase makes the skip idempotent: if the
          // break alarm already moved to FOCUS, the coordinator ignores it.
          const session = await this.sessionCoordinator.advancePomodoroStage(
            undefined,
            currentSession.pomodoroState.currentPhase
          );
          return { success: true, data: session };
        }

        case 'HEARTBEAT': {
          await this.sessionCoordinator.updateHeartbeat();
          return { success: true };
        }

        case 'RESET_SESSION': {
          await this.sessionCoordinator.resetSession();
          return { success: true };
        }

        // --- Profile Actions ---
        case 'GET_PROFILES': {
          const profiles = await this.profileManager.getProfiles();
          return { success: true, data: profiles };
        }

        case 'GET_ACTIVE_PROFILE': {
          const active = await this.profileManager.getActiveProfile();
          return { success: true, data: active };
        }

        case 'SWITCH_PROFILE': {
          await this.assertNoActiveSession(
            'ACTIVE_SESSION_LOCK_PROFILE_SWITCH',
            'Cannot switch active profile during a focus session. Finish your session first.'
          );
          if (!msg.payload?.profileId) {
            return {
              success: false,
              error: 'SWITCH_PROFILE requires profileId.',
              errorCode: 'MISSING_PROFILE_ID',
            };
          }
          await this.profileManager.setActiveProfile(msg.payload.profileId);
          const active = await this.profileManager.getActiveProfile();
          return { success: true, data: active };
        }

        case 'CREATE_PROFILE': {
          await this.assertNoActiveSession(
            'ACTIVE_SESSION_LOCK_PROFILE_CREATE',
            'Cannot create profile during a focus session. Finish your session first.'
          );
          if (!msg.payload?.name) {
            return {
              success: false,
              error: 'CREATE_PROFILE requires name.',
              errorCode: 'MISSING_CREATE_PROFILE_NAME',
            };
          }
          const created = await this.profileManager.createProfile(
            msg.payload.name,
            msg.payload.initialDomains
          );
          return { success: true, data: created };
        }

        case 'RENAME_PROFILE': {
          await this.assertNoActiveSession(
            'ACTIVE_SESSION_LOCK_PROFILE_RENAME',
            'Cannot rename profile during a focus session. Finish your session first.'
          );
          if (!msg.payload?.profileId || !msg.payload?.newName) {
            return {
              success: false,
              error: 'RENAME_PROFILE requires profileId and newName.',
              errorCode: 'MISSING_RENAME_PROFILE_FIELDS',
            };
          }
          const updated = await this.profileManager.renameProfile(
            msg.payload.profileId,
            msg.payload.newName
          );
          return { success: true, data: updated };
        }

        case 'DELETE_PROFILE': {
          await this.assertNoActiveSession(
            'ACTIVE_SESSION_LOCK_PROFILE_DELETE',
            'Cannot delete profile during a focus session. Finish your session first.'
          );
          if (!msg.payload?.profileId) {
            return {
              success: false,
              error: 'DELETE_PROFILE requires profileId.',
              errorCode: 'MISSING_PROFILE_ID',
            };
          }
          const result = await this.profileManager.deleteProfile(
            msg.payload.profileId,
            msg.payload.replacementActiveProfileId
          );
          return { success: true, data: result };
        }

        case 'ADD_DOMAIN': {
          await this.assertNoActiveSession(
            'ACTIVE_SESSION_LOCK_ALLOWLIST',
            'Allowlist cannot be modified during a focus session. Finish your session first.'
          );
          if (!msg.payload?.profileId || !msg.payload?.domainPattern) {
            return {
              success: false,
              error: 'ADD_DOMAIN requires profileId and domainPattern.',
              errorCode: 'MISSING_DOMAIN_FIELDS',
            };
          }
          const updated = await this.profileManager.addDomainToProfile(
            msg.payload.profileId,
            msg.payload.domainPattern
          );
          return { success: true, data: updated };
        }

        case 'REMOVE_DOMAIN': {
          await this.assertNoActiveSession(
            'ACTIVE_SESSION_LOCK_ALLOWLIST',
            'Allowlist cannot be modified during a focus session. Finish your session first.'
          );
          if (!msg.payload?.profileId || !msg.payload?.domainPattern) {
            return {
              success: false,
              error: 'REMOVE_DOMAIN requires profileId and domainPattern.',
              errorCode: 'MISSING_DOMAIN_FIELDS',
            };
          }
          const updated = await this.profileManager.removeDomainFromProfile(
            msg.payload.profileId,
            msg.payload.domainPattern
          );
          return { success: true, data: updated };
        }

        // --- Economy & Stats Actions ---
        case 'GET_ECONOMY': {
          const economy = await this.storage.getEconomy();
          return { success: true, data: economy };
        }

        case 'GET_DAILY_STATS': {
          const stats = await this.storage.getDailyStats();
          return { success: true, data: stats };
        }

        // --- Civilization Actions ---
        case 'GET_CIVILIZATION_STATE': {
          const civState = await this.civilizationCoordinator.getCivilizationState();
          return { success: true, data: civState };
        }

        case 'PLACE_BUILDING': {
          if (!msg.payload || typeof msg.payload !== 'object') {
            return {
              success: false,
              error: 'PLACE_BUILDING requires payload object.',
              errorCode: 'CIV_INVALID_PLACE_PAYLOAD',
            };
          }
          if (typeof msg.payload.buildingDefinitionId !== 'string' || !msg.payload.buildingDefinitionId.trim()) {
            return {
              success: false,
              error: 'PLACE_BUILDING requires valid buildingDefinitionId.',
              errorCode: 'CIV_INVALID_BUILDING_DEF_ID',
            };
          }
          if (!isValidCoordinate(msg.payload.position)) {
            return {
              success: false,
              error: 'PLACE_BUILDING requires valid position coordinates.',
              errorCode: 'CIV_INVALID_POSITION',
            };
          }
          const result = await this.civilizationCoordinator.placeBuilding(msg.payload);
          return { success: true, data: result };
        }

        case 'REMOVE_BUILDING': {
          if (!msg.payload || typeof msg.payload.buildingInstanceId !== 'string' || !msg.payload.buildingInstanceId.trim()) {
            return {
              success: false,
              error: 'REMOVE_BUILDING requires valid buildingInstanceId.',
              errorCode: 'CIV_INVALID_BUILDING_INSTANCE_ID',
            };
          }
          const result = await this.civilizationCoordinator.removeBuilding(msg.payload);
          return { success: true, data: result };
        }

        case 'UPGRADE_BUILDING': {
          if (
            !msg.payload ||
            typeof msg.payload !== 'object' ||
            typeof msg.payload.buildingId !== 'string' ||
            !msg.payload.buildingId.trim() ||
            typeof msg.payload.expectedLevel !== 'number' ||
            !Number.isInteger(msg.payload.expectedLevel) ||
            msg.payload.expectedLevel < 1
          ) {
            return {
              success: false,
              error: 'UPGRADE_BUILDING requires valid buildingId and expectedLevel.',
              errorCode: 'CIV_INVALID_UPGRADE_PAYLOAD',
            };
          }
          const result = await this.civilizationCoordinator.upgradeBuilding(msg.payload);
          return { success: true, data: result };
        }

        case 'EXPAND_LAND': {
          if (!msg.payload || typeof msg.payload !== 'object') {
            return {
              success: false,
              error: 'EXPAND_LAND requires payload object.',
              errorCode: 'CIV_INVALID_EXPAND_PAYLOAD',
            };
          }
          const rawPayload = msg.payload as unknown as Record<string, unknown>;
          if ('direction' in rawPayload || 'slotIndex' in rawPayload) {
            return {
              success: false,
              error: 'EXPAND_LAND requires origin coordinates only; direction and slotIndex are not supported.',
              errorCode: 'CIV_EXPAND_UNSUPPORTED_FIELDS',
            };
          }
          if (!isValidCoordinate(msg.payload.origin)) {
            return {
              success: false,
              error: 'EXPAND_LAND requires valid origin coordinates.',
              errorCode: 'CIV_INVALID_EXPAND_ORIGIN_TYPE',
            };
          }
          if (
            msg.payload.origin.x % CHUNK_WIDTH !== 0 ||
            msg.payload.origin.y % CHUNK_HEIGHT !== 0
          ) {
            return {
              success: false,
              error: `Land expansion failed: INVALID_ORIGIN (origin must align to ${CHUNK_WIDTH}x${CHUNK_HEIGHT} chunk grid).`,
              errorCode: 'CIV_INVALID_EXPAND_ORIGIN_GRID',
              errorParams: { chunkWidth: CHUNK_WIDTH, chunkHeight: CHUNK_HEIGHT },
            };
          }
          const result = await this.civilizationCoordinator.expandLand(msg.payload);
          return { success: true, data: result };
        }

        case 'RECRUIT_VILLAGER': {
          if (!msg.payload || typeof msg.payload !== 'object') {
            return {
              success: false,
              error: 'RECRUIT_VILLAGER requires payload with villager role.',
              errorCode: 'CIV_INVALID_VILLAGER_ROLE',
            };
          }
          const result = await this.civilizationCoordinator.recruitVillager(msg.payload);
          return { success: true, data: result };
        }

        case 'CANCEL_CONSTRUCTION_JOB': {
          if (
            !msg.payload ||
            typeof msg.payload !== 'object' ||
            typeof msg.payload.jobId !== 'string' ||
            !msg.payload.jobId.trim()
          ) {
            return {
              success: false,
              error: 'CANCEL_CONSTRUCTION_JOB requires a valid jobId.',
              errorCode: 'CIV_INVALID_CANCEL_JOB_PAYLOAD',
            };
          }
          const result = await this.civilizationCoordinator.cancelConstructionJob(msg.payload);
          return { success: true, data: result };
        }

        case 'SELECT_FOUNDER': {
          if (!msg.payload || typeof msg.payload !== 'object') {
            return {
              success: false,
              error: 'SELECT_FOUNDER requires a valid villager role.',
              errorCode: 'CIV_INVALID_FOUNDER_PAYLOAD',
            };
          }
          const result = await this.civilizationCoordinator.selectFounder(msg.payload);
          return { success: true, data: result };
        }

        // --- Quest Actions ---
        case 'GET_QUEST_STATE': {
          const questData = await this.questCoordinator.getQuestState();
          return { success: true, data: questData };
        }

        case 'CLAIM_QUEST_REWARD': {
          const validPayload = validateClaimQuestPayload(msg.payload);
          const claimData = await this.questCoordinator.claimQuestReward(validPayload);
          return { success: true, data: claimData };
        }

        // --- Awards Actions ---
        case 'GET_AWARDS_STATE': {
          const awardsData = await this.awardsCoordinator.getAwardsState();
          return { success: true, data: awardsData };
        }

        case 'MARK_AWARDS_SEEN': {
          const markedData = await this.awardsCoordinator.markAwardsSeen(msg.payload);
          return { success: true, data: markedData };
        }

        // --- Settings Actions ---
        case 'SET_LANGUAGE': {
          if (!msg.payload || typeof msg.payload !== 'object' || !isSupportedLocale(msg.payload.language)) {
            return {
              success: false,
              error: "SET_LANGUAGE requires valid language ('en' | 'vi').",
              errorCode: 'INVALID_LANGUAGE',
            };
          }
          const updated = await this.storage.updateSettings({ language: msg.payload.language });
          return { success: true, data: updated };
        }

        case 'SET_CHIME_ENABLED': {
          if (!msg.payload || typeof msg.payload !== 'object' || typeof msg.payload.enabled !== 'boolean') {
            return {
              success: false,
              error: 'SET_CHIME_ENABLED requires boolean enabled flag.',
              errorCode: 'INVALID_CHIME_FLAG',
            };
          }
          const updated = await this.storage.updateSettings({ chimeEnabled: msg.payload.enabled });
          return { success: true, data: updated };
        }

        case 'SET_MUSIC_PLAYER_EXPANDED': {
          if (!msg.payload || typeof msg.payload !== 'object' || typeof msg.payload.expanded !== 'boolean') {
            return {
              success: false,
              error: 'SET_MUSIC_PLAYER_EXPANDED requires boolean expanded flag.',
              errorCode: 'INVALID_MUSIC_PLAYER_EXPANDED_FLAG',
            };
          }
          const updated = await this.storage.updateSettings({ musicPlayerExpanded: msg.payload.expanded });
          return { success: true, data: updated };
        }

        // --- Music Player Actions ---
        case 'MUSIC_GET_STATE': {
          const mc = this.getMusicCoordinator();
          await mc.sync();
          const state = await mc.getState();
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_PLAY': {
          const mc = this.getMusicCoordinator();
          const state = await mc.playTrack(msg.payload?.trackId);
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_PAUSE': {
          const mc = this.getMusicCoordinator();
          const state = await mc.pause();
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_RESUME': {
          const mc = this.getMusicCoordinator();
          const state = await mc.resume();
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_STOP': {
          const mc = this.getMusicCoordinator();
          const state = await mc.stop();
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_NEXT': {
          const mc = this.getMusicCoordinator();
          const state = await mc.next();
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_PREVIOUS': {
          const mc = this.getMusicCoordinator();
          const state = await mc.previous();
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_SEEK': {
          if (
            !msg.payload ||
            typeof msg.payload.positionSec !== 'number' ||
            !Number.isFinite(msg.payload.positionSec)
          ) {
            return {
              success: false,
              error: 'MUSIC_SEEK requires finite numeric positionSec.',
              errorCode: 'MUSIC_INVALID_SEEK_POSITION',
            };
          }
          const mc = this.getMusicCoordinator();
          const state = await mc.seek(msg.payload.positionSec);
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_SET_VOLUME': {
          if (
            !msg.payload ||
            typeof msg.payload.volume !== 'number' ||
            !Number.isFinite(msg.payload.volume)
          ) {
            return {
              success: false,
              error: 'MUSIC_SET_VOLUME requires finite numeric volume.',
              errorCode: 'MUSIC_INVALID_VOLUME',
            };
          }
          const mc = this.getMusicCoordinator();
          const state = await mc.setVolume(msg.payload.volume, msg.payload.muted);
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_SET_SHUFFLE': {
          if (!msg.payload || typeof msg.payload.enabled !== 'boolean') {
            return {
              success: false,
              error: 'MUSIC_SET_SHUFFLE requires boolean enabled flag.',
              errorCode: 'MUSIC_INVALID_SHUFFLE_FLAG',
            };
          }
          const mc = this.getMusicCoordinator();
          const state = await mc.setShuffle(msg.payload.enabled);
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_SET_REPEAT': {
          if (
            !msg.payload ||
            (msg.payload.mode !== 'off' &&
              msg.payload.mode !== 'all' &&
              msg.payload.mode !== 'one')
          ) {
            return {
              success: false,
              error: "MUSIC_SET_REPEAT requires mode ('off' | 'all' | 'one').",
              errorCode: 'MUSIC_INVALID_REPEAT_MODE',
            };
          }
          const mc = this.getMusicCoordinator();
          const state = await mc.setRepeatMode(msg.payload.mode);
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        case 'MUSIC_REFRESH_CATALOG': {
          const mc = this.getMusicCoordinator();
          const state = await mc.refreshCatalog(true);
          return { success: true, data: { state, catalog: mc.getCatalog() } };
        }

        default: {
          const unknownAction = (msg as { action: string }).action;
          return {
            success: false,
            error: `Unknown action: ${unknownAction}`,
            errorCode: 'UNKNOWN_ACTION',
            errorParams: { action: unknownAction },
          };
        }
      }
    } catch (error) {
      if (error instanceof QuestCoordinatorError) {
        return {
          success: false,
          error: error.message,
          errorCode: error.code,
          errorParams: error.params,
        };
      }
      if (error instanceof AppError) {
        return {
          success: false,
          error: error.message,
          errorCode: error.code,
          errorParams: error.params,
        };
      }
      const coded = extractCodedError(error);
      return {
        success: false,
        error: coded.message ?? (error instanceof Error ? error.message : String(error)),
        errorCode: coded.code ?? 'ACTION_FAILED',
        errorParams: coded.params,
      };
    }
  }
}
