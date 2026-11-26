import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateUpgradeCost,
  getBuildingDefinition,
  STONE_AGE_BUILDING_DEFINITIONS,
} from '../../src/core/civilization/buildingCatalog.ts';
import {
  calculateTotalBuildingCoinsSpent,
  getBuildingCoinBonusRateAtLevel,
  getBuildingPlacementLimit,
  isBuildingDefinitionUpgradeable,
} from '../../src/core/civilization/buildingUpgrade.ts';
import {
  getExpansionCost,
  getExpansionRequiredLevel,
} from '../../src/core/civilization/landExpansion.ts';
import {
  INITIAL_CHUNK_COUNT,
  LAND_EXPANSION_BASE_COST,
  VILLAGER_CAPACITY_PER_CAVE_LEVEL,
  VILLAGER_COMPLETE_TRIBE_COIN_BONUS,
  VILLAGER_CRAFTER_COIN_BONUS_RATE,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE,
} from '../../src/core/civilization/constants.ts';
import {
  evaluateRecruitment,
  findVillageCave,
  getVillagerRecruitCost,
  Villager,
} from '../../src/core/civilization/villager.ts';
import { applyCostDiscount, getVillagerBuffSummary } from '../../src/core/civilization/villagerBuffs.ts';
import { extractCivilizationCoinBonuses } from '../../src/core/civilization/civilizationBonusHelper.ts';
import {
  STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
  evaluateEraAdvance,
  getEffectiveMaxLevel,
} from '../../src/core/civilization/eraRules.ts';
import {
  AdvanceableCivilizationState,
  ConstructionJob,
  EXPAND_JOB_SPEC,
  advanceJobs,
  assignJobsFifo,
  assignJobsWithSchedule,
  getClearingOrigins,
  getEffectiveTargetLevel,
  getPlaceJobSpec,
  getTotalVillagerCount,
  getUpgradeJobSpec,
  isBuildingUnderConstruction,
} from '../../src/core/civilization/jobs.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { CURRENT_CIVILIZATION_SCHEMA_VERSION } from '../../src/core/civilization/civilizationState.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';
import { GridCoordinate } from '../../src/core/civilization/types.ts';
import { VillagerRole } from '../../src/ui/components/civilization/spriteRegistry.ts';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';
import { DEFAULT_REWARD_CONFIG } from '../../src/core/reward/rewardEngine.ts';
import { calculatePlayerLevel } from '../../src/core/economy/levelSystem.ts';
import {
  applyCompletedSession,
  claimQuest,
  createInitialQuestState,
  getActiveQuestDefinitions,
} from '../../src/core/quests/questEngine.ts';

const REFERENCE_BASE_COINS_PER_DAY = 378; // 3 x 60m Countdown (x1.4) = 180 * 1.5 * 1.4 = 378 Coins/day

test('EconomyBalance Suite 1: V5.2 Stone Age costs (3,907 max total) & 5E-1 arithmetic land expansion monotonicity', () => {
  const expectedCosts: Record<string, number> = {
    stone_age_campfire: 4,
    stone_age_totem: 8,
    stone_age_study_cave: 12,
    stone_age_elder_hut: 20,
    stone_age_foraging_post: 15,
    stone_age_food_cache: 30,
  };

  let eraChecklistBuildAndUpgradeTotal = 0;
  let maxStoneAgeCapBuildAndUpgradeTotal = 0;
  for (const def of STONE_AGE_BUILDING_DEFINITIONS) {
    assert.strictEqual(def.baseCost, expectedCosts[def.id], `baseCost mismatch for ${def.id}`);
    const limit = getBuildingPlacementLimit(def) ?? 1;
    const eraChecklistCount =
      def.category === 'ECONOMY_EFFECT' || def.id === 'stone_age_study_cave' ? limit : 1;
    const effectiveMax = isBuildingDefinitionUpgradeable(def)
      ? getEffectiveMaxLevel(def, 'STONE_AGE')
      : 1;
    const perInstanceCost = calculateTotalBuildingCoinsSpent(def, effectiveMax);
    eraChecklistBuildAndUpgradeTotal += eraChecklistCount * perInstanceCost;
    maxStoneAgeCapBuildAndUpgradeTotal += limit * perInstanceCost;
  }

  // Exact V5.2 Stone Age Era floor total (1 Campfire + 1 Totem + 1 Cave L1..5 + 1 Elder's Hut + 4 Foraging + 4 Granary = 3,907)
  // Full map placement cap total adds 2 extra Campfires (8) + 2 extra Totems (16) + 1 extra Elder's Hut (20) = 3,951
  assert.strictEqual(eraChecklistBuildAndUpgradeTotal, 3907);
  assert.strictEqual(maxStoneAgeCapBuildAndUpgradeTotal, 3951);

  assert.strictEqual(LAND_EXPANSION_BASE_COST, 30);
  let prev = 0;
  for (let k = 1; k <= 30; k += 1) {
    const cost = getExpansionCost(k);
    assert.ok(cost > prev, `k=${k} cost ${cost} must strictly exceed ${prev}`);
    prev = cost;
  }

  const cost20 = getExpansionCost(20);
  assert.strictEqual(cost20, 355);
});

test('EconomyBalance Suite 2: Every economy upgrade step and Crafter villager pays back within 60 days at 378 base Coins/day', () => {
  const economyIds = ['stone_age_foraging_post', 'stone_age_food_cache'] as const;

  for (const id of economyIds) {
    const def = getBuildingDefinition(id)!;
    const stepDeltaRate = getBuildingCoinBonusRateAtLevel(def, 1);

    // L1 placement payback
    const buildPaybackDays = def.baseCost / (stepDeltaRate * REFERENCE_BASE_COINS_PER_DAY);
    assert.ok(
      buildPaybackDays <= 60,
      `${id} build payback ${buildPaybackDays.toFixed(2)}d exceeds 60d`
    );

    // L1->L2..L4->L5 upgrade payback
    for (let lv = 1; lv < 5; lv += 1) {
      const upgradeCost = calculateUpgradeCost(def, lv);
      const upgradePaybackDays = upgradeCost / (stepDeltaRate * REFERENCE_BASE_COINS_PER_DAY);
      assert.ok(
        upgradePaybackDays <= 60,
        `${id} L${lv}->L${lv + 1} payback ${upgradePaybackDays.toFixed(2)}d exceeds 60d`
      );
    }
  }

  // Crafter villagers 1..10 using live VILLAGER_CRAFTER_COIN_BONUS_RATE
  for (let count = 0; count < 10; count += 1) {
    const recruitCost = getVillagerRecruitCost(count);
    const paybackDays =
      recruitCost / (VILLAGER_CRAFTER_COIN_BONUS_RATE * REFERENCE_BASE_COINS_PER_DAY);
    assert.ok(
      paybackDays <= 60,
      `Crafter #${count + 1} (cost ${recruitCost}) payback ${paybackDays.toFixed(2)}d exceeds 60d`
    );
  }
});

interface SimOptions {
  readonly founderRole?: VillagerRole;
  readonly maxElders?: number;
  readonly maxCrafters?: number;
  readonly maxWoodworkers?: number;
  readonly useVillagerBuffs?: boolean;
  readonly scheduleOptionsFactory?: (jobs: readonly ConstructionJob[]) =>
    | {
        readonly priorityJobIds?: readonly string[];
        readonly autoContinue?: boolean;
      }
    | undefined;
}

interface SimResult {
  daysToEligible: number;
  finalCoins: number;
  finalLevel: number;
  finalMinutes: number;
  finalBonusRate: number;
  crafterCount: number;
  elderCount: number;
  woodworkerCount: number;
  forageCount: number;
  granaryCount: number;
  landExpansions: number;
  completedJobsMinutes: number;
}

function findFirstValidPlacement(
  gridMap: GridMap,
  footprint: { readonly width: number; readonly height: number }
): GridCoordinate | null {
  const bounds = gridMap.getBoundingBox();
  for (let y = bounds.minY; y <= bounds.maxY - footprint.height + 1; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX - footprint.width + 1; x += 1) {
      if (gridMap.canPlaceBuilding({ x, y }, footprint).isValid) {
        return { x, y };
      }
    }
  }
  return null;
}

export function simulateStoneToBronzeProgression5E1(
  dailySessionMinutes: readonly number[],
  options: SimOptions = {}
): SimResult {
  const founderRole: VillagerRole = options.founderRole ?? 'crafter';
  const maxElders = options.maxElders ?? 2;
  const maxCrafters = options.maxCrafters ?? 2;
  const maxWoodworkers = options.maxWoodworkers ?? 1;
  const useVillagerBuffs = options.useVillagerBuffs ?? true;

  let coins = 0;
  let totalXP = 0;
  let totalFocusMinutes = 0;
  let completedJobsMinutes = 0;
  let nextId = 1;

  let civState: AdvanceableCivilizationState = {
    schemaVersion: CURRENT_CIVILIZATION_SCHEMA_VERSION,
    era: 'STONE_AGE',
    grid: new GridMap().toSnapshot(),
    buildings: [],
    villagers: [],
    jobs: [],
    founderRole,
    lastUpdated: 0,
  };

  // Start on Monday 2026-01-05 local noon to align weekly quest cycles cleanly
  const startUtcMs = Date.UTC(2026, 0, 5, 12, 0, 0);
  let questState = createInitialQuestState(startUtcMs);

  const foragingDef = getBuildingDefinition('stone_age_foraging_post')!;
  const granaryDef = getBuildingDefinition('stone_age_food_cache')!;
  const caveDef = getBuildingDefinition('stone_age_study_cave')!;
  const campfireDef = getBuildingDefinition('stone_age_campfire')!;
  const totemDef = getBuildingDefinition('stone_age_totem')!;
  const elderHutDef = getBuildingDefinition('stone_age_elder_hut')!;

  const req = STONE_TO_BRONZE_ADVANCE_REQUIREMENTS;
  const caveTargetLevel =
    req.buildingRequirements.find((r) => r.definitionId === caveDef.id)?.minLevel ?? 5;
  const forageReq = req.buildingRequirements.find((r) => r.definitionId === foragingDef.id)!;
  const granaryReq = req.buildingRequirements.find((r) => r.definitionId === granaryDef.id)!;

  const getCurrentCoinBonus = (): number => {
    const bonuses = extractCivilizationCoinBonuses(
      civState.buildings,
      useVillagerBuffs ? civState.villagers : [],
      civState.jobs,
      useVillagerBuffs ? civState.founderRole : null
    );
    return bonuses.reduce((sum, item) => sum + item.rate, 0);
  };

  const countRoleTotal = (role: VillagerRole): number =>
    (civState.founderRole === role ? 1 : 0) +
    (civState.villagers ?? []).filter((v) => v.role === role).length;

  const spendAndEnqueueOptimal = (dayMs: number): void => {
    let boughtSomething = true;
    while (boughtSomething) {
      boughtSomething = false;
      const playerLevel = calculatePlayerLevel(totalXP);
      const buffSummary = useVillagerBuffs
        ? getVillagerBuffSummary(civState.villagers, civState.founderRole)
        : { upgradeDiscountRate: 0, expansionDiscountRate: 0 };

      const completedExpansions = Math.max(0, civState.grid.chunks.length - INITIAL_CHUNK_COUNT);
      const activeJobs = civState.jobs ?? [];
      const totalCrew = getTotalVillagerCount(civState.villagers, civState.founderRole);
      const gridMap = GridMap.fromSnapshot(civState.grid);

      const activeBuildingsOnly = civState.buildings.filter(
        (b) => !isBuildingUnderConstruction(b.id, activeJobs)
      );
      const preEval = evaluateEraAdvance({
        era: 'STONE_AGE',
        buildings: activeBuildingsOnly,
        villagers: civState.villagers ?? [],
        founderRole: civState.founderRole,
        landExpansions: completedExpansions,
        playerLevel,
        totalFocusMinutes,
        coins: Number.MAX_SAFE_INTEGER,
      });
      const nonCoinPrereqsReady =
        activeJobs.length === 0 &&
        preEval.checks
          .filter(
            (chk) =>
              chk.id !== 'fee_coins' &&
              chk.id !== 'player_level' &&
              chk.id !== 'total_focus_minutes'
          )
          .every((chk) => chk.met);

      if (nonCoinPrereqsReady) {
        break;
      }

      type ActionCandidate = {
        roiScore: number;
        cost: number;
        apply: () => void;
      };
      const candidates: ActionCandidate[] = [];

      const caveAny = civState.buildings.find((b) => b.definitionId === caveDef.id);
      const caveReady = findVillageCave(civState.buildings, activeJobs);
      const forageInstances = civState.buildings.filter((b) => b.definitionId === foragingDef.id);
      const granaryInstances = civState.buildings.filter((b) => b.definitionId === granaryDef.id);
      const clearingCount = getClearingOrigins(activeJobs).length;

      const rawCounts = {
        elder: countRoleTotal('elder'),
        crafter: countRoleTotal('crafter'),
        woodworker: countRoleTotal('woodworker'),
      };
      const targetVillagers = maxElders + maxCrafters + maxWoodworkers;

      const enqueuePlace = (
        def: typeof foragingDef,
        pos: GridCoordinate,
        paidCoins: number
      ): void => {
        const placeSpec = getPlaceJobSpec(def.id);
        const bId = `b_${nextId++}`;
        const gRes = gridMap.placeBuilding(bId, pos, def.footprint);
        assert.ok(gRes.success, `Failed to place ${def.id} in balance sim: ${gRes.reason}`);
        const inst: BuildingInstance = {
          id: bId,
          definitionId: def.id,
          position: pos,
          level: 1,
          placedAt: dayMs,
        };
        let nextJobs = activeJobs;
        if (placeSpec.durationSeconds > 0) {
          const newJob: ConstructionJob = {
            id: `j_${nextId++}`,
            kind: 'place',
            status: 'PENDING',
            definitionId: def.id,
            buildingId: bId,
            crewRequired: placeSpec.crew,
            totalSeconds: placeSpec.durationSeconds,
            remainingSeconds: placeSpec.durationSeconds,
            paidCoins,
            createdAt: dayMs,
          };
          nextJobs = assignJobsFifo([...activeJobs, newJob], totalCrew).jobs;
        }
        civState = {
          ...civState,
          grid: gridMap.toSnapshot(),
          buildings: [...civState.buildings, inst],
          jobs: nextJobs,
          lastUpdated: dayMs,
        };
      };

      const enqueueUpgrade = (
        inst: BuildingInstance,
        nextTargetLevel: number,
        paidCoins: number
      ): void => {
        const upSpec = getUpgradeJobSpec(nextTargetLevel - 1);
        const newJob: ConstructionJob = {
          id: `j_${nextId++}`,
          kind: 'upgrade',
          status: 'PENDING',
          definitionId: inst.definitionId,
          buildingId: inst.id,
          targetLevel: nextTargetLevel,
          crewRequired: upSpec.crew,
          totalSeconds: upSpec.durationSeconds,
          remainingSeconds: upSpec.durationSeconds,
          paidCoins,
          createdAt: dayMs,
        };
        civState = {
          ...civState,
          jobs: assignJobsFifo([...activeJobs, newJob], totalCrew).jobs,
          lastUpdated: dayMs,
        };
      };

      // 1. Rock Shelter placement (build Lv.1 early to unlock villagers & 2-crew jobs)
      if (
        !caveAny &&
        totalCrew >= getPlaceJobSpec(caveDef.id).crew &&
        playerLevel >= caveDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= caveDef.unlockRequirements.minTotalFocusMinutes
      ) {
        const pos = findFirstValidPlacement(gridMap, caveDef.footprint);
        if (pos) {
          candidates.push({
            roiScore: 0.25,
            cost: caveDef.baseCost,
            apply: () => enqueuePlace(caveDef, pos, caveDef.baseCost),
          });
        }
      } else if (caveReady) {
        const effCaveLevel = getEffectiveTargetLevel(caveReady, activeJobs);
        const nextCaveTarget = effCaveLevel + 1;
        const caveUpSpec = getUpgradeJobSpec(effCaveLevel);
        if (
          effCaveLevel < caveTargetLevel &&
          totalCrew >= caveUpSpec.crew &&
          playerLevel >= caveDef.unlockRequirements.minPlayerLevel + effCaveLevel
        ) {
          const upCost = applyCostDiscount(
            calculateUpgradeCost(caveDef, effCaveLevel),
            buffSummary.upgradeDiscountRate
          );
          const needCapacity =
            (civState.villagers?.length ?? 0) >= effCaveLevel * VILLAGER_CAPACITY_PER_CAVE_LEVEL &&
            totalCrew < targetVillagers;
          candidates.push({
            roiScore: (needCapacity ? 0.05 : 0.00002) / upCost,
            cost: upCost,
            apply: () => enqueueUpgrade(caveReady, nextCaveTarget, upCost),
          });
        }
      }

      // 2. Recruit villagers when Cave is built & capacity permits
      if (
        caveReady &&
        (civState.villagers?.length ?? 0) < caveReady.level * VILLAGER_CAPACITY_PER_CAVE_LEVEL
      ) {
        const rolesToConsider: VillagerRole[] = [];
        if (rawCounts.elder < maxElders) rolesToConsider.push('elder');
        if (rawCounts.crafter < maxCrafters) rolesToConsider.push('crafter');
        if (rawCounts.woodworker < maxWoodworkers) rolesToConsider.push('woodworker');

        for (const role of rolesToConsider) {
          const evalRec = evaluateRecruitment({
            caveBuilding: caveReady,
            villagers: civState.villagers,
            founderRole: civState.founderRole,
            playerCoins: Number.MAX_SAFE_INTEGER,
            role,
          });
          if (!evalRec.canRecruit) continue;

          const completesTribe =
            (role === 'elder' &&
              rawCounts.elder === 0 &&
              rawCounts.crafter >= 1 &&
              rawCounts.woodworker >= 1) ||
            (role === 'crafter' &&
              rawCounts.crafter === 0 &&
              rawCounts.elder >= 1 &&
              rawCounts.woodworker >= 1) ||
            (role === 'woodworker' &&
              rawCounts.woodworker === 0 &&
              rawCounts.elder >= 1 &&
              rawCounts.crafter >= 1);
          const unlockTwoCrewBonus = totalCrew === 1 ? 0.2 : 0;
          const tribeBoost = completesTribe ? VILLAGER_COMPLETE_TRIBE_COIN_BONUS : 0;
          const roleValue =
            role === 'elder'
              ? VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE * 1.5
              : role === 'crafter'
              ? VILLAGER_CRAFTER_COIN_BONUS_RATE
              : 0.015;

          candidates.push({
            roiScore: (unlockTwoCrewBonus + roleValue + tribeBoost) / evalRec.cost,
            cost: evalRec.cost,
            apply: () => {
              const newVillager: Villager = {
                id: `v_${nextId++}`,
                role,
                recruitedAt: dayMs,
              };
              const nextVillagers = [...(civState.villagers ?? []), newVillager];
              const nextCrew = getTotalVillagerCount(nextVillagers, civState.founderRole);
              civState = {
                ...civState,
                villagers: nextVillagers,
                jobs: assignJobsFifo(activeJobs, nextCrew).jobs,
                lastUpdated: dayMs,
              };
            },
          });
        }
      }

      // 3. Required land expansions (minLandExpansions = 3, requires 2 crew + 60m each)
      if (
        completedExpansions + clearingCount < req.minLandExpansions &&
        totalCrew >= EXPAND_JOB_SPEC.crew
      ) {
        const expIndex = completedExpansions + clearingCount + 1;
        if (playerLevel >= getExpansionRequiredLevel(expIndex)) {
          const queuedOrigins = new Set(
            getClearingOrigins(activeJobs).map((o) => `${o.x},${o.y}`)
          );
          const candidateOrigin = gridMap
            .getAvailableExpansionSlots()
            .find((slot) => !queuedOrigins.has(`${slot.x},${slot.y}`));
          if (candidateOrigin) {
            const expCost = applyCostDiscount(
              getExpansionCost(expIndex),
              buffSummary.expansionDiscountRate
            );
            candidates.push({
              roiScore: 0.0001 / expCost,
              cost: expCost,
              apply: () => {
                const newJob: ConstructionJob = {
                  id: `j_${nextId++}`,
                  kind: 'expand',
                  status: 'PENDING',
                  origin: candidateOrigin,
                  purchaseIndex: expIndex,
                  crewRequired: EXPAND_JOB_SPEC.crew,
                  totalSeconds: EXPAND_JOB_SPEC.durationSeconds,
                  remainingSeconds: EXPAND_JOB_SPEC.durationSeconds,
                  paidCoins: expCost,
                  createdAt: dayMs,
                };
                civState = {
                  ...civState,
                  jobs: assignJobsFifo([...activeJobs, newJob], totalCrew).jobs,
                  lastUpdated: dayMs,
                };
              },
            });
          }
        }
      }

      // 4. Economy buildings: Foraging Post x4 up to Lv.5
      if (
        forageInstances.length < forageReq.minCount &&
        totalCrew >= getPlaceJobSpec(foragingDef.id).crew &&
        playerLevel >= foragingDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= foragingDef.unlockRequirements.minTotalFocusMinutes
      ) {
        const pos = findFirstValidPlacement(gridMap, foragingDef.footprint);
        if (pos) {
          const rate = getBuildingCoinBonusRateAtLevel(foragingDef, 1);
          candidates.push({
            roiScore: rate / foragingDef.baseCost,
            cost: foragingDef.baseCost,
            apply: () => enqueuePlace(foragingDef, pos, foragingDef.baseCost),
          });
        }
      }
      for (const inst of forageInstances) {
        if (isBuildingUnderConstruction(inst.id, activeJobs)) continue;
        const effLevel = getEffectiveTargetLevel(inst, activeJobs);
        const upSpec = getUpgradeJobSpec(effLevel);
        if (
          effLevel < forageReq.minLevel &&
          totalCrew >= upSpec.crew &&
          playerLevel >= foragingDef.unlockRequirements.minPlayerLevel + effLevel
        ) {
          const upCost = applyCostDiscount(
            calculateUpgradeCost(foragingDef, effLevel),
            buffSummary.upgradeDiscountRate
          );
          const stepRate = getBuildingCoinBonusRateAtLevel(foragingDef, 1);
          candidates.push({
            roiScore: stepRate / upCost,
            cost: upCost,
            apply: () => enqueueUpgrade(inst, effLevel + 1, upCost),
          });
        }
      }

      // 5. Economy buildings: Primitive Granary x4 up to Lv.5 (requires 2 crew to place)
      if (
        granaryInstances.length < granaryReq.minCount &&
        totalCrew >= getPlaceJobSpec(granaryDef.id).crew &&
        playerLevel >= granaryDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= granaryDef.unlockRequirements.minTotalFocusMinutes
      ) {
        const pos = findFirstValidPlacement(gridMap, granaryDef.footprint);
        if (pos) {
          const rate = getBuildingCoinBonusRateAtLevel(granaryDef, 1);
          candidates.push({
            roiScore: rate / granaryDef.baseCost,
            cost: granaryDef.baseCost,
            apply: () => enqueuePlace(granaryDef, pos, granaryDef.baseCost),
          });
        }
      }
      for (const inst of granaryInstances) {
        if (isBuildingUnderConstruction(inst.id, activeJobs)) continue;
        const effLevel = getEffectiveTargetLevel(inst, activeJobs);
        const upSpec = getUpgradeJobSpec(effLevel);
        if (
          effLevel < granaryReq.minLevel &&
          totalCrew >= upSpec.crew &&
          playerLevel >= granaryDef.unlockRequirements.minPlayerLevel + effLevel
        ) {
          const upCost = applyCostDiscount(
            calculateUpgradeCost(granaryDef, effLevel),
            buffSummary.upgradeDiscountRate
          );
          const stepRate = getBuildingCoinBonusRateAtLevel(granaryDef, 1);
          candidates.push({
            roiScore: stepRate / upCost,
            cost: upCost,
            apply: () => enqueueUpgrade(inst, effLevel + 1, upCost),
          });
        }
      }

      // 6. Checklist buildings (Campfire = instant 0s/0crew, Totem = 60m/1crew, Elder's Hut = 120m/2crew)
      if (!civState.buildings.some((b) => b.definitionId === campfireDef.id)) {
        const pos = findFirstValidPlacement(gridMap, campfireDef.footprint);
        if (pos) {
          candidates.push({
            roiScore: 0.00001 / campfireDef.baseCost,
            cost: campfireDef.baseCost,
            apply: () => enqueuePlace(campfireDef, pos, campfireDef.baseCost),
          });
        }
      }
      if (
        !civState.buildings.some((b) => b.definitionId === totemDef.id) &&
        totalCrew >= getPlaceJobSpec(totemDef.id).crew &&
        totalFocusMinutes >= totemDef.unlockRequirements.minTotalFocusMinutes
      ) {
        const pos = findFirstValidPlacement(gridMap, totemDef.footprint);
        if (pos) {
          candidates.push({
            roiScore: 0.00001 / totemDef.baseCost,
            cost: totemDef.baseCost,
            apply: () => enqueuePlace(totemDef, pos, totemDef.baseCost),
          });
        }
      }
      if (
        !civState.buildings.some((b) => b.definitionId === elderHutDef.id) &&
        totalCrew >= getPlaceJobSpec(elderHutDef.id).crew &&
        playerLevel >= elderHutDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= elderHutDef.unlockRequirements.minTotalFocusMinutes
      ) {
        const pos = findFirstValidPlacement(gridMap, elderHutDef.footprint);
        if (pos) {
          candidates.push({
            roiScore: 0.00001 / elderHutDef.baseCost,
            cost: elderHutDef.baseCost,
            apply: () => enqueuePlace(elderHutDef, pos, elderHutDef.baseCost),
          });
        }
      }

      const affordable = candidates
        .filter((c) => c.cost <= coins)
        .sort((a, b) => b.roiScore - a.roiScore);

      if (affordable.length > 0) {
        const best = affordable[0];
        coins -= best.cost;
        best.apply();
        boughtSomething = true;
      }
    }
  };

  for (let day = 1; day <= 60; day += 1) {
    const dayMs = startUtcMs + (day - 1) * 24 * 60 * 60 * 1000;
    const d = new Date(dayMs);
    const dateKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;

    // Run today's focus sessions
    for (const mins of dailySessionMinutes) {
      const mult = MultiplierRules.getCountdownMultiplier(mins);
      const bonus = getCurrentCoinBonus();
      const earnedCoins =
        mins * DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute * mult * (1 + bonus);
      const earnedXp = mins * DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * mult;

      coins += earnedCoins;
      totalXP += earnedXp;
      totalFocusMinutes += mins;

      // Advance construction jobs by valid integer Focus seconds
      if ((civState.jobs?.length ?? 0) > 0) {
        const scheduleOpts = options.scheduleOptionsFactory?.(civState.jobs ?? []);
        civState = advanceJobs(civState, mins * 60, scheduleOpts);
        completedJobsMinutes += mins;
      }

      questState = applyCompletedSession(
        questState,
        { completedDateKey: dateKey, completedFocusMinutes: mins },
        dayMs
      );

      // Enqueue new builds/upgrades/recruits/expansions after session completion
      spendAndEnqueueOptimal(dayMs);
    }

    // Claim completed active Daily & Weekly quests (flat Coins + XP, no multipliers/bonuses)
    for (const qDef of getActiveQuestDefinitions('DAILY', questState)) {
      const claimed = claimQuest(questState, 'DAILY', qDef.id, dayMs);
      questState = claimed.state;
      if (claimed.claimed) {
        coins += claimed.coins;
        totalXP += claimed.xp;
      }
    }
    for (const qDef of getActiveQuestDefinitions('WEEKLY', questState)) {
      const claimed = claimQuest(questState, 'WEEKLY', qDef.id, dayMs);
      questState = claimed.state;
      if (claimed.claimed) {
        coins += claimed.coins;
        totalXP += claimed.xp;
      }
    }

    // Spend quest Coins cleanly before end of day
    spendAndEnqueueOptimal(dayMs);

    const playerLevel = calculatePlayerLevel(totalXP);
    const activeJobs = civState.jobs ?? [];
    const activeBuildingsOnly = civState.buildings.filter(
      (b) => !isBuildingUnderConstruction(b.id, activeJobs)
    );
    const completedExpansions = Math.max(0, civState.grid.chunks.length - INITIAL_CHUNK_COUNT);
    const evalResult = evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: activeBuildingsOnly,
      villagers: civState.villagers ?? [],
      founderRole: civState.founderRole,
      landExpansions: completedExpansions,
      playerLevel,
      totalFocusMinutes,
      coins,
    });
    if (evalResult.eligible) {
      return {
        daysToEligible: day,
        finalCoins: coins,
        finalLevel: playerLevel,
        finalMinutes: totalFocusMinutes,
        finalBonusRate: getCurrentCoinBonus(),
        crafterCount: countRoleTotal('crafter'),
        elderCount: countRoleTotal('elder'),
        woodworkerCount: countRoleTotal('woodworker'),
        forageCount: activeBuildingsOnly.filter((b) => b.definitionId === foragingDef.id).length,
        granaryCount: activeBuildingsOnly.filter((b) => b.definitionId === granaryDef.id).length,
        landExpansions: completedExpansions,
        completedJobsMinutes,
      };
    }
  }

  const activeJobs = civState.jobs ?? [];
  const activeBuildingsOnly = civState.buildings.filter(
    (b) => !isBuildingUnderConstruction(b.id, activeJobs)
  );
  return {
    daysToEligible: 99,
    finalCoins: coins,
    finalLevel: calculatePlayerLevel(totalXP),
    finalMinutes: totalFocusMinutes,
    finalBonusRate: getCurrentCoinBonus(),
    crafterCount: countRoleTotal('crafter'),
    elderCount: countRoleTotal('elder'),
    woodworkerCount: countRoleTotal('woodworker'),
    forageCount: activeBuildingsOnly.filter((b) => b.definitionId === foragingDef.id).length,
    granaryCount: activeBuildingsOnly.filter((b) => b.definitionId === granaryDef.id).length,
    landExpansions: Math.max(0, civState.grid.chunks.length - INITIAL_CHUNK_COUNT),
    completedJobsMinutes,
  };
}

test('EconomyBalance Suite 3: 5E-1 progression with Founder, FIFO construction crew & arithmetic land expansion meets targets and proves buffs help', () => {
  const res180 = simulateStoneToBronzeProgression5E1([180]);
  const res60x3 = simulateStoneToBronzeProgression5E1([60, 60, 60]);
  const res45x4 = simulateStoneToBronzeProgression5E1([45, 45, 45, 45]);
  const res120 = simulateStoneToBronzeProgression5E1([120]);
  const res60x2 = simulateStoneToBronzeProgression5E1([60, 60]);
  const res45x2 = simulateStoneToBronzeProgression5E1([45, 45]);
  const res60 = simulateStoneToBronzeProgression5E1([60]);

  const allProfiles: Array<readonly [string, SimResult]> = [
    ['[180]', res180],
    ['[60,60,60]', res60x3],
    ['[45,45,45,45]', res45x4],
    ['[120]', res120],
    ['[60,60]', res60x2],
    ['[45,45]', res45x2],
    ['[60]', res60],
  ];

  for (const [label, res] of allProfiles) {
    assert.ok(res.daysToEligible < 99, `${label} failed to reach Bronze eligibility within 60 days`);
    assert.ok(res.crafterCount >= 1 && res.elderCount >= 1 && res.woodworkerCount >= 1);
    assert.ok(res.forageCount === 4 && res.granaryCount === 4 && res.landExpansions >= 3);
    assert.ok(res.completedJobsMinutes > 0, `${label} must advance real construction jobs`);
  }

  // Range assertions per 5E-1 progression (including construction Focus time + FIFO crew constraints)
  assert.ok(
    res180.daysToEligible >= 6 && res180.daysToEligible <= 11,
    `3h [180] got ${res180.daysToEligible}d (expected [6, 11])`
  );
  assert.ok(
    res60x3.daysToEligible >= 6 && res60x3.daysToEligible <= 11,
    `Reference 3h [60,60,60] got ${res60x3.daysToEligible}d (expected [6, 11])`
  );
  assert.ok(
    res45x4.daysToEligible >= 6 && res45x4.daysToEligible <= 12,
    `3h [45,45,45,45] got ${res45x4.daysToEligible}d (expected [6, 12])`
  );
  assert.ok(
    res120.daysToEligible >= 9 && res120.daysToEligible <= 14,
    `2h [120] got ${res120.daysToEligible}d (expected [9, 14])`
  );
  assert.ok(
    res60x2.daysToEligible >= 9 && res60x2.daysToEligible <= 15,
    `2h [60,60] got ${res60x2.daysToEligible}d (expected [9, 15])`
  );
  assert.ok(
    res45x2.daysToEligible >= 13 && res45x2.daysToEligible <= 20,
    `1.5h [45,45] got ${res45x2.daysToEligible}d (expected [13, 20])`
  );
  assert.ok(
    res60.daysToEligible >= 18 && res60.daysToEligible <= 25,
    `1h [60] got ${res60.daysToEligible}d (expected [18, 25])`
  );

  // "Buffs help" verification: villager buffs strictly accelerate Bronze Age eligibility under 5E-1
  const res60NoBuff = simulateStoneToBronzeProgression5E1([60], {
    maxElders: 1,
    maxCrafters: 1,
    maxWoodworkers: 1,
    useVillagerBuffs: false,
  });
  const res45x2NoBuff = simulateStoneToBronzeProgression5E1([45, 45], {
    maxElders: 1,
    maxCrafters: 1,
    maxWoodworkers: 1,
    useVillagerBuffs: false,
  });

  assert.ok(
    res60.daysToEligible < res60NoBuff.daysToEligible,
    `Expected villager buffs to speed up 5E-1 [60]: withBuffs=${res60.daysToEligible}d vs noBuffs=${res60NoBuff.daysToEligible}d`
  );
  assert.ok(
    res45x2.daysToEligible < res45x2NoBuff.daysToEligible,
    `Expected villager buffs to speed up 5E-1 [45,45]: withBuffs=${res45x2.daysToEligible}d vs noBuffs=${res45x2NoBuff.daysToEligible}d`
  );
});

test('EconomyBalance Suite 4: Floor build+upgrade sum (3,907) + feeCoins (500) = 4,407 matching STONE_TO_BRONZE_ADVANCE_REQUIREMENTS', () => {
  let floorBuildUpgradeSum = 0;
  for (const req of STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.buildingRequirements) {
    const def = getBuildingDefinition(req.definitionId);
    assert.ok(def, `Missing def ${req.definitionId}`);
    const perBuildingCost = calculateTotalBuildingCoinsSpent(def, req.minLevel);
    floorBuildUpgradeSum += req.minCount * perBuildingCost;
  }

  assert.strictEqual(floorBuildUpgradeSum, 3907);
  assert.strictEqual(STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.feeCoins, 500);
  assert.strictEqual(floorBuildUpgradeSum + STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.feeCoins, 4407);
});

test('EconomyBalance Suite 5: 5E-1 Founder & Construction Crew gating invariants', () => {
  // 1. Founder Villager counts toward evaluateEraAdvance role fulfillment & CoinBonus, yet takes 0 Cave slots
  const founderOnlyEval = evaluateEraAdvance({
    era: 'STONE_AGE',
    buildings: [],
    villagers: [
      { id: 'v1', role: 'elder', recruitedAt: 1 },
      { id: 'v2', role: 'woodworker', recruitedAt: 2 },
    ],
    founderRole: 'crafter',
    landExpansions: 3,
    playerLevel: 9,
    totalFocusMinutes: 500,
    coins: 500,
  });
  const roleCheck = founderOnlyEval.checks.find((c) => c.id === 'villager:crafter');
  assert.strictEqual(roleCheck?.met, true);

  // 2. Arithmetic land expansion sequence [30, 40, 50, 60, 70, 80, 95, 110]
  assert.deepStrictEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((k) => getExpansionCost(k)),
    [30, 40, 50, 60, 70, 80, 95, 110]
  );

  // 3. Under-construction Rock Shelter blocks recruitment and under-construction economy buildings give 0 CoinBonus
  const jobs: ConstructionJob[] = [
    {
      id: 'j_cave',
      kind: 'place',
      status: 'ACTIVE',
      definitionId: 'stone_age_study_cave',
      buildingId: 'b_cave',
      crewRequired: 1,
      totalSeconds: 3600,
      remainingSeconds: 1800,
      paidCoins: 12,
      createdAt: 1,
    },
    {
      id: 'j_forage',
      kind: 'place',
      status: 'PENDING',
      definitionId: 'stone_age_foraging_post',
      buildingId: 'b_forage',
      crewRequired: 1,
      totalSeconds: 3600,
      remainingSeconds: 3600,
      paidCoins: 15,
      createdAt: 2,
    },
  ];
  const buildings: BuildingInstance[] = [
    { id: 'b_cave', definitionId: 'stone_age_study_cave', position: { x: 0, y: 0 }, level: 1, placedAt: 1 },
    { id: 'b_forage', definitionId: 'stone_age_foraging_post', position: { x: 4, y: 0 }, level: 1, placedAt: 2 },
  ];
  assert.strictEqual(findVillageCave(buildings, jobs), undefined);
  const bonuses = extractCivilizationCoinBonuses(buildings, [], jobs, 'crafter');
  assert.strictEqual(
    bonuses.filter((b) => b.source === 'BUILDING').length,
    0,
    'Under-construction economy building must grant 0 CoinBonus'
  );
  assert.strictEqual(bonuses.length, 1);
  assert.strictEqual(bonuses[0].rate, VILLAGER_CRAFTER_COIN_BONUS_RATE);
});

test('EconomyBalance Suite 6 (5E-2): Prioritizing economy & cave jobs via assignJobsWithSchedule preserves Bronze Age days within +-1d and zero passive income', () => {
  const baseline60 = simulateStoneToBronzeProgression5E1([60]);
  const baseline60x3 = simulateStoneToBronzeProgression5E1([60, 60, 60]);

  const prioritizeEconomyAndCave = (jobs: readonly ConstructionJob[]) => {
    const rank = (j: ConstructionJob) =>
      j.definitionId === 'stone_age_study_cave'
        ? 0
        : j.definitionId === 'stone_age_foraging_post' || j.definitionId === 'stone_age_food_cache'
        ? 1
        : 2;
    const priorityJobIds = [...jobs]
      .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)
      .slice(0, 4)
      .map((j) => j.id);
    return {
      priorityJobIds,
      autoContinue: true,
    };
  };

  const manual60 = simulateStoneToBronzeProgression5E1([60], {
    scheduleOptionsFactory: prioritizeEconomyAndCave,
  });
  const manual60x3 = simulateStoneToBronzeProgression5E1([60, 60, 60], {
    scheduleOptionsFactory: prioritizeEconomyAndCave,
  });

  assert.ok(manual60.daysToEligible < 99 && manual60x3.daysToEligible < 99, '5E-2 scheduled run must reach Bronze Age');
  assert.ok(
    Math.abs(manual60.daysToEligible - baseline60.daysToEligible) <= 1,
    `[60] manual=${manual60.daysToEligible}d vs 5E-1=${baseline60.daysToEligible}d exceeded +-1d`
  );
  assert.ok(
    Math.abs(manual60x3.daysToEligible - baseline60x3.daysToEligible) <= 1,
    `[60,60,60] manual=${manual60x3.daysToEligible}d vs 5E-1=${baseline60x3.daysToEligible}d exceeded +-1d`
  );

  // Also verify assignJobsWithSchedule returns identical idle/active breakdown when no priority list is set
  const sampleJobs = [
    {
      id: 'j_bal',
      kind: 'place' as const,
      status: 'PENDING' as const,
      definitionId: 'stone_age_foraging_post',
      buildingId: 'b_bal',
      crewRequired: 1,
      totalSeconds: 3600,
      remainingSeconds: 3600,
      paidCoins: 15,
      createdAt: 1,
    },
  ];
  assert.deepStrictEqual(assignJobsWithSchedule(sampleJobs, 2), assignJobsFifo(sampleJobs, 2));
});


