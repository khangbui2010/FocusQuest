/**
 * Migration v4: Villagers Schema, 3x3 Meditation Cave Migration & 1-Cave Cap.
 * Milestone Villager V2:
 *
 * Ensures:
 * - Idempotency: skips if SCHEMA_VERSION >= 4.
 * - Preserves CivilizationState.schemaVersion = 2 while adding `villagers: []` on legacy states.
 * - Enforces MAX_VILLAGE_CAVES = 1: if >1 Cave exists, keeps the highest-level Cave
 *   (tie-break: earliest `placedAt`, then array order) and refunds 100% of total Coins
 *   spent (`calculateTotalBuildingCoinsSpent`) for removed duplicate Caves.
 * - Expands the kept Meditation Cave from 2x2 to 3x3 in the reconstructed GridMap if all
 *   9 cells are unlocked and unoccupied by other buildings; otherwise removes the Cave,
 *   refunds 100% of total Coins spent on it, and keeps `villagers: []`.
 * - Never touches unrelated keys (PROFILES, QUESTS, DAILY_STATS, SETTINGS, CURRENT_SESSION, MUSIC_*).
 */

import { Migration } from './types.ts';
import { IStorageAdapter } from '../storageInterface.ts';
import { STORAGE_KEYS } from '../storageKeys.ts';
import { GridMap } from '../../core/civilization/gridMap.ts';
import { getBuildingDefinition } from '../../core/civilization/buildingCatalog.ts';
import { calculateTotalBuildingCoinsSpent } from '../../core/civilization/buildingUpgrade.ts';
import { BuildingInstance } from '../../core/civilization/buildingTypes.ts';
import { GridMapSnapshot } from '../../core/civilization/types.ts';
import {
  CivilizationState,
  CURRENT_CIVILIZATION_SCHEMA_VERSION,
  createInitialCivilizationState,
  isValidEra,
} from '../../core/civilization/civilizationState.ts';
import {
  VILLAGE_CAVE_DEFINITION_ID,
  Villager,
  getVillagerCapacity,
} from '../../core/civilization/villager.ts';
import { isVillagerRole } from '../../ui/components/civilization/spriteRegistry.ts';
import { PlayerEconomy } from '../../types/economy.ts';

interface RawCivilizationCandidate {
  schemaVersion?: unknown;
  era?: unknown;
  grid?: GridMapSnapshot;
  buildings?: unknown;
  villagers?: unknown;
  lastUpdated?: unknown;
}

function sanitizeExistingVillagers(
  rawVillagers: unknown,
  maxCapacity: number
): readonly Villager[] {
  if (!Array.isArray(rawVillagers) || maxCapacity <= 0) {
    return [];
  }
  const seenIds = new Set<string>();
  const valid: Villager[] = [];
  for (const item of rawVillagers) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<Villager>;
    if (
      typeof candidate.id !== 'string' ||
      candidate.id.trim().length === 0 ||
      seenIds.has(candidate.id) ||
      !isVillagerRole(candidate.role) ||
      typeof candidate.recruitedAt !== 'number' ||
      !Number.isFinite(candidate.recruitedAt) ||
      candidate.recruitedAt < 0
    ) {
      continue;
    }
    seenIds.add(candidate.id);
    valid.push({
      id: candidate.id,
      role: candidate.role,
      recruitedAt: candidate.recruitedAt,
    });
    if (valid.length >= maxCapacity) {
      break;
    }
  }
  return valid;
}

export const v4_villagersSchema: Migration = {
  version: 4,
  description: 'Add villagers state, upgrade Meditation Cave to 3x3, and enforce 1-Cave cap',
  async up(storage: IStorageAdapter): Promise<void> {
    const existingVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
    if (existingVersion !== undefined && existingVersion >= 4) {
      return;
    }

    const rawCiv = await storage.get<unknown>(STORAGE_KEYS.CIVILIZATION);
    let refundTotal = 0;
    let nextCiv: CivilizationState;

    const candidate =
      rawCiv && typeof rawCiv === 'object' && !Array.isArray(rawCiv)
        ? (rawCiv as RawCivilizationCandidate)
        : null;

    let reconstructedMap: GridMap | null = null;
    if (candidate && candidate.grid && Array.isArray(candidate.buildings)) {
      try {
        reconstructedMap = GridMap.fromSnapshot(candidate.grid);
      } catch {
        reconstructedMap = null;
      }
    }

    if (candidate && reconstructedMap && Array.isArray(candidate.buildings)) {
      const buildings = candidate.buildings as BuildingInstance[];
      const caveDef = getBuildingDefinition(VILLAGE_CAVE_DEFINITION_ID);

      const indexedCaves = buildings
        .map((instance, index) => ({ instance, index }))
        .filter((entry) => entry.instance?.definitionId === VILLAGE_CAVE_DEFINITION_ID);

      let keptCaveId: string | null = null;
      let keptCaveInstance: BuildingInstance | undefined;
      const removedCaveIds = new Set<string>();

      if (indexedCaves.length > 0 && caveDef) {
        const sortedCaves = [...indexedCaves].sort((a, b) => {
          if (b.instance.level !== a.instance.level) {
            return b.instance.level - a.instance.level;
          }
          const aPlaced = typeof a.instance.placedAt === 'number' ? a.instance.placedAt : 0;
          const bPlaced = typeof b.instance.placedAt === 'number' ? b.instance.placedAt : 0;
          if (aPlaced !== bPlaced) {
            return aPlaced - bPlaced;
          }
          return a.index - b.index;
        });

        const primary = sortedCaves[0].instance;

        // 1. Remove & 100%-refund all duplicate Caves beyond MAX_VILLAGE_CAVES (1)
        for (let i = 1; i < sortedCaves.length; i++) {
          const extraCave = sortedCaves[i].instance;
          removedCaveIds.add(extraCave.id);
          reconstructedMap.removeBuilding(extraCave.id);
          refundTotal += calculateTotalBuildingCoinsSpent(caveDef, extraCave.level);
        }

        // 2. Remove kept Cave's old footprint (e.g. legacy 2x2) and test 3x3 expansion at same anchor
        reconstructedMap.removeBuilding(primary.id);
        const canExpand = reconstructedMap.canPlaceBuilding(
          primary.position,
          caveDef.footprint,
          primary.id
        );

        if (canExpand.isValid) {
          const placeRes = reconstructedMap.placeBuilding(
            primary.id,
            primary.position,
            caveDef.footprint
          );
          if (placeRes.success) {
            keptCaveId = primary.id;
            keptCaveInstance = primary;
          } else {
            removedCaveIds.add(primary.id);
            refundTotal += calculateTotalBuildingCoinsSpent(caveDef, primary.level);
          }
        } else {
          removedCaveIds.add(primary.id);
          refundTotal += calculateTotalBuildingCoinsSpent(caveDef, primary.level);
        }
      }

      const finalBuildings = buildings.filter((b) => !removedCaveIds.has(b.id));
      const villagers =
        keptCaveId && keptCaveInstance
          ? sanitizeExistingVillagers(candidate.villagers, getVillagerCapacity(keptCaveInstance))
          : [];

      const preservedSchemaVersion =
        typeof candidate.schemaVersion === 'number' &&
        Number.isInteger(candidate.schemaVersion) &&
        candidate.schemaVersion >= 1
          ? candidate.schemaVersion
          : CURRENT_CIVILIZATION_SCHEMA_VERSION;

      nextCiv = {
        schemaVersion: preservedSchemaVersion,
        era: isValidEra(candidate.era) ? candidate.era : 'STONE_AGE',
        grid: reconstructedMap.toSnapshot(),
        buildings: finalBuildings,
        villagers,
        lastUpdated:
          typeof candidate.lastUpdated === 'number' && Number.isFinite(candidate.lastUpdated)
            ? candidate.lastUpdated
            : Date.now(),
      };
    } else {
      nextCiv = createInitialCivilizationState();
    }

    const updates: Record<string, unknown> = {
      [STORAGE_KEYS.SCHEMA_VERSION]: 4,
      [STORAGE_KEYS.CIVILIZATION]: nextCiv,
    };

    if (refundTotal > 0) {
      const rawEconomy = await storage.get<Partial<PlayerEconomy>>(STORAGE_KEYS.ECONOMY);
      const currentCoins =
        rawEconomy && typeof rawEconomy.focusCoins === 'number' && Number.isFinite(rawEconomy.focusCoins)
          ? rawEconomy.focusCoins
          : 0;
      const currentXP =
        rawEconomy && typeof rawEconomy.totalXP === 'number' && Number.isFinite(rawEconomy.totalXP)
          ? rawEconomy.totalXP
          : 0;
      const currentLevel =
        rawEconomy && typeof rawEconomy.level === 'number' && Number.isInteger(rawEconomy.level) && rawEconomy.level >= 1
          ? rawEconomy.level
          : 1;

      updates[STORAGE_KEYS.ECONOMY] = {
        focusCoins: currentCoins + refundTotal,
        totalXP: currentXP,
        level: currentLevel,
      };
    }

    await storage.setMultiple(updates);
  },
};
