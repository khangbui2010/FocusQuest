/**
 * Migration v7: Initialize `fq_awards` from existing player history.
 * Milestone 5D-2:
 *
 * Guarantees:
 * - Idempotency: skips if SCHEMA_VERSION >= 7.
 * - Evaluates existing Economy, DailyStats, Quests, and Civilization history and
 *   marks already-earned tiers with `seen: true` so existing players are not flooded
 *   with unlock notifications on upgrade.
 * - Never grants Coins or XP.
 * - Never mutates ECONOMY, QUESTS, CIVILIZATION, DAILY_STATS, PROFILES, SETTINGS, CURRENT_SESSION, or MUSIC_*.
 */

import { Migration } from './types.ts';
import { IStorageAdapter } from '../storageInterface.ts';
import { STORAGE_KEYS } from '../storageKeys.ts';
import { backfillAwardsFromHistory } from '../../core/awards/awardsEngine.ts';
import { sanitizeAwardState } from '../../core/awards/awardsState.ts';
import {
  createInitialCivilizationState,
  sanitizeCivilizationState,
} from '../../core/civilization/civilizationState.ts';
import { calculatePlayerLevel } from '../../core/economy/levelSystem.ts';
import { sanitizeQuestState } from '../../core/quests/questEngine.ts';
import { getLocalDateKey } from '../../core/utils/dateUtils.ts';
import { PlayerEconomy } from '../../types/economy.ts';
import { DailyStatRecord } from '../../types/storageSchema.ts';

export const v7_awardsSchema: Migration = {
  version: 7,
  description: 'Initialize fq_awards and backfill earned tiers as seen from existing history',
  async up(storage: IStorageAdapter): Promise<void> {
    const existingVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
    if (existingVersion !== undefined && existingVersion >= 7) {
      return;
    }

    const nowMs = Date.now();
    const todayDateKey = getLocalDateKey(nowMs);

    const [rawEconomy, rawStats, rawQuests, rawCiv, rawAwards] = await Promise.all([
      storage.get<Partial<PlayerEconomy>>(STORAGE_KEYS.ECONOMY),
      storage.get<Record<string, DailyStatRecord>>(STORAGE_KEYS.DAILY_STATS),
      storage.get<unknown>(STORAGE_KEYS.QUESTS),
      storage.get<unknown>(STORAGE_KEYS.CIVILIZATION),
      storage.get<unknown>(STORAGE_KEYS.AWARDS),
    ]);

    const totalXP =
      rawEconomy && typeof rawEconomy.totalXP === 'number' && Number.isFinite(rawEconomy.totalXP)
        ? Math.max(0, rawEconomy.totalXP)
        : 0;
    const focusCoins =
      rawEconomy &&
      typeof rawEconomy.focusCoins === 'number' &&
      Number.isFinite(rawEconomy.focusCoins)
        ? Math.max(0, rawEconomy.focusCoins)
        : 0;
    const economy: PlayerEconomy = {
      focusCoins,
      totalXP,
      level: calculatePlayerLevel(totalXP),
    };

    const dailyStats =
      rawStats && typeof rawStats === 'object' && !Array.isArray(rawStats) ? rawStats : {};
    const quests = sanitizeQuestState(rawQuests, nowMs);
    const civilization = sanitizeCivilizationState(rawCiv) ?? createInitialCivilizationState();
    const baseAwards = sanitizeAwardState(rawAwards);

    const backfill = backfillAwardsFromHistory(baseAwards, {
      economy,
      dailyStats,
      quests,
      civilization,
      todayDateKey,
      nowMs,
    });

    await storage.setMultiple({
      [STORAGE_KEYS.SCHEMA_VERSION]: 7,
      [STORAGE_KEYS.AWARDS]: backfill.nextState,
    });
  },
};
