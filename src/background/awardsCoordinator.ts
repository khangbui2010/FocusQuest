import { StorageManager } from '../storage/storageManager.ts';
import {
  buildAwardViewModels,
  countUnseenAwards,
  evaluateAwards,
  markAwardsAsSeen,
  sanitizeAwardState,
} from '../core/awards/index.ts';
import {
  createInitialCivilizationState,
  sanitizeCivilizationState,
} from '../core/civilization/civilizationState.ts';
import { getLocalDateKey } from '../core/utils/dateUtils.ts';
import {
  AwardEvaluationContext,
  GetAwardsStateResponseData,
  MarkAwardsSeenPayload,
  MarkAwardsSeenResponseData,
} from '../types/awards.ts';
import { AppError } from '../types/errors.ts';

export class AwardsCoordinator {
  constructor(private storage: StorageManager) {}

  private async buildContextInternal(nowMs: number): Promise<AwardEvaluationContext> {
    const [economy, dailyStats, quests, rawCiv] = await Promise.all([
      this.storage.getEconomy(),
      this.storage.getDailyStats(),
      this.storage.getQuests(nowMs),
      this.storage.getCivilizationState(),
    ]);

    const civilization = sanitizeCivilizationState(rawCiv) ?? createInitialCivilizationState();

    return {
      economy,
      dailyStats,
      quests,
      civilization,
      todayDateKey: getLocalDateKey(nowMs),
      nowMs,
    };
  }

  async getAwardsState(nowMs: number = Date.now()): Promise<GetAwardsStateResponseData> {
    return this.storage.runExclusive(async () => {
      const [rawAwards, context] = await Promise.all([
        this.storage.getRawAwardsInternal(),
        this.buildContextInternal(nowMs),
      ]);

      const evalRes = evaluateAwards(sanitizeAwardState(rawAwards), context);
      if (evalRes.mutated || rawAwards === undefined) {
        await this.storage.setAwards(evalRes.nextState);
      }

      return {
        awardState: evalRes.nextState,
        awards: evalRes.viewModels,
        unseenCount: evalRes.unseenCount,
        era: context.civilization.era,
      };
    });
  }

  async markAwardsSeen(
    payload?: MarkAwardsSeenPayload,
    nowMs: number = Date.now()
  ): Promise<MarkAwardsSeenResponseData> {
    if (payload !== undefined) {
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new AppError('INVALID_AWARDS_PAYLOAD', 'MARK_AWARDS_SEEN payload must be an object.');
      }
      if (
        payload.awardIds !== undefined &&
        (!Array.isArray(payload.awardIds) ||
          payload.awardIds.some((id) => typeof id !== 'string' || id.trim().length === 0))
      ) {
        throw new AppError(
          'INVALID_AWARDS_PAYLOAD',
          'MARK_AWARDS_SEEN awardIds must be an array of non-empty strings.'
        );
      }
    }

    return this.storage.runExclusive(async () => {
      const [rawAwards, context] = await Promise.all([
        this.storage.getRawAwardsInternal(),
        this.buildContextInternal(nowMs),
      ]);

      const evalRes = evaluateAwards(sanitizeAwardState(rawAwards), context);
      const seenRes = markAwardsAsSeen(evalRes.nextState, payload?.awardIds);

      if (evalRes.mutated || seenRes.mutated || rawAwards === undefined) {
        await this.storage.setAwards(seenRes.nextState);
      }

      const awards = buildAwardViewModels(seenRes.nextState, context);
      return {
        awardState: seenRes.nextState,
        awards,
        unseenCount: countUnseenAwards(seenRes.nextState),
      };
    });
  }
}
