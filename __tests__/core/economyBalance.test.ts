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
  getExpansionStepRatio,
} from '../../src/core/civilization/landExpansion.ts';
import {
  LAND_EXPANSION_RATIO_CAP,
  VILLAGER_CAPACITY_PER_CAVE_LEVEL,
  VILLAGER_COMPLETE_TRIBE_COIN_BONUS,
  VILLAGER_CRAFTER_COIN_BONUS_RATE,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE,
} from '../../src/core/civilization/constants.ts';
import { getVillagerRecruitCost, Villager } from '../../src/core/civilization/villager.ts';
import { applyCostDiscount, getVillagerBuffSummary } from '../../src/core/civilization/villagerBuffs.ts';
import { extractCivilizationCoinBonuses } from '../../src/core/civilization/civilizationBonusHelper.ts';
import {
  STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
  evaluateEraAdvance,
  getEffectiveMaxLevel,
} from '../../src/core/civilization/eraRules.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';
import { VillagerRole } from '../../src/ui/components/civilization/spriteRegistry.ts';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';
import { DEFAULT_REWARD_CONFIG } from '../../src/core/reward/rewardEngine.ts';
import { calculatePlayerLevel } from '../../src/core/economy/levelSystem.ts';
import {
  applyCompletedSession,
  claimQuest,
  createInitialQuestState,
} from '../../src/core/quests/questEngine.ts';
import {
  DAILY_QUEST_DEFINITIONS,
  WEEKLY_QUEST_DEFINITIONS,
} from '../../src/core/quests/questCatalog.ts';

const REFERENCE_BASE_COINS_PER_DAY = 378; // 3 x 60m Countdown (x1.4) = 180 * 1.5 * 1.4 = 378 Coins/day

test('EconomyBalance Suite 1: V5.2 Stone Age costs (3,907 max total) & land expansion monotonicity', () => {
  const expectedCosts: Record<string, number> = {
    stone_age_campfire: 4,
    stone_age_totem: 8,
    stone_age_study_cave: 12,
    stone_age_elder_hut: 20,
    stone_age_foraging_post: 15,
    stone_age_food_cache: 30,
  };

  let maxStoneAgeBuildAndUpgradeTotal = 0;
  for (const def of STONE_AGE_BUILDING_DEFINITIONS) {
    assert.strictEqual(def.baseCost, expectedCosts[def.id], `baseCost mismatch for ${def.id}`);
    const limit = getBuildingPlacementLimit(def) ?? 1; // decor & elder hut counted at 1 instance
    const effectiveMax = isBuildingDefinitionUpgradeable(def)
      ? getEffectiveMaxLevel(def, 'STONE_AGE')
      : 1;
    const perInstanceCost = calculateTotalBuildingCoinsSpent(def, effectiveMax);
    maxStoneAgeBuildAndUpgradeTotal += limit * perInstanceCost;
  }

  // Exact V5.2 Stone Age total:
  // 4 (Campfire) + 8 (Totem) + 247 (Cave L1..5) + 20 (Elder's Hut)
  // + 4*236=944 (Foraging Posts L1..5) + 4*671=2,684 (Granaries L1..5) = 3,907
  assert.strictEqual(maxStoneAgeBuildAndUpgradeTotal, 3907);

  assert.strictEqual(LAND_EXPANSION_RATIO_CAP, 1.25);
  let prev = 0;
  for (let k = 1; k <= 30; k += 1) {
    assert.strictEqual(getExpansionStepRatio(k), 1.25);
    const cost = getExpansionCost(k);
    assert.ok(cost > prev, `k=${k} cost ${cost} must strictly exceed ${prev}`);
    prev = cost;
  }

  const cost20 = getExpansionCost(20);
  assert.strictEqual(cost20, 4163);
  assert.ok(cost20 <= 5000);
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
  readonly maxElders?: number;
  readonly maxCrafters?: number;
  readonly maxWoodworkers?: number;
  readonly useVillagerBuffs?: boolean;
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
}

function simulateStoneToBronzeProgression(
  dailySessionMinutes: readonly number[],
  options: SimOptions = {}
): SimResult {
  const maxElders = options.maxElders ?? 3;
  const maxCrafters = options.maxCrafters ?? 1;
  const maxWoodworkers = options.maxWoodworkers ?? 1;
  const useVillagerBuffs = options.useVillagerBuffs ?? true;

  let coins = 0;
  let totalXP = 0;
  let totalFocusMinutes = 0;
  let buildings: BuildingInstance[] = [];
  let villagers: Villager[] = [];
  let landExpansions = 0;
  let nextId = 1;

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
      buildings,
      useVillagerBuffs ? villagers : []
    );
    return bonuses.reduce((sum, item) => sum + item.rate, 0);
  };

  for (let day = 1; day <= 40; day += 1) {
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

      questState = applyCompletedSession(
        questState,
        { completedDateKey: dateKey, completedFocusMinutes: mins },
        dayMs
      );
    }

    // Claim completed Daily & Weekly quests (flat Coins + XP, no multipliers/bonuses)
    for (const qDef of DAILY_QUEST_DEFINITIONS) {
      const claimed = claimQuest(questState, 'DAILY', qDef.id, dayMs);
      questState = claimed.state;
      if (claimed.claimed) {
        coins += claimed.coins;
        totalXP += claimed.xp;
      }
    }
    for (const qDef of WEEKLY_QUEST_DEFINITIONS) {
      const claimed = claimQuest(questState, 'WEEKLY', qDef.id, dayMs);
      questState = claimed.state;
      if (claimed.claimed) {
        coins += claimed.coins;
        totalXP += claimed.xp;
      }
    }

    // Spend available Coins optimally towards Stone -> Bronze eligibility
    let boughtSomething = true;
    while (boughtSomething) {
      boughtSomething = false;
      const playerLevel = calculatePlayerLevel(totalXP);
      const buffSummary = useVillagerBuffs
        ? getVillagerBuffSummary(villagers)
        : { upgradeDiscountRate: 0, expansionDiscountRate: 0 };

      const preEval = evaluateEraAdvance({
        era: 'STONE_AGE',
        buildings,
        villagers,
        landExpansions,
        playerLevel,
        totalFocusMinutes,
        coins: Number.MAX_SAFE_INTEGER,
      });
      const nonCoinPrereqsReady = preEval.checks
        .filter(
          (chk) =>
            chk.id !== 'fee_coins' &&
            chk.id !== 'player_level' &&
            chk.id !== 'total_focus_minutes'
        )
        .every((chk) => chk.met);

      // Once all buildings, 3 villager roles & 3 expansions are done, save Coins for feeCoins
      if (nonCoinPrereqsReady) {
        break;
      }

      type ActionCandidate = {
        roiScore: number;
        cost: number;
        apply: () => void;
      };
      const candidates: ActionCandidate[] = [];

      const cave = buildings.find((b) => b.definitionId === caveDef.id);
      const forageInstances = buildings.filter((b) => b.definitionId === foragingDef.id);
      const granaryInstances = buildings.filter((b) => b.definitionId === granaryDef.id);
      const rawCounts = {
        elder: villagers.filter((v) => v.role === 'elder').length,
        crafter: villagers.filter((v) => v.role === 'crafter').length,
        woodworker: villagers.filter((v) => v.role === 'woodworker').length,
      };
      const targetVillagers = maxElders + maxCrafters + maxWoodworkers;

      // Cave (build Lv.1 early to house villagers, upgrade up to floor Lv.5)
      if (
        !cave &&
        playerLevel >= caveDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= caveDef.unlockRequirements.minTotalFocusMinutes
      ) {
        candidates.push({
          roiScore: 0.1,
          cost: caveDef.baseCost,
          apply: () => {
            buildings.push({
              id: 'b_cave',
              definitionId: caveDef.id,
              position: { x: 0, y: 0 },
              level: 1,
              placedAt: dayMs,
            });
          },
        });
      } else if (
        cave &&
        cave.level < caveTargetLevel &&
        playerLevel >= caveDef.unlockRequirements.minPlayerLevel + cave.level
      ) {
        const upCost = applyCostDiscount(
          calculateUpgradeCost(caveDef, cave.level),
          buffSummary.upgradeDiscountRate
        );
        const needCapacityForMix =
          villagers.length >= cave.level * VILLAGER_CAPACITY_PER_CAVE_LEVEL &&
          villagers.length < targetVillagers;
        candidates.push({
          roiScore: (needCapacityForMix ? 0.02 : 0.00001) / upCost,
          cost: upCost,
          apply: () => {
            buildings = buildings.map((b) =>
              b.id === cave.id ? { ...b, level: b.level + 1 } : b
            );
          },
        });
      }

      // Recruit villagers when Cave capacity permits
      if (cave && villagers.length < cave.level * VILLAGER_CAPACITY_PER_CAVE_LEVEL) {
        const recCost = getVillagerRecruitCost(villagers.length);
        const rolesToConsider: VillagerRole[] = [];
        if (rawCounts.elder < maxElders) rolesToConsider.push('elder');
        if (rawCounts.crafter < maxCrafters) rolesToConsider.push('crafter');
        if (rawCounts.woodworker < maxWoodworkers) rolesToConsider.push('woodworker');

        for (const role of rolesToConsider) {
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
          const tribeBoost = completesTribe ? VILLAGER_COMPLETE_TRIBE_COIN_BONUS : 0;
          const roleValue =
            role === 'elder'
              ? VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE * 1.5
              : role === 'crafter'
              ? VILLAGER_CRAFTER_COIN_BONUS_RATE
              : 0.015;
          candidates.push({
            roiScore: (roleValue + tribeBoost) / recCost,
            cost: recCost,
            apply: () => {
              villagers.push({
                id: `v_${nextId++}`,
                role,
                recruitedAt: dayMs,
              });
            },
          });
        }
      }

      // Required land expansions (minLandExpansions = 3)
      if (landExpansions < req.minLandExpansions) {
        const expIndex = landExpansions + 1;
        if (playerLevel >= getExpansionRequiredLevel(expIndex)) {
          const expCost = applyCostDiscount(
            getExpansionCost(expIndex),
            buffSummary.expansionDiscountRate
          );
          candidates.push({
            roiScore: 0.00005 / expCost,
            cost: expCost,
            apply: () => {
              landExpansions += 1;
            },
          });
        }
      }

      // Economy buildings: Foraging Post x4 up to Lv.5
      if (
        forageInstances.length < forageReq.minCount &&
        playerLevel >= foragingDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= foragingDef.unlockRequirements.minTotalFocusMinutes
      ) {
        const rate = getBuildingCoinBonusRateAtLevel(foragingDef, 1);
        candidates.push({
          roiScore: rate / foragingDef.baseCost,
          cost: foragingDef.baseCost,
          apply: () => {
            buildings.push({
              id: `b_${nextId++}`,
              definitionId: foragingDef.id,
              position: { x: 0, y: 0 },
              level: 1,
              placedAt: dayMs,
            });
          },
        });
      }
      for (const inst of forageInstances) {
        if (
          inst.level < forageReq.minLevel &&
          playerLevel >= foragingDef.unlockRequirements.minPlayerLevel + inst.level
        ) {
          const upCost = applyCostDiscount(
            calculateUpgradeCost(foragingDef, inst.level),
            buffSummary.upgradeDiscountRate
          );
          const stepRate = getBuildingCoinBonusRateAtLevel(foragingDef, 1);
          candidates.push({
            roiScore: stepRate / upCost,
            cost: upCost,
            apply: () => {
              buildings = buildings.map((b) =>
                b.id === inst.id ? { ...b, level: b.level + 1 } : b
              );
            },
          });
        }
      }

      // Economy buildings: Primitive Granary x4 up to Lv.5
      if (
        granaryInstances.length < granaryReq.minCount &&
        playerLevel >= granaryDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= granaryDef.unlockRequirements.minTotalFocusMinutes
      ) {
        const rate = getBuildingCoinBonusRateAtLevel(granaryDef, 1);
        candidates.push({
          roiScore: rate / granaryDef.baseCost,
          cost: granaryDef.baseCost,
          apply: () => {
            buildings.push({
              id: `b_${nextId++}`,
              definitionId: granaryDef.id,
              position: { x: 0, y: 0 },
              level: 1,
              placedAt: dayMs,
            });
          },
        });
      }
      for (const inst of granaryInstances) {
        if (
          inst.level < granaryReq.minLevel &&
          playerLevel >= granaryDef.unlockRequirements.minPlayerLevel + inst.level
        ) {
          const upCost = applyCostDiscount(
            calculateUpgradeCost(granaryDef, inst.level),
            buffSummary.upgradeDiscountRate
          );
          const stepRate = getBuildingCoinBonusRateAtLevel(granaryDef, 1);
          candidates.push({
            roiScore: stepRate / upCost,
            cost: upCost,
            apply: () => {
              buildings = buildings.map((b) =>
                b.id === inst.id ? { ...b, level: b.level + 1 } : b
              );
            },
          });
        }
      }

      // Checklist prerequisite buildings (Campfire, Totem, Elder Hut)
      if (!buildings.some((b) => b.definitionId === campfireDef.id)) {
        candidates.push({
          roiScore: 0.00001 / campfireDef.baseCost,
          cost: campfireDef.baseCost,
          apply: () => {
            buildings.push({
              id: `b_${nextId++}`,
              definitionId: campfireDef.id,
              position: { x: 0, y: 0 },
              level: 1,
              placedAt: dayMs,
            });
          },
        });
      }
      if (
        !buildings.some((b) => b.definitionId === totemDef.id) &&
        totalFocusMinutes >= totemDef.unlockRequirements.minTotalFocusMinutes
      ) {
        candidates.push({
          roiScore: 0.00001 / totemDef.baseCost,
          cost: totemDef.baseCost,
          apply: () => {
            buildings.push({
              id: `b_${nextId++}`,
              definitionId: totemDef.id,
              position: { x: 0, y: 0 },
              level: 1,
              placedAt: dayMs,
            });
          },
        });
      }
      if (
        !buildings.some((b) => b.definitionId === elderHutDef.id) &&
        playerLevel >= elderHutDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= elderHutDef.unlockRequirements.minTotalFocusMinutes
      ) {
        candidates.push({
          roiScore: 0.00001 / elderHutDef.baseCost,
          cost: elderHutDef.baseCost,
          apply: () => {
            buildings.push({
              id: `b_${nextId++}`,
              definitionId: elderHutDef.id,
              position: { x: 0, y: 0 },
              level: 1,
              placedAt: dayMs,
            });
          },
        });
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

    const playerLevel = calculatePlayerLevel(totalXP);
    const evalResult = evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings,
      villagers,
      landExpansions,
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
        crafterCount: villagers.filter((v) => v.role === 'crafter').length,
        elderCount: villagers.filter((v) => v.role === 'elder').length,
        woodworkerCount: villagers.filter((v) => v.role === 'woodworker').length,
        forageCount: buildings.filter((b) => b.definitionId === foragingDef.id).length,
        granaryCount: buildings.filter((b) => b.definitionId === granaryDef.id).length,
        landExpansions,
      };
    }
  }

  return {
    daysToEligible: 99,
    finalCoins: coins,
    finalLevel: calculatePlayerLevel(totalXP),
    finalMinutes: totalFocusMinutes,
    finalBonusRate: getCurrentCoinBonus(),
    crafterCount: villagers.filter((v) => v.role === 'crafter').length,
    elderCount: villagers.filter((v) => v.role === 'elder').length,
    woodworkerCount: villagers.filter((v) => v.role === 'woodworker').length,
    forageCount: buildings.filter((b) => b.definitionId === foragingDef.id).length,
    granaryCount: buildings.filter((b) => b.definitionId === granaryDef.id).length,
    landExpansions,
  };
}

test('EconomyBalance Suite 3: V5.2 progression meets 5-7d (3h/day) & ~2w (1-2h/day) targets (+-1d max) and proves buffs help', () => {
  const res180 = simulateStoneToBronzeProgression([180]);
  const res60x3 = simulateStoneToBronzeProgression([60, 60, 60]);
  const res45x4 = simulateStoneToBronzeProgression([45, 45, 45, 45]);
  const res120 = simulateStoneToBronzeProgression([120]);
  const res60x2 = simulateStoneToBronzeProgression([60, 60]);
  const res45x2 = simulateStoneToBronzeProgression([45, 45]);
  const res60 = simulateStoneToBronzeProgression([60]);

  const targets: Array<readonly [string, SimResult, number]> = [
    ['[180]', res180, 4],
    ['[60,60,60]', res60x3, 7],
    ['[45,45,45,45]', res45x4, 7],
    ['[60,60]', res60x2, 9],
    ['[45,45]', res45x2, 13],
    ['[60]', res60, 17],
  ];

  for (const [label, res, expected] of targets) {
    assert.ok(
      Math.abs(res.daysToEligible - expected) <= 1,
      `${label} expected ~${expected} (+-1) days, got ${res.daysToEligible} (coins=${res.finalCoins.toFixed(1)}, lv=${res.finalLevel}, mins=${res.finalMinutes})`
    );
  }

  // Range assertions per V5.2 balance goals
  for (const [label, res] of [
    ['[180]', res180],
    ['[60,60,60]', res60x3],
    ['[45,45,45,45]', res45x4],
  ] as const) {
    assert.ok(
      res.daysToEligible >= 4 && res.daysToEligible <= 8,
      `3h/day profile ${label} got ${res.daysToEligible}d (expected [4, 8])`
    );
  }
  assert.ok(
    res60x3.daysToEligible >= 5 && res60x3.daysToEligible <= 7,
    `Reference [60,60,60] got ${res60x3.daysToEligible}d (expected [5, 7])`
  );
  assert.ok(
    res120.daysToEligible >= 7 && res120.daysToEligible <= 11,
    `2h [120] got ${res120.daysToEligible}d`
  );
  for (const [label, res] of [
    ['[45,45]', res45x2],
    ['[60]', res60],
  ] as const) {
    assert.ok(
      res.daysToEligible >= 12 && res.daysToEligible <= 19,
      `1-1.5h/day profile ${label} got ${res.daysToEligible}d (expected [12, 19])`
    );
  }

  // "Buffs help" verification: villager buffs strictly shorten time to Bronze Age
  const res60NoBuff = simulateStoneToBronzeProgression([60], {
    maxElders: 1,
    maxCrafters: 1,
    maxWoodworkers: 1,
    useVillagerBuffs: false,
  });
  const res60x2NoBuff = simulateStoneToBronzeProgression([60, 60], {
    maxElders: 1,
    maxCrafters: 1,
    maxWoodworkers: 1,
    useVillagerBuffs: false,
  });
  const res45x2NoBuff = simulateStoneToBronzeProgression([45, 45], {
    maxElders: 1,
    maxCrafters: 1,
    maxWoodworkers: 1,
    useVillagerBuffs: false,
  });

  assert.ok(
    res60.daysToEligible < res60NoBuff.daysToEligible,
    `Expected villager buffs to speed up [60]: withBuffs=${res60.daysToEligible}d vs noBuffs=${res60NoBuff.daysToEligible}d`
  );
  assert.ok(
    res60x2.daysToEligible < res60x2NoBuff.daysToEligible,
    `Expected villager buffs to speed up [60,60]: withBuffs=${res60x2.daysToEligible}d vs noBuffs=${res60x2NoBuff.daysToEligible}d`
  );
  assert.ok(
    res45x2.daysToEligible < res45x2NoBuff.daysToEligible,
    `Expected villager buffs to speed up [45,45]: withBuffs=${res45x2.daysToEligible}d vs noBuffs=${res45x2NoBuff.daysToEligible}d`
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
