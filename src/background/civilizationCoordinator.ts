/**
 * CivilizationCoordinator for Focus Quest.
 * Milestone 5B.3 + 5E-1 Stage A:
 * Background Coordinator, Typed Message Handlers, Construction Jobs & Atomic Transactions.
 *
 * Single background authority for civilization state mutations:
 * - Atomic building construction / queued jobs and currency deduction transactions.
 * - Building removal / job cancellation and occupancy freeing.
 * - Orthogonal land expansion (Focus clearing jobs).
 * - Villager recruitment & FIFO job scheduling.
 * - Synchronous CoinBonus extraction provider for SessionCoordinator / RewardEngine.
 */

import { StorageManager } from '../storage/storageManager.ts';
import { AppError } from '../types/errors.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
  sanitizeCivilizationState,
  CURRENT_CIVILIZATION_SCHEMA_VERSION,
} from '../core/civilization/civilizationState.ts';
import {
  BuildingInstance,
  isEraUnlocked,
} from '../core/civilization/buildingTypes.ts';
import { getBuildingDefinition } from '../core/civilization/buildingCatalog.ts';
import {
  isValidCoordinate,
  isValidBuildingId,
} from '../core/civilization/placementValidator.ts';
import { extractCivilizationCoinBonuses } from '../core/civilization/civilizationBonusHelper.ts';
import { getVillagerBuffSummary } from '../core/civilization/villagerBuffs.ts';
import { getEffectiveMaxLevel } from '../core/civilization/eraRules.ts';
import {
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
  CancelConstructionJobPayload,
  SelectFounderPayload,
  PlaceBuildingResponseData,
  RemoveBuildingResponseData,
  UpgradeBuildingResponseData,
  ExpandLandResponseData,
  RecruitVillagerResponseData,
  CancelConstructionJobResponseData,
  SelectFounderResponseData,
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
import {
  BUILDING_DEMOLISH_REFUND_RATE,
  CHUNK_WIDTH,
  CHUNK_HEIGHT,
} from '../core/civilization/constants.ts';
import { evaluateExpansion } from '../core/civilization/landExpansion.ts';
import { calculatePlayerLevel } from '../core/economy/levelSystem.ts';
import { calculateLifetimeFocusMinutes } from '../core/stats/statsAggregator.ts';
import {
  ConstructionJob,
  EXPAND_JOB_SPEC,
  assignJobsFifo,
  getClearingOrigins,
  getExpandJobAtOrigin,
  getPlaceJobForBuilding,
  getPlaceJobSpec,
  getTotalVillagerCount,
  getUpgradeJobSpec,
  getUpgradeJobsForBuilding,
} from '../core/civilization/jobs.ts';
export { calculateLifetimeFocusMinutes };

export class CivilizationCoordinator {
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private cachedBonuses: readonly CoinBonus[] = [];

  constructor(private storage: StorageManager) {}

  private extractBonusesFromState(state: CivilizationState): readonly CoinBonus[] {
    return extractCivilizationCoinBonuses(
      state.buildings,
      state.villagers,
      state.jobs,
      state.founderRole
    );
  }

  /**
   * Synchronously updates the cached CoinBonus list after external mutations
   * (e.g., SessionCoordinator completing construction jobs on session finish).
   */
  refreshCachedBonuses(civState: CivilizationState): void {
    this.cachedBonuses = this.extractBonusesFromState(civState);
  }

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
        this.cachedBonuses = this.extractBonusesFromState(state);
        this.isInitialized = true;
      })().finally(() => {
        this.initPromise = null;
      });
    }
    return this.initPromise;
  }

  /**
   * Synchronous provider function passed to SessionCoordinator.
   * Returns currently active building + villager CoinBonuses.
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
        return {
          result: civilization,
        };
      });
      this.cachedBonuses = this.extractBonusesFromState(tx.civilization);
      return tx.civilization;
    }
    return sanitized;
  }

  /**
   * Executes an atomic building purchase and placement/construction job transaction.
   * - Campfire (0 crew, 0s) finishes instantly with no job created.
   * - All other buildings enqueue a 'place' ConstructionJob (UNDER_CONSTRUCTION until finished).
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

    const tx = await this.storage.executeCivilizationTransaction<{
      building: BuildingInstance;
      job?: ConstructionJob;
    }>(({ economy, civilization, dailyStats, gridMap }) => {
      // 1. Check player level requirement against fresh locked state
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

      // 4. Check per-building placement limit (1 for Cave, 4 for Economy buildings)
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

      // 5. Check crew requirement against total villagers (villagers + founder)
      const placeSpec = getPlaceJobSpec(definition.id);
      const totalCrew = getTotalVillagerCount(civilization.villagers, civilization.founderRole);
      if (totalCrew < placeSpec.crew) {
        throw new AppError(
          'CIV_NOT_ENOUGH_VILLAGERS',
          `Requires at least ${placeSpec.crew} villagers for this job (currently ${totalCrew}).`,
          {
            requiredCrew: placeSpec.crew,
            totalVillagers: totalCrew,
          }
        );
      }

      // 6. Check currency sufficiency against fresh locked economy
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

      // 7. Check placement & collision against fresh locked gridMap
      const placementValidation = gridMap.canPlaceBuilding(payload.position, definition.footprint);
      if (!placementValidation.isValid) {
        const reason = placementValidation.reason || 'placement rejected';
        throw new AppError(
          'CIV_CANNOT_PLACE_BUILDING',
          `Cannot place building: ${reason}`,
          { reason }
        );
      }

      // 8. Register occupancy on gridMap
      const now = Date.now();
      const instanceId = `bld_${now}_${Math.random().toString(36).slice(2, 8)}`;
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
        placedAt: now,
      };

      const existingJobs = civilization.jobs ?? [];
      let nextJobs: readonly ConstructionJob[] = existingJobs;
      let createdJob: ConstructionJob | undefined;

      if (placeSpec.durationSeconds > 0) {
        const rawJob: ConstructionJob = {
          id: `job_${now}_${Math.random().toString(36).slice(2, 8)}`,
          kind: 'place',
          status: 'PENDING',
          definitionId: definition.id,
          buildingId: instanceId,
          crewRequired: placeSpec.crew,
          totalSeconds: placeSpec.durationSeconds,
          remainingSeconds: placeSpec.durationSeconds,
          paidCoins: definition.baseCost,
          createdAt: now,
        };
        nextJobs = assignJobsFifo([...existingJobs, rawJob], totalCrew).jobs;
        createdJob = nextJobs.find((j) => j.id === rawJob.id) ?? rawJob;
      }

      const nextCivilization: CivilizationState = {
        schemaVersion: CURRENT_CIVILIZATION_SCHEMA_VERSION,
        era: civilization.era,
        grid: gridMap.toSnapshot(),
        buildings: [...civilization.buildings, newInstance],
        villagers: civilization.villagers ?? [],
        jobs: nextJobs,
        founderRole: civilization.founderRole ?? null,
        lastUpdated: now,
      };

      const nextBonuses = this.extractBonusesFromState(nextCivilization);

      return {
        result: {
          building: newInstance,
          job: createdJob,
        },
        nextCivilization,
        deductCoins: definition.baseCost,
        ...(placeSpec.durationSeconds === 0
          ? { awardCountersDelta: { buildingsBuilt: 1 } }
          : {}),
        onCommitted: () => {
          this.cachedBonuses = nextBonuses;
        },
      };
    });

    return {
      building: tx.result.building,
      civilizationState: tx.civilization,
      economy: tx.economy,
      ...(tx.result.job ? { job: tx.result.job } : {}),
    };
  }

  /**
   * Removes a building instance (and any construction/upgrade jobs targeting it)
   * from the map and refunds 50% of invested Coins.
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
          `Cannot demolish Rock Shelter while ${villagerCount} villagers live in the village.`,
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

      const existingJobs = civilization.jobs ?? [];
      const placeJob = getPlaceJobForBuilding(instance.id, existingJobs);
      const upgradeJobs = getUpgradeJobsForBuilding(instance.id, existingJobs);

      const definition = getBuildingDefinition(instance.definitionId);
      const refundCoins = calculateBuildingDemolishRefund(definition, instance.level, {
        placeJob,
        upgradeJobs,
      });

      const nextBuildings = civilization.buildings.filter((b) => b.id !== payload.buildingInstanceId);
      const remainingJobs = existingJobs.filter((j) => j.buildingId !== payload.buildingInstanceId);
      const totalCrew = getTotalVillagerCount(civilization.villagers, civilization.founderRole);
      const nextJobs = assignJobsFifo(remainingJobs, totalCrew).jobs;

      const nextCivilization: CivilizationState = {
        ...civilization,
        grid: gridMap.toSnapshot(),
        buildings: nextBuildings,
        villagers: civilization.villagers ?? [],
        jobs: nextJobs,
        lastUpdated: Date.now(),
      };

      const nextBonuses = this.extractBonusesFromState(nextCivilization);

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
   * Queues an upgrade job (+1 level from effectiveTargetLevel) on an existing building
   * atomically under StorageMutex. The building keeps functioning at its current level until
   * the Focus upgrade job completes.
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
      nextLevel: number;
      cost: number;
      job: ConstructionJob;
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

      const existingJobs = civilization.jobs ?? [];
      const totalCrew = getTotalVillagerCount(civilization.villagers, civilization.founderRole);
      const buffSummary = getVillagerBuffSummary(
        civilization.villagers,
        civilization.founderRole
      );
      const effectiveMaxLevel = getEffectiveMaxLevel(definition, civilization.era);

      const evalResult = evaluateBuildingUpgrade({
        instance,
        definition,
        currentEra: civilization.era,
        playerLevel,
        playerCoins: economy.focusCoins,
        expectedLevel: payload.expectedLevel,
        upgradeDiscountRate: buffSummary.upgradeDiscountRate,
        jobs: existingJobs,
        totalVillagers: totalCrew,
      });

      if (!evalResult.canUpgrade) {
        switch (evalResult.reason) {
          case 'BUILDING_UNDER_CONSTRUCTION':
            throw new AppError(
              'CIV_BUILDING_UNDER_CONSTRUCTION',
              'This building is still under construction and cannot be upgraded yet.',
              { buildingId: instance.id, buildingName: definition.name }
            );
          case 'LEVEL_MISMATCH':
            throw new AppError(
              'BUILDING_LEVEL_MISMATCH',
              `Building level changed concurrently (expected Lv. ${payload.expectedLevel}, current Lv. ${evalResult.currentLevel}). Please try again.`,
              {
                buildingId: instance.id,
                expectedLevel: payload.expectedLevel,
                currentLevel: evalResult.currentLevel,
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
          case 'NOT_ENOUGH_VILLAGERS': {
            const reqCrew = getUpgradeJobSpec(evalResult.currentLevel).crew;
            throw new AppError(
              'CIV_NOT_ENOUGH_VILLAGERS',
              `Requires at least ${reqCrew} villagers for this job (currently ${totalCrew}).`,
              {
                requiredCrew: reqCrew,
                totalVillagers: totalCrew,
              }
            );
          }
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

      const now = Date.now();
      const targetLevel = evalResult.nextLevel!;
      const upgradeSpec = getUpgradeJobSpec(evalResult.currentLevel);
      const rawJob: ConstructionJob = {
        id: `job_${now}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'upgrade',
        status: 'PENDING',
        definitionId: definition.id,
        buildingId: instance.id,
        targetLevel,
        crewRequired: upgradeSpec.crew,
        totalSeconds: upgradeSpec.durationSeconds,
        remainingSeconds: upgradeSpec.durationSeconds,
        paidCoins: evalResult.cost,
        createdAt: now,
      };
      const nextJobs = assignJobsFifo([...existingJobs, rawJob], totalCrew).jobs;
      const finalJob = nextJobs.find((j) => j.id === rawJob.id) ?? rawJob;

      const nextCivilization: CivilizationState = {
        ...civilization,
        villagers: civilization.villagers ?? [],
        jobs: nextJobs,
        lastUpdated: now,
      };

      const nextBonuses = this.extractBonusesFromState(nextCivilization);

      return {
        result: {
          building: instance,
          nextLevel: targetLevel,
          cost: evalResult.cost,
          job: finalJob,
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
      newLevel: tx.result.nextLevel,
      cost: tx.result.cost,
      job: tx.result.job,
    };
  }

  /**
   * Queues a territory clearing job ('expand') for an adjacent 4x4 chunk:
   * - Requires 2 crew and 60 minutes Focus.
   * - Cells remain locked until the 'expand' job finishes on Focus settlement.
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
      job: ConstructionJob;
    }>(({ economy, civilization, gridMap }) => {
      const existingJobs = civilization.jobs ?? [];

      // 1. Reject duplicate clearing job at the same origin
      if (getExpandJobAtOrigin(payload.origin, existingJobs)) {
        throw new AppError(
          'CIV_EXPAND_ALREADY_QUEUED',
          'This territory chunk is already being cleared.'
        );
      }

      // 2. Evaluate Player Level & Coin cost (counting currently clearing chunks)
      const playerLevel = Math.min(
        economy.level ?? calculatePlayerLevel(economy.totalXP),
        calculatePlayerLevel(economy.totalXP)
      );
      const buffSummary = getVillagerBuffSummary(
        civilization.villagers,
        civilization.founderRole
      );
      const clearingCount = getClearingOrigins(existingJobs).length;
      const evalResult = evaluateExpansion({
        chunkCount: civilization.grid.chunks.length + clearingCount,
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
              purchaseIndex: evalResult.purchaseIndex,
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
            purchaseIndex: evalResult.purchaseIndex,
            cost: evalResult.cost,
            balance: economy.focusCoins,
          }
        );
      }

      // 3. Validate villager crew count (requires 2)
      const totalCrew = getTotalVillagerCount(civilization.villagers, civilization.founderRole);
      if (totalCrew < EXPAND_JOB_SPEC.crew) {
        throw new AppError(
          'CIV_NOT_ENOUGH_VILLAGERS',
          `Requires at least ${EXPAND_JOB_SPEC.crew} villagers for this job (currently ${totalCrew}).`,
          {
            requiredCrew: EXPAND_JOB_SPEC.crew,
            totalVillagers: totalCrew,
          }
        );
      }

      // 4. Validate geometry & adjacency on GridMap without unlocking yet
      const expCheck = gridMap.canExpandChunk(payload.origin);
      if (!expCheck.canExpand) {
        const reason = expCheck.reason || 'cannot expand chunk';
        throw new AppError(
          'CIV_LAND_EXPANSION_FAILED',
          `Land expansion failed: ${reason}`,
          { reason }
        );
      }

      const now = Date.now();
      const originCopy: GridCoordinate = { x: payload.origin.x, y: payload.origin.y };
      const rawJob: ConstructionJob = {
        id: `job_${now}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'expand',
        status: 'PENDING',
        origin: originCopy,
        purchaseIndex: evalResult.purchaseIndex,
        crewRequired: EXPAND_JOB_SPEC.crew,
        totalSeconds: EXPAND_JOB_SPEC.durationSeconds,
        remainingSeconds: EXPAND_JOB_SPEC.durationSeconds,
        paidCoins: evalResult.cost,
        createdAt: now,
      };
      const nextJobs = assignJobsFifo([...existingJobs, rawJob], totalCrew).jobs;
      const finalJob = nextJobs.find((j) => j.id === rawJob.id) ?? rawJob;

      const nextCivilization: CivilizationState = {
        ...civilization,
        villagers: civilization.villagers ?? [],
        jobs: nextJobs,
        lastUpdated: now,
      };

      return {
        result: {
          origin: originCopy,
          cost: evalResult.cost,
          job: finalJob,
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
      job: tx.result.job,
    };
  }

  /**
   * Cancels an incomplete construction/upgrade/expand job (Section A6):
   * - 0s elapsed (remainingSeconds === totalSeconds): 100% refund of paidCoins.
   * - >0s elapsed: 50% refund of paidCoins.
   * - 'place': deletes the placed building instance and frees grid cells.
   * - 'upgrade': cascade-cancels all queued upgrades on the same building with targetLevel >= cancelled.targetLevel.
   * - 'expand': removes the clearing job; chunk remains locked.
   */
  async cancelConstructionJob(
    payload: CancelConstructionJobPayload
  ): Promise<CancelConstructionJobResponseData> {
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.jobId !== 'string' ||
      payload.jobId.trim().length === 0
    ) {
      throw new AppError(
        'CIV_INVALID_CANCEL_JOB_PAYLOAD',
        'CANCEL_CONSTRUCTION_JOB requires a valid jobId.'
      );
    }

    const tx = await this.storage.executeCivilizationTransaction<{
      cancelledJobIds: readonly string[];
      refundedCoins: number;
    }>(({ civilization, gridMap }) => {
      const existingJobs = civilization.jobs ?? [];
      const targetJob = existingJobs.find((j) => j.id === payload.jobId);
      if (!targetJob) {
        throw new AppError(
          'CIV_JOB_NOT_FOUND',
          `Construction job "${payload.jobId}" not found.`,
          { jobId: payload.jobId }
        );
      }

      const jobsToCancel: ConstructionJob[] =
        targetJob.kind === 'upgrade' &&
        targetJob.buildingId &&
        typeof targetJob.targetLevel === 'number'
          ? existingJobs.filter(
              (j) =>
                j.kind === 'upgrade' &&
                j.buildingId === targetJob.buildingId &&
                typeof j.targetLevel === 'number' &&
                j.targetLevel >= targetJob.targetLevel!
            )
          : [targetJob];

      const cancelledSet = new Set(jobsToCancel.map((j) => j.id));
      let refundCoins = 0;
      for (const j of jobsToCancel) {
        const rate = j.remainingSeconds === j.totalSeconds ? 1 : BUILDING_DEMOLISH_REFUND_RATE;
        refundCoins += j.paidCoins * rate;
      }

      let nextBuildings = civilization.buildings;
      if (targetJob.kind === 'place' && targetJob.buildingId) {
        const removalRes = gridMap.removeBuilding(targetJob.buildingId);
        if (!removalRes.success) {
          throw new AppError(
            'CIV_BUILDING_REMOVAL_FAILED',
            `Building removal failed: ${removalRes.reason || 'unknown'}`,
            { reason: removalRes.reason || 'unknown' }
          );
        }
        nextBuildings = civilization.buildings.filter((b) => b.id !== targetJob.buildingId);
      }

      const remainingJobs = existingJobs.filter((j) => !cancelledSet.has(j.id));
      const totalCrew = getTotalVillagerCount(civilization.villagers, civilization.founderRole);
      const nextJobs = assignJobsFifo(remainingJobs, totalCrew).jobs;

      const nextCivilization: CivilizationState = {
        ...civilization,
        grid: gridMap.toSnapshot(),
        buildings: nextBuildings,
        jobs: nextJobs,
        lastUpdated: Date.now(),
      };

      const nextBonuses = this.extractBonusesFromState(nextCivilization);

      return {
        result: {
          cancelledJobIds: Array.from(cancelledSet),
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
      cancelledJobIds: tx.result.cancelledJobIds,
      refundedCoins: tx.result.refundedCoins,
      civilizationState: tx.civilization,
      economy: tx.economy,
    };
  }

  /**
   * Recruits 1 villager into the active Meditation Cave atomically under StorageMutex.
   * Immediately updates FIFO construction jobs if newly free crew can start a PENDING job.
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
      const existingJobs = civilization.jobs ?? [];
      const caveBuilding = findVillageCave(civilization.buildings, existingJobs);
      const evalResult = evaluateRecruitment({
        caveBuilding,
        villagers: currentVillagers,
        founderRole: civilization.founderRole,
        playerCoins: economy.focusCoins,
        role,
      });

      if (!evalResult.canRecruit) {
        switch (evalResult.reason) {
          case 'CIV_NO_VILLAGE_CAVE':
            throw new AppError(
              'CIV_NO_VILLAGE_CAVE',
              'You need a Rock Shelter to recruit villagers.'
            );
          case 'CIV_VILLAGER_CAPACITY_REACHED':
            throw new AppError(
              'CIV_VILLAGER_CAPACITY_REACHED',
              `Village capacity reached (${evalResult.currentCount}/${evalResult.capacity}). Upgrade your Rock Shelter to house more villagers.`,
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
      const nextTotalCrew = getTotalVillagerCount(nextVillagers, civilization.founderRole);
      const nextJobs = assignJobsFifo(existingJobs, nextTotalCrew).jobs;

      const nextCivilization: CivilizationState = {
        ...civilization,
        villagers: nextVillagers,
        jobs: nextJobs,
        lastUpdated: now,
      };

      const nextBonuses = this.extractBonusesFromState(nextCivilization);

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

  /**
   * Selects the permanent free Founder Villager once for this settlement.
   * Grants +1 free crew slot immediately (without consuming Rock Shelter capacity)
   * and activates any FIFO construction jobs if pending.
   */
  async selectFounder(payload: SelectFounderPayload): Promise<SelectFounderResponseData> {
    if (!payload || typeof payload !== 'object' || !isVillagerRole(payload.role)) {
      throw new AppError(
        'CIV_INVALID_FOUNDER_PAYLOAD',
        'SELECT_FOUNDER requires a valid villager role (elder | crafter | woodworker).',
        {
          role:
            payload && typeof payload === 'object'
              ? String((payload as { role?: unknown }).role)
              : '',
        }
      );
    }

    const role = payload.role;

    const tx = await this.storage.executeCivilizationTransaction<{
      founderRole: typeof role;
    }>(({ civilization }) => {
      if (civilization.founderRole && isVillagerRole(civilization.founderRole)) {
        throw new AppError(
          'CIV_FOUNDER_ALREADY_SELECTED',
          'Founder villager has already been selected.'
        );
      }

      const now = Date.now();
      const currentVillagers = civilization.villagers ?? [];
      const existingJobs = civilization.jobs ?? [];
      const nextTotalCrew = getTotalVillagerCount(currentVillagers, role);
      const nextJobs = assignJobsFifo(existingJobs, nextTotalCrew).jobs;

      const nextCivilization: CivilizationState = {
        ...civilization,
        founderRole: role,
        jobs: nextJobs,
        lastUpdated: now,
      };

      const nextBonuses = this.extractBonusesFromState(nextCivilization);

      return {
        result: { founderRole: role },
        nextCivilization,
        onCommitted: () => {
          this.cachedBonuses = nextBonuses;
        },
      };
    });

    return {
      founderRole: tx.result.founderRole,
      civilizationState: tx.civilization,
    };
  }
}
