/**
 * Migration v5: Upgrade `fq_quests` from Schema v1 (fixed 3+3 quests)
 * to Schema v2 (3-slot Daily/Weekly Quest Pool + deterministic per-install salt).
 *
 * Guarantees:
 * - Preserves 100% of active quests, partial progress, claimed flags, claimedAt,
 *   streak, recentClaimedKeys, processedPeriodKeys, and lastSettledTimestamp
 *   for the current day/week until the next natural rollover (midnight / Monday).
 * - Adds a persistent per-install salt and normalizes weeklyDailyMinutes.
 * - Preserves 100% of all unrelated storage keys (Economy, Profiles, Stats, Civ, Session, Music).
 * - Strictly idempotent when re-run or already at schemaVersion >= 5.
 */

import { Migration } from './types.ts';
import { IStorageAdapter } from '../storageInterface.ts';
import { STORAGE_KEYS } from '../storageKeys.ts';
import { CURRENT_QUEST_STATE_VERSION, QuestState } from '../../types/quests.ts';
import {
  createInitialQuestState,
  sanitizeQuestState,
} from '../../core/quests/questEngine.ts';

function generateInstallSalt(): string {
  try {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const buf = new Uint32Array(2);
      globalThis.crypto.getRandomValues(buf);
      return (
        buf[0].toString(16).padStart(8, '0') +
        buf[1].toString(16).padStart(8, '0')
      );
    }
  } catch {
    // Fallback below when Web Crypto is unavailable
  }
  const partA = Math.floor(Math.random() * 0x100000000)
    .toString(16)
    .padStart(8, '0');
  const partB = Math.floor(Math.random() * 0x100000000)
    .toString(16)
    .padStart(8, '0');
  return `${partA}${partB}`;
}

export const v5_questPoolSchema: Migration = {
  version: 5,
  description: 'Upgrade fq_quests to Quest Pool v2 (slot selection, salt, daily minutes)',
  async up(storage: IStorageAdapter): Promise<void> {
    const existingVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
    if (existingVersion !== undefined && existingVersion >= 5) {
      return;
    }

    const nowMs = Date.now();
    const existingQuests = await storage.get<unknown>(STORAGE_KEYS.QUESTS);

    let nextQuests: QuestState;
    if (
      existingQuests &&
      typeof existingQuests === 'object' &&
      !Array.isArray(existingQuests)
    ) {
      const record = existingQuests as Record<string, unknown>;
      const existingSalt =
        typeof record.salt === 'string' && record.salt.trim().length > 0
          ? record.salt.trim()
          : generateInstallSalt();
      nextQuests = sanitizeQuestState(
        {
          ...record,
          schemaVersion: CURRENT_QUEST_STATE_VERSION,
          salt: existingSalt,
        },
        nowMs
      );
    } else {
      nextQuests = createInitialQuestState(nowMs, {
        salt: generateInstallSalt(),
      });
    }

    await storage.setMultiple({
      [STORAGE_KEYS.SCHEMA_VERSION]: 5,
      [STORAGE_KEYS.QUESTS]: nextQuests,
    });
  },
};
