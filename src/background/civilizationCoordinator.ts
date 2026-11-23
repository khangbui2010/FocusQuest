/**
 * CivilizationCoordinator for Focus Quest.
 * Milestone 5B.3: Background Coordinator, Typed Message Handlers & Atomic Civilization Transactions
 *
 * Single background authority for civilization state mutations:
 * - Atomic building construction and currency deduction transactions.
 * - Building removal and occupancy freeing.
 * - Orthogonal land expansion.
 * - Synchronous CoinBonus extraction provider for SessionCoordinator / RewardEngine.
 */

import { StorageManager } from '../storage/storageManager.ts';
import { AppError } from '../types/errors.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
  validateCivilizationState,
  sanitizeCivilizationState,
  CURRENT_CIVILIZATION_SCHEMA_VERSION,
} from '../core/civilization/civilizationState.ts';
import {
  BuildingInstance,
  isEraUnlocked,
} from '../core/civilization/buildingTypes.ts';
import { getBuildingDefinition } from '../core/civilization/buildingCatalog.ts';
import { GridMap } from '../core/civilization/gridMap.ts';
import {
  isValidCoordinate,
  isValidBuildingId,
} from '../core/civilization/placementValidator.ts';
import { extractCivilizationCoinBonuses } from '../core/civilization/civilizationBonusHelper.ts';
import { getVillagerBuffSummary } from '../core/civilization/villagerBuffs.ts';
import { getEffectiveMaxLevel } from '../core/civilization/eraRules.ts';
import {
  applyBuildingUpgrade,
  calculateBuildingDemolishRefund,
  canPlaceAnotherBuildingOfCategory,
  evaluateBuildingUpgrade,
} from '../core/civilization/buildingUpgrade.ts';
import {
  PlaceBuildingPayload,
  RemoveBuildingPayload,
  UpgradeBuildingPayload,
  ExpandLandPayload,
  RecruitVillagerPayload,
  PlaceBuildingResponseData,
  RemoveBuildingResponseData,
  UpgradeBuildingResponseData,
  ExpandLandResponseData,
  RecruitVillagerResponseData,
} from '../types/messages.ts';
import {
  VILLAGE_CAVE_DEFINITION_ID,
  Villager,
  applyRecruitment,
  evaluateRecruitment,
  findVillageCave,
} from '../core/civilization/villager.ts';
import { isVillagerRole } from '../ui/components/civilization/spriteRegistry.ts';
import { CoinBonus } from '../types/economy.ts';
import { GridCoordinate } from '../core/civilization/types.ts';
import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../core/civilization/constants.ts';
import { evaluateExpansion } from '../core/civilization/landExpansion.ts';
import { calculatePlayerLevel } from '../core/economy/levelSystem.ts';
import { calculateLifetimeFocusMinutes } from '../core/stats/statsAggregator.ts';
export { calculateLifetimeFocusMinutes };

export class CivilizationCoordinator {
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private cachedBonuses: readonly CoinBonus[] = [];

  constructor(private storage: StorageManager) {}

  /**
   * Rehydrates the active CoinBonus cache from storage.
   * Ensures that subsequent synchronous calls to getActiveCoinBonuses()
   * are accurate and consistent. Guarded against concurrent re-initialization calls.
   */
  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const state = await this.getCivilizationState();
        this.cachedBonuses = extractCivilizationCoinBonuses(state.buildings, state.villagers);
        this.isInitialized = true;
      })().finally(() => {
        this.initPromise = null;
      });
    }
    return this.initPromise;
  }

  /**
   * Synchronous provider function passed to SessionCoordinator.
   * Returns currently active building CoinBonuses.
   */
  getActiveCoinBonuses(): readonly CoinBonus[] {
    return this.cachedBonuses;
  }

  /**
   * Retrieves the current authoritative CivilizationState from storage.
   * Replaces corrupt or missing data with a sanitized initial state
   * strictly via executeCivilizationTransaction to serialize safely under mutex.
   */
  async getCivilizationState(): Promise<CivilizationState> {
    const raw = await this.storage.getCivilizationState();
    const sanitized = sanitizeCivilizationState(raw);
    if (!sanitized) {
      // Re-read and heal strictly inside executeCivilizationTransaction critical section
      const tx = await this.storage.executeCivilizationTransaction(({ civilization }) => {
        // ctx.civilization is fresh and already sanitized under lock.
        // If storage was corrupt, executeCivilizationTransaction automatically writes finalCivilization.
        return {
          result: civilization,
        };
      });
      this.cachedBonuses = extractCivilizationCoinBonuses(
        tx.civilization.buildings,
        tx.civilization.villagers
      );
      return tx.civilization;
    }
    return sanitized;
  }

  /**
   * Executes an atomic building purchase and construction transaction.
   * All steps (reading prerequisites, unlock verification, coin sufficiency,
   * placement/collision validation, candidate computation, and storage commit)
   * execute entirely inside executeCivilizationTransaction guarded by StorageMutex.
   * Lost update impossible: every concurrent request receives fresh locked state.
   */
  async placeBuilding(payload: PlaceBuildingPayload): Promise<PlaceBuildingResponseData> {
    if (!payload || typeof payload !== 'object') {
      throw new AppError('CIV_INVALID_PLACE_PAYLOAD', 'Invalid payload: expected object for PLACE_BUILDING');
    }

    if (typeof payload.buildingDefinitionId !== 'string' || !payload.buildingDefinitionId) {
      throw new AppError('CIV_INVALID_BUILDING_DEF_ID', 'PLACE_BUILDING requires a valid buildingDefinitionId');
    }

    if (!isValidCoordinate(payload.position)) {
      throw new AppError('CIV_INVALID_POSITION', 'PLACE_BUILDING requires valid position coordinates');
    }

    const definition = getBuildingDefinition(payload.buildingDefinitionId);
    if (!definition) {
      throw new AppError(
        'CIV_UNKNOWN_BUILDING_DEF',
        `Unknown building definition: "${payload.buildingDefinitionId}"`,
        { buildingId: payload.buildingDefinitionId }
      );
    }

    const tx = await this.storage.executeCivilizationTransaction<BuildingInstance>(
      ({ economy, civilization, dailyStats, gridMap }) => {
        // 1. Check player level requirement against fresh locked state (totalXP is single source of truth)
        const playerLevel = Math.min(
          economy.level ?? calculatePlayerLevel(economy.totalXP),
          calculatePlayerLevel(economy.totalXP)
        );
        if (playerLevel < definition.unlockRequirements.minPlayerLevel) {
          throw new AppError(
            'CIV_REQUIRES_LEVEL',
            `Building "${definition.name}" requires Player Level ${definition.unlockRequirements.minPlayerLevel} (current: ${playerLevel})`,
            {
              buildingName: definition.name,
              requiredLevel: definition.unlockRequirements.minPlayerLevel,
              currentLevel: playerLevel,
            }
          );
        }

        // 2. Check lifetime focus minutes requirement
        const lifetimeMinutes = calculateLifetimeFocusMinutes(dailyStats);
        if (lifetimeMinutes < definition.unlockRequirements.minTotalFocusMinutes) {
          throw new AppError(
            'CIV_REQUIRES_FOCUS_MINUTES',
            `Building "${definition.name}" requires ${definition.unlockRequirements.minTotalFocusMinutes} lifetime focus minutes (current: ${lifetimeMinutes})`,
            {
              buildingName: definition.name,
              requiredMinutes: definition.unlockRequirements.minTotalFocusMinutes,
              currentMinutes: lifetimeMinutes,
            }
          );
        }

        // 3. Check civilization era requirement
        if (!isEraUnlocked(civilization.era, definition.unlockRequirements.minEra)) {
          throw new AppError(
            'CIV_REQUIRES_ERA',
            `Building "${definition.name}" requires Era ${definition.unlockRequirements.minEra} (current: ${civilization.era})`,
            {
              buildingName: definition.name,
              ...(definition.unlockRequirements.minEra !== undefined
                ? { requiredEra: definition.unlockRequirements.minEra }
                : {}),
              currentEra: civilization.era,
            }
          );
        }

        // 4. Check per-building placement limit (1 for Meditation Cave, 4 for Economy buildings)
        const limitCheck = canPlaceAnotherBuildingOfCategory(definition, civilization.buildings);
        if (!limitCheck.allowed) {
          const isCave = definition.id === VILLAGE_CAVE_DEFINITION_ID;
          throw new AppError(
            isCave ? 'CIV_VILLAGE_CAVE_LIMIT_REACHED' : 'CIV_ECONOMY_BUILDING_LIMIT_REACHED',
            `Build Limit reached for "${definition.name}" (${limitCheck.currentCount}/${limitCheck.limit} placed).`,
            {
              buildingName: definition.name,
              limit: limitCheck.limit ?? 0,
              currentCount: limitCheck.currentCount,
            }
          );
        }

        // 5. Check currency sufficiency against fresh locked economy
        if (economy.focusCoins < definition.baseCost) {
          throw new AppError(
            'CIV_INSUFFICIENT_BUILDING_COINS',
            `Insufficient coins: building "${definition.name}" costs ${definition.baseCost} Coins (current balance: ${economy.focusCoins})`,
            {
              buildingName: definition.name,
              cost: definition.baseCost,
              balance: economy.focusCoins,
            }
          );
        }

        // 5. Check placement & collision against fresh locked gridMap
        const placementValidation = gridMap.canPlaceBuilding(payload.position, definition.footprint);
        if (!placementValidation.isValid) {
          const reason = placementValidation.reason || 'placement rejected';
          throw new AppError(
            'CIV_CANNOT_PLACE_BUILDING',
            `Cannot place building: ${reason}`,
            { reason }
          );
        }

        // 6. Generate unique instance ID and register occupancy on gridMap
        const instanceId = `bld_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const placeResult = gridMap.placeBuilding(instanceId, payload.position, definition.footprint);
        if (!placeResult.success) {
          const reason = placeResult.reason || 'unknown error';
          throw new AppError(
            'CIV_GRID_PLACEMENT_FAILED',
            `Grid placement failed: ${reason}`,
            { reason }
          );
        }

        const newInstance: BuildingInstance = {
          id: instanceId,
          definitionId: definition.id,
          position: payload.position,
          level: 1,
          placedAt: Date.now(),
        };

        const nextCivilization: CivilizationState = {
          schemaVersion: CURRENT_CIVILIZATION_SCHEMA_VERSION,
          era: civilization.era,
          grid: gridMap.toSnapshot(),
          buildings: [...civilization.buildings, newInstance],
          villagers: civilization.villagers ?? [],
          lastUpdated: Date.now(),
        };

        // Pre-calculate CoinBonuses before storage commit so onCommitted is a pure, zero-throw assignment
        const nextBonuses = extractCivilizationCoinBonuses(
          nextCivilization.buildings,
          nextCivilization.villagers
        );

        return {
          result: newInstance,
          nextCivilization,
          deductCoins: definition.baseCost,
          onCommitted: () => {
            this.cachedBonuses = nextBonuses;
          },
        };
      }
    );

    return {
      building: tx.result,
      civilizationState: tx.civilization,
      economy: tx.economy,
    };
  }

  /**
   * Removes a building instance from the map:
   * 1. Finds instance by ID.
   * 2. Frees all occupied cells on the GridMap.
   * 3. Removes instance from CivilizationState.buildings.
   * 4. Updates stored state under StorageMutex and refreshes CoinBonus cache.
   */
  async removeBuilding(payload: RemoveBuildingPayload): Promise<RemoveBuildingResponseData> {
    if (!payload || !isValidBuildingId(payload.buildingInstanceId)) {
      throw new AppError(
        'CIV_INVALID_BUILDING_INSTANCE_ID',
        'REMOVE_BUILDING requires a valid buildingInstanceId'
      );
    }

    const tx = await this.storage.executeCivilizationTransaction<{
      removedBuildingId: string;
      refundedCoins: number;
    }>(({ civilization, gridMap }) => {
      const instance = civilization.buildings.find((b) => b.id === payload.buildingInstanceId);
      if (!instance) {
        throw new AppError(
          'CIV_BUILDING_NOT_FOUND',
          `Building instance "${payload.buildingInstanceId}" not found`,
          { instanceId: payload.buildingInstanceId }
        );
      }

      const villagerCount = civilization.villagers?.length ?? 0;
      if (instance.definitionId === VILLAGE_CAVE_DEFINITION_ID && villagerCount > 0) {
        throw new AppError(
          'CIV_CAVE_HAS_VILLAGERS',
          `Cannot demolish Meditation Cave while ${villagerCount} villagers live in the village.`,
          { count: villagerCount }
        );
      }

      const removalResult = gridMap.removeBuilding(payload.buildingInstanceId);
      if (!removalResult.success) {
        const reason = removalResult.reason || 'unknown';
        throw new AppError(
          'CIV_BUILDING_REMOVAL_FAILED',
          `Building removal failed: ${reason}`,
          { reason }
        );
      }

      const definition = getBuildingDefinition(instance.definitionId);
      const refundCoins = calculateBuildingDemolishRefund(definition, instance.level);

      const nextBuildings = civilization.buildings.filter((b) => b.id !== payload.buildingInstanceId);
      const nextCivilization: CivilizationState = {
        ...civilization,
        grid: gridMap.toSnapshot(),
        buildings: nextBuildings,
        villagers: civilization.villagers ?? [],
        lastUpdated: Date.now(),
      };

      // Pre-calculate CoinBonuses before storage commit so onCommitted is a pure, zero-throw assignment
      const nextBonuses = extractCivilizationCoinBonuses(
        nextBuildings,
        nextCivilization.villagers
      );

      return {
        result: {
          removedBuildingId: payload.buildingInstanceId,
          refundedCoins: refundCoins,
        },
        nextCivilization,
        refundCoins,
        onCommitted: () => {
          this.cachedBonuses = nextBonuses;
        },
      };
    });

    return {
      removedBuildingId: tx.result.removedBuildingId,
      civilizationState: tx.civilization,
      economy: tx.economy,
      refundedCoins: tx.result.refundedCoins,
    };
  }

  /**
   * Upgrades an existing building instance by +1 level atomically under StorageMutex:
   * - Validates building existence, expectedLevel concurrency token, category upgradeability,
   *   max level, unlocked era, Player Level gate, and Coins sufficiency.
   * - Deducts Coins and updates CivilizationState in a single storage transaction.
   * - Refreshes CoinBonus cache via synchronous onCommitted hook.
   */
  async upgradeBuilding(payload: UpgradeBuildingPayload): Promise<UpgradeBuildingResponseData> {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !isValidBuildingId(payload.buildingId) ||
      typeof payload.expectedLevel !== 'number' ||
      !Number.isInteger(payload.expectedLevel) ||
      payload.expectedLevel < 1
    ) {
      throw new AppError(
        'CIV_INVALID_UPGRADE_PAYLOAD',
        'UPGRADE_BUILDING requires valid buildingId and expectedLevel.'
      );
    }

    const tx = await this.storage.executeCivilizationTransaction<{
      building: BuildingInstance;
      cost: number;
    }>(({ economy, civilization }) => {
      const instance = civilization.buildings.find((b) => b.id === payload.buildingId);
      if (!instance) {
        throw new AppError(
          'BUILDING_NOT_FOUND',
          `Building "${payload.buildingId}" not found.`,
          { buildingId: payload.buildingId }
        );
      }

      const definition = getBuildingDefinition(instance.definitionId);
      if (!definition) {
        throw new AppError(
          'BUILDING_NOT_FOUND',
          `Building "${payload.buildingId}" not found.`,
          { buildingId: payload.buildingId }
        );
      }

      const playerLevel = Math.min(
        economy.level ?? calculatePlayerLevel(economy.totalXP),
        calculatePlayerLevel(economy.totalXP)
      );

      const buffSummary = getVillagerBuffSummary(civilization.villagers);
      const effectiveMaxLevel = getEffectiveMaxLevel(definition, civilization.era);
      const evalResult = evaluateBuildingUpgrade({
        instance,
        definition,
        currentEra: civilization.era,
        playerLevel,
        playerCoins: economy.focusCoins,
        expectedLevel: payload.expectedLevel,
        upgradeDiscountRate: buffSummary.upgradeDiscountRate,
      });

      if (!evalResult.canUpgrade) {
        switch (evalResult.reason) {
          case 'LEVEL_MISMATCH':
            throw new AppError(
              'BUILDING_LEVEL_MISMATCH',
              `Building level changed concurrently (expected Lv. ${payload.expectedLevel}, current Lv. ${instance.level}). Please try again.`,
              {
                buildingId: instance.id,
                expectedLevel: payload.expectedLevel,
                currentLevel: instance.level,
              }
            );
          case 'NON_UPGRADEABLE_CATEGORY':
            throw new AppError(
              'CIV_UPGRADE_NOT_SUPPORTED',
              `Building "${definition.name}" keeps its fixed effect and cannot be upgraded.`,
              { buildingName: definition.name }
            );
          case 'BUILDING_MAX_LEVEL':
            throw new AppError(
              'BUILDING_MAX_LEVEL',
              `Building "${definition.name}" is already at max level (Lv. ${effectiveMaxLevel}).`,
              { buildingName: definition.name, maxLevel: effectiveMaxLevel }
            );
          case 'ERA_LOCKED':
            throw new AppError(
              'CIV_UPGRADE_ERA_LOCKED',
              `Upgrading "${definition.name}" requires Era ${definition.era}.`,
              { buildingName: definition.name, requiredEra: definition.era }
            );
          case 'PLAYER_LEVEL_REQUIRED':
            throw new AppError(
              'UPGRADE_PLAYER_LEVEL_REQUIRED',
              `Upgrading "${definition.name}" requires Player Level ${evalResult.requiredPlayerLevel} (current: Lv. ${playerLevel}).`,
              {
                buildingName: definition.name,
                requiredLevel: evalResult.requiredPlayerLevel,
                currentLevel: playerLevel,
              }
            );
          case 'INSUFFICIENT_COINS':
            throw new AppError(
              'CIV_INSUFFICIENT_BUILDING_COINS',
              `Insufficient coins: building "${definition.name}" costs ${evalResult.cost} Coins (current balance: ${economy.focusCoins})`,
              {
                buildingName: definition.name,
                cost: evalResult.cost,
                balance: economy.focusCoins,
              }
            );
          default:
            throw new AppError(
              'BUILDING_NOT_FOUND',
              `Building "${payload.buildingId}" not found.`,
              { buildingId: payload.buildingId }
            );
        }
      }

      const upgradedInstance = applyBuildingUpgrade(instance);
      const nextBuildings = civilization.buildings.map((b) =>
        b.id === instance.id ? upgradedInstance : b
      );
      const nextCivilization: CivilizationState = {
        ...civilization,
        buildings: nextBuildings,
        villagers: civilization.villagers ?? [],
        lastUpdated: Date.now(),
      };

      const nextBonuses = extractCivilizationCoinBonuses(
        nextBuildings,
        nextCivilization.villagers
      );

      return {
        result: {
          building: upgradedInstance,
          cost: evalResult.cost,
        },
        nextCivilization,
        deductCoins: evalResult.cost,
        onCommitted: () => {
          this.cachedBonuses = nextBonuses;
        },
      };
    });

    return {
      civilizationState: tx.civilization,
      economy: tx.economy,
      building: tx.result.building,
      newLevel: tx.result.building.level,
      cost: tx.result.cost,
    };
  }

  /**
   * Expands territory by unlocking a single adjacent 4x4 chunk at the chosen origin:
   * - Requires explicit 4x4-aligned origin coordinate (no direction/slotIndex fallback).
   * - Atomically verifies Player Level gate, Focus Coins cost, and GridMap adjacency inside StorageMutex.
   * - Deducts Focus Coins only when chunk expansion & storage commit succeed.
   */
  async expandLand(payload: ExpandLandPayload): Promise<ExpandLandResponseData> {
    if (!payload || typeof payload !== 'object') {
      throw new AppError('CIV_INVALID_EXPAND_PAYLOAD', 'EXPAND_LAND requires payload object');
    }

    const rawPayload = payload as unknown as Record<string, unknown>;
    if ('direction' in rawPayload || 'slotIndex' in rawPayload) {
      throw new AppError(
        'CIV_EXPAND_UNSUPPORTED_FIELDS',
        'EXPAND_LAND requires origin coordinates only; directional expansion is no longer supported'
      );
    }

    if (!isValidCoordinate(payload.origin)) {
      throw new AppError('CIV_INVALID_EXPAND_ORIGIN_TYPE', 'EXPAND_LAND requires valid origin coordinates');
    }

    if (
      payload.origin.x % CHUNK_WIDTH !== 0 ||
      payload.origin.y % CHUNK_HEIGHT !== 0
    ) {
      throw new AppError(
        'CIV_INVALID_EXPAND_ORIGIN_GRID',
        `Land expansion failed: INVALID_ORIGIN (origin must align to ${CHUNK_WIDTH}x${CHUNK_HEIGHT} chunk grid)`
      );
    }

    const tx = await this.storage.executeCivilizationTransaction<{
      origin: GridCoordinate;
      cost: number;
    }>(({ economy, civilization, gridMap }) => {
      // 1. Evaluate Player Level & Coin cost from fresh locked state
      const playerLevel = Math.min(
        economy.level ?? calculatePlayerLevel(economy.totalXP),
        calculatePlayerLevel(economy.totalXP)
      );
      const buffSummary = getVillagerBuffSummary(civilization.villagers);
      const evalResult = evaluateExpansion({
        chunkCount: civilization.grid.chunks.length,
        playerLevel,
        coins: economy.focusCoins,
        discountRate: buffSummary.expansionDiscountRate,
      });

      if (!evalResult.canExpand) {
        if (evalResult.reason === 'LEVEL_TOO_LOW') {
          throw new AppError(
            'CIV_EXPAND_REQUIRES_LEVEL',
            `Land expansion #${evalResult.purchaseIndex} requires Player Level ${evalResult.requiredLevel} (current: ${playerLevel})`,
            {
              step: evalResult.purchaseIndex,
              requiredLevel: evalResult.requiredLevel,
              currentLevel: playerLevel,
            }
          );
        }
        throw new AppError(
          'CIV_INSUFFICIENT_EXPAND_COINS',
          `Insufficient coins: chunk expansion #${evalResult.purchaseIndex} costs ${evalResult.cost} Coins (current balance: ${economy.focusCoins})`,
          {
            step: evalResult.purchaseIndex,
            cost: evalResult.cost,
            balance: economy.focusCoins,
          }
        );
      }

      // 2. Validate geometry & adjacency on GridMap BEFORE deducting Coins
      const expResult = gridMap.expandChunk(payload.origin);
      if (!expResult.success || !expResult.chunk) {
        const reason = expResult.reason || 'cannot expand chunk';
        throw new AppError(
          'CIV_LAND_EXPANSION_FAILED',
          `Land expansion failed: ${reason}`,
          { reason }
        );
      }

      const nextCivilization: CivilizationState = {
        ...civilization,
        grid: gridMap.toSnapshot(),
        villagers: civilization.villagers ?? [],
        lastUpdated: Date.now(),
      };

      return {
        result: {
          origin: expResult.chunk.origin,
          cost: evalResult.cost,
        },
        nextCivilization,
        deductCoins: evalResult.cost,
      };
    });

    return {
      newChunk: tx.result.origin,
      civilizationState: tx.civilization,
      economy: tx.economy,
      cost: tx.result.cost,
    };
  }

  /**
   * Recruits 1 villager into the active Meditation Cave atomically under StorageMutex:
   * - Validates role (`elder | crafter | woodworker`), Cave presence, capacity (`2 * cave.level`),
   *   and Focus Coins (`Math.round(40 * 1.35^currentCount)`).
   * - Deducts Coins and persists the new Villager `{ id, role, recruitedAt }` without coordinates.
   * - Zero side effects on XP, CoinBonuses, dailyStats, or quests.
   */
  async recruitVillager(payload: RecruitVillagerPayload): Promise<RecruitVillagerResponseData> {
    if (!payload || typeof payload !== 'object' || !isVillagerRole(payload.role)) {
      throw new AppError(
        'CIV_INVALID_VILLAGER_ROLE',
        'RECRUIT_VILLAGER requires a valid villager role (elder | crafter | woodworker).',
        { role: payload && typeof payload === 'object' ? String((payload as { role?: unknown }).role) : '' }
      );
    }

    const role = payload.role;

    const tx = await this.storage.executeCivilizationTransaction<{
      villager: Villager;
      cost: number;
    }>(({ economy, civilization }) => {
      const currentVillagers = civilization.villagers ?? [];
      const caveBuilding = findVillageCave(civilization.buildings);
      const evalResult = evaluateRecruitment({
        caveBuilding,
        villagers: currentVillagers,
        playerCoins: economy.focusCoins,
        role,
      });

      if (!evalResult.canRecruit) {
        switch (evalResult.reason) {
          case 'CIV_NO_VILLAGE_CAVE':
            throw new AppError(
              'CIV_NO_VILLAGE_CAVE',
              'You need a Meditation Cave to recruit villagers.'
            );
          case 'CIV_VILLAGER_CAPACITY_REACHED':
            throw new AppError(
              'CIV_VILLAGER_CAPACITY_REACHED',
              `Village capacity reached (${evalResult.currentCount}/${evalResult.capacity}). Upgrade your Meditation Cave to house more villagers.`,
              {
                currentCount: evalResult.currentCount,
                capacity: evalResult.capacity,
              }
            );
          case 'CIV_VILLAGER_INSUFFICIENT_COINS':
            throw new AppError(
              'CIV_VILLAGER_INSUFFICIENT_COINS',
              `Insufficient coins: recruiting a villager costs ${evalResult.cost} Coins (current balance: ${economy.focusCoins}).`,
              {
                cost: evalResult.cost,
                balance: economy.focusCoins,
              }
            );
          default:
            throw new AppError(
              'CIV_INVALID_VILLAGER_ROLE',
              'RECRUIT_VILLAGER requires a valid villager role.'
            );
        }
      }

      const now = Date.now();
      const villager: Villager = {
        id: `vil_${now}_${Math.random().toString(36).slice(2, 8)}`,
        role,
        recruitedAt: now,
      };
      const nextVillagers = applyRecruitment(currentVillagers, villager);
      const nextCivilization: CivilizationState = {
        ...civilization,
        villagers: nextVillagers,
        lastUpdated: now,
      };

      const nextBonuses = extractCivilizationCoinBonuses(
        nextCivilization.buildings,
        nextVillagers
      );

      return {
        result: {
          villager,
          cost: evalResult.cost,
        },
        nextCivilization,
        deductCoins: evalResult.cost,
        onCommitted: () => {
          this.cachedBonuses = nextBonuses;
        },
      };
    });

    return {
      villager: tx.result.villager,
      civilizationState: tx.civilization,
      economy: tx.economy,
      cost: tx.result.cost,
    };
  }
}
