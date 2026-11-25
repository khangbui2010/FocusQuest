/**
 * Migration v6: Add `jobs` (construction jobs queue) and `founderRole` to `fq_civilization`.
 * Milestone 5E-1 (Stage A):
 *
 * Guarantees:
 * - Idempotency: skips if SCHEMA_VERSION >= 6.
 * - Normalizes `fq_civilization` by initializing `jobs: []` (if missing/invalid)
 *   and `founderRole: null` (if missing/invalid).
 * - Preserves 100% of existing `buildings`, `villagers`, `grid`, `era`, `schemaVersion`, `lastUpdated`.
 * - Never touches unrelated storage keys (ECONOMY, QUESTS, DAILY_STATS, PROFILES, SETTINGS, CURRENT_SESSION, MUSIC_*).
 */

import { Migration } from './types.ts';
import { IStorageAdapter } from '../storageInterface.ts';
import { STORAGE_KEYS } from '../storageKeys.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
  sanitizeCivilizationState,
} from '../../core/civilization/civilizationState.ts';
import { isVillagerRole } from '../../ui/components/civilization/spriteRegistry.ts';

export const v6_constructionJobsSchema: Migration = {
  version: 6,
  description: 'Initialize construction jobs queue and founderRole on fq_civilization',
  async up(storage: IStorageAdapter): Promise<void> {
    const existingVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
    if (existingVersion !== undefined && existingVersion >= 6) {
      return;
    }

    const rawCiv = await storage.get<unknown>(STORAGE_KEYS.CIVILIZATION);
    let nextCiv: CivilizationState;

    const sanitized = sanitizeCivilizationState(rawCiv);
    if (sanitized) {
      nextCiv = {
        ...sanitized,
        jobs: Array.isArray(sanitized.jobs) ? sanitized.jobs : [],
        founderRole:
          sanitized.founderRole && isVillagerRole(sanitized.founderRole)
            ? sanitized.founderRole
            : null,
      };
    } else {
      nextCiv = createInitialCivilizationState();
    }

    await storage.setMultiple({
      [STORAGE_KEYS.SCHEMA_VERSION]: 6,
      [STORAGE_KEYS.CIVILIZATION]: nextCiv,
    });
  },
};
