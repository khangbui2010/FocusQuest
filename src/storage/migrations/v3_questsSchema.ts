/**
 * Migration v3: Add Daily & Weekly Quest State (`fq_quests`).
 * Milestone 5B.5 Stage 2a: Quest Schema v3 & Pure Engine Foundation
 *
 * Ensures:
 * - 100% preservation of all existing player data (Economy, XP, Level, Profiles,
 *   CurrentSession, DailyStats, Settings, Civilization, Music state/cache).
 * - Clean initialization of `fq_quests` for the current local day/week with ZERO
 *   backfill of historical focus sessions (Zero Passive Income invariant).
 * - Defensive sanitization if `fq_quests` contains corrupt pre-existing data.
 * - Idempotency: running multiple times does not reset valid Quest progress.
 */

import { Migration } from './types.ts';
import { IStorageAdapter } from '../storageInterface.ts';
import { STORAGE_KEYS } from '../storageKeys.ts';
import { QuestState } from '../../types/quests.ts';
import {
  createInitialQuestState,
  sanitizeQuestState,
} from '../../core/quests/questEngine.ts';

export const v3_questsSchema: Migration = {
  version: 3,
  description: 'Add Daily & Weekly Quest state (fq_quests) for Milestone 5B.5 Stage 2a',
  async up(storage: IStorageAdapter): Promise<void> {
    const existingVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
    if (existingVersion !== undefined && existingVersion >= 3) {
      return;
    }

    const nowMs = Date.now();
    const existingQuests = await storage.get<unknown>(STORAGE_KEYS.QUESTS);
    const questState: QuestState = existingQuests
      ? sanitizeQuestState(existingQuests, nowMs)
      : createInitialQuestState(nowMs);

    await storage.setMultiple({
      [STORAGE_KEYS.SCHEMA_VERSION]: 3,
      [STORAGE_KEYS.QUESTS]: questState,
    });
  },
};
