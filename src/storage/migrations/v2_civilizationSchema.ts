/**
 * Migration v2: Add Civilization State & Initial 8x8 Map Grid.
 * Milestone 5B.2 & 5B.5 Stage 4a-2: Building Catalog & Storage Schema v2 Migration
 *
 * Ensures:
 * - 100% preservation of existing player progress (Economy, XP, Level, Profiles, DailyStats, Settings).
 * - Seeding of initial 8x8 Civilization state (64 unlocked cells across four 4x4 chunks, 0 buildings) for users without civilization data.
 * - Idempotency: Running multiple times does not duplicate or reset state.
 * - Atomic write of schema version and civilization state.
 */

import { Migration } from './types.ts';
import { IStorageAdapter } from '../storageInterface.ts';
import { STORAGE_KEYS } from '../storageKeys.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
  sanitizeCivilizationState,
} from '../../core/civilization/civilizationState.ts';

export const v2_civilizationSchema: Migration = {
  version: 2,
  description: 'Add Civilization state and initial 8x8 Map Grid for Phase 5B',
  async up(storage: IStorageAdapter): Promise<void> {
    const existingVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
    if (existingVersion !== undefined && existingVersion >= 2) {
      return; // Already migrated or newer
    }

    // Defensive check: If valid civilization data was already written (e.g. pre-existing test state),
    // preserve it. Only seed fresh initial state if absent or corrupt.
    const existingCiv = await storage.get<unknown>(STORAGE_KEYS.CIVILIZATION);
    const sanitizedCiv = sanitizeCivilizationState(existingCiv);

    const civilizationState: CivilizationState =
      sanitizedCiv ?? createInitialCivilizationState();

    // Atomic update of schema version and civilization state.
    // Leaves all v1 keys (ECONOMY, PROFILES, CURRENT_SESSION, DAILY_STATS, SETTINGS) untouched.
    await storage.setMultiple({
      [STORAGE_KEYS.SCHEMA_VERSION]: 2,
      [STORAGE_KEYS.CIVILIZATION]: civilizationState,
    });
  },
};
