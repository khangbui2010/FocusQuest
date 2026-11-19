/**
 * QuestCoordinator for Focus Quest (Milestone 5B.5 Stage 2b).
 *
 * Single background authority for reading Quest progression and executing
 * manual Quest reward claims atomically under StorageMutex.
 * - Reuses pure domain logic from src/core/quests/.
 * - Reuses calculatePlayerLevel(totalXP) from src/core/economy/levelSystem.ts.
 * - Never modifies fq_daily_stats when claiming Quest rewards.
 */

import { StorageManager } from '../storage/storageManager.ts';
import {
  ClaimQuestRewardPayload,
  ClaimQuestRewardResponseData,
  GetQuestStateResponseData,
} from '../types/messages.ts';
import { QuestErrorCode, QuestPeriod, QuestState } from '../types/quests.ts';
import { ErrorParams } from '../types/errors.ts';
import { PlayerEconomy } from '../types/economy.ts';
import {
  ALL_QUEST_DEFINITIONS,
  getQuestDefinition,
} from '../core/quests/questCatalog.ts';
import { getResetCountdown } from '../core/quests/questDates.ts';
import {
  claimQuest,
  countUnclaimed,
  makeClaimLedgerKey,
  rolloverQuestState,
  sanitizeQuestState,
} from '../core/quests/questEngine.ts';
import { calculatePlayerLevel } from '../core/economy/levelSystem.ts';

export class QuestCoordinatorError extends Error {
  readonly code: QuestErrorCode;
  readonly params?: ErrorParams;

  constructor(code: QuestErrorCode, message: string, params?: ErrorParams) {
    super(message);
    this.name = 'QuestCoordinatorError';
    this.code = code;
    this.params = params;
  }
}

export function isValidQuestPeriod(value: unknown): value is QuestPeriod {
  return value === 'DAILY' || value === 'WEEKLY';
}

/**
 * Validates and resolves CLAIM_QUEST_REWARD payload against the authoritative Quest catalog.
 * Distinguishes malformed payloads, unknown quest IDs, and period mismatches.
 */
export function validateClaimQuestPayload(payload: unknown): ClaimQuestRewardPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new QuestCoordinatorError(
      'INVALID_QUEST_PAYLOAD',
      'CLAIM_QUEST_REWARD requires payload with period and questId.'
    );
  }

  const raw = payload as Record<string, unknown>;
  if (!isValidQuestPeriod(raw.period)) {
    throw new QuestCoordinatorError(
      'INVALID_QUEST_PAYLOAD',
      "CLAIM_QUEST_REWARD requires valid period ('DAILY' | 'WEEKLY')."
    );
  }

  if (
    typeof raw.questId !== 'string' ||
    !raw.questId.trim() ||
    raw.questId.length > 64 ||
    /[\r\n\t<>"]/.test(raw.questId)
  ) {
    throw new QuestCoordinatorError(
      'INVALID_QUEST_PAYLOAD',
      'CLAIM_QUEST_REWARD requires valid questId.'
    );
  }

  const questId = raw.questId.trim();
  const existsAnywhere = ALL_QUEST_DEFINITIONS.some((def) => def.id === questId);
  if (!existsAnywhere) {
    throw new QuestCoordinatorError('UNKNOWN_QUEST', `Unknown quest "${questId}".`, {
      questId,
    });
  }

  const exactDef = getQuestDefinition(raw.period, questId);
  if (!exactDef) {
    throw new QuestCoordinatorError(
      'QUEST_PERIOD_MISMATCH',
      `Quest "${questId}" does not belong to period ${raw.period}.`,
      { questId, period: raw.period }
    );
  }

  return {
    period: raw.period,
    questId,
  };
}

function shouldPersistRolledState(raw: unknown, rolled: QuestState): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return true;
  }
  const record = raw as Record<string, unknown>;
  return (
    record.dailyDateKey !== rolled.dailyDateKey ||
    record.weeklyStartKey !== rolled.weeklyStartKey
  );
}

export class QuestCoordinator {
  constructor(private storage: StorageManager) {}

  /**
   * Returns current QuestState (rolled over to the supplied wall-clock day/week if needed),
   * local reset countdowns, and unclaimed completed quest count.
   */
  async getQuestState(nowMs: number = Date.now()): Promise<GetQuestStateResponseData> {
    return this.storage.runExclusive(async () => {
      const raw = await this.storage.getRawQuestsInternal();
      const sanitized = sanitizeQuestState(raw, nowMs);
      const rolled = rolloverQuestState(sanitized, nowMs);

      if (shouldPersistRolledState(raw, rolled)) {
        await this.storage.setQuests(rolled);
      }

      return {
        questState: rolled,
        resetCountdown: getResetCountdown(nowMs, rolled),
        unclaimedCount: countUnclaimed(rolled, nowMs),
      };
    });
  }

  /**
   * Atomically claims a completed quest reward and credits flat Coins/XP to Economy.
   * Serialized strictly under StorageMutex to prevent concurrent double-claims.
   * Never mutates fq_daily_stats.
   */
  async claimQuestReward(
    payload: unknown,
    nowMs: number = Date.now()
  ): Promise<ClaimQuestRewardResponseData> {
    const valid = validateClaimQuestPayload(payload);
    const def = getQuestDefinition(valid.period, valid.questId)!;

    return this.storage.runExclusive(async () => {
      const raw = await this.storage.getRawQuestsInternal();
      const hasRawObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw);
      const preRolloverState = hasRawObject ? sanitizeQuestState(raw, nowMs) : null;
      const rolled = rolloverQuestState(
        preRolloverState ?? sanitizeQuestState(undefined, nowMs),
        nowMs
      );

      const didPeriodRollForward =
        preRolloverState !== null &&
        ((valid.period === 'DAILY' && rolled.dailyDateKey !== preRolloverState.dailyDateKey) ||
          (valid.period === 'WEEKLY' && rolled.weeklyStartKey !== preRolloverState.weeklyStartKey));

      const priorEntry =
        preRolloverState === null
          ? undefined
          : valid.period === 'DAILY'
            ? preRolloverState.daily[valid.questId]
            : preRolloverState.weekly[valid.questId];

      const claimResult = claimQuest(rolled, valid.period, valid.questId, nowMs);

      if (!claimResult.claimed) {
        const currentEntry =
          valid.period === 'DAILY'
            ? rolled.daily[valid.questId]
            : rolled.weekly[valid.questId];
        const periodDateKey =
          valid.period === 'DAILY' ? rolled.dailyDateKey : rolled.weeklyStartKey;
        const ledgerKey = makeClaimLedgerKey(valid.period, periodDateKey, valid.questId);

        if (currentEntry?.claimed || rolled.recentClaimedKeys.includes(ledgerKey)) {
          throw new QuestCoordinatorError(
            'QUEST_ALREADY_CLAIMED',
            `Quest "${valid.questId}" reward has already been claimed.`,
            { questId: valid.questId }
          );
        }

        if (
          didPeriodRollForward &&
          priorEntry &&
          priorEntry.progress >= priorEntry.target &&
          !priorEntry.claimed
        ) {
          throw new QuestCoordinatorError(
            'QUEST_EXPIRED',
            `Quest "${valid.questId}" reward expired after period reset.`,
            { questId: valid.questId }
          );
        }

        const progress = currentEntry?.progress ?? 0;
        const target = currentEntry?.target ?? def.target;
        throw new QuestCoordinatorError(
          'QUEST_NOT_COMPLETED',
          `Quest "${valid.questId}" is not completed yet (${progress}/${target}).`,
          { questId: valid.questId, progress, target }
        );
      }

      const currentEconomy = await this.storage.getEconomy();
      const claimedCoins = claimResult.coins;
      const claimedXp = claimResult.xp;
      const newTotalXP = Math.max(0, currentEconomy.totalXP + claimedXp);
      const nextEconomy: PlayerEconomy = {
        ...currentEconomy,
        focusCoins: currentEconomy.focusCoins + claimedCoins,
        totalXP: newTotalXP,
        level: calculatePlayerLevel(newTotalXP),
      };

      await this.storage.commitQuestClaimInternal({
        previousEconomy: currentEconomy,
        nextEconomy,
        previousQuests: rolled,
        nextQuests: claimResult.state,
      });

      return {
        questState: claimResult.state,
        economy: nextEconomy,
        claimedCoins,
        claimedXp,
      };
    });
  }
}
