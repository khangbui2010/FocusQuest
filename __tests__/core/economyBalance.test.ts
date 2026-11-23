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
  getExpansionStepRatio,
} from '../../src/core/civilization/landExpansion.ts';
import { LAND_EXPANSION_RATIO_CAP } from '../../src/core/civilization/constants.ts';
import { getVillagerRecruitCost } from '../../src/core/civilization/villager.ts';
import {
  STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
  evaluateEraAdvance,
  getEffectiveMaxLevel,
} from '../../src/core/civilization/eraRules.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';
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

test('EconomyBalance Suite 1: Rebalanced Stone Age costs (7,845 max total) & land expansion monotonicity', () => {
  const expectedCosts: Record<string, number> = {
    stone_age_campfire: 8,
    stone_age_totem: 15,
    stone_age_study_cave: 25,
    stone_age_elder_hut: 40,
    stone_age_foraging_post: 30,
    stone_age_food_cache: 60,
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

  // Exact Stone Age total:
  // 8 (Campfire) + 15 (Totem) + 514 (Cave L1..5) + 40 (Elder's Hut)
  // + 4*475=1900 (Foraging Posts L1..5) + 4*1342=5368 (Granaries L1..5) = 7,845
  assert.strictEqual(maxStoneAgeBuildAndUpgradeTotal, 7845);

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

  // Crafter villagers 1..10 (+3% CoinBonus each at base villager recruit cost)
  for (let count = 0; count < 10; count += 1) {
    const recruitCost = getVillagerRecruitCost(count);
    const paybackDays = recruitCost / (0.03 * REFERENCE_BASE_COINS_PER_DAY);
    assert.ok(
      paybackDays <= 60,
      `Crafter #${count + 1} (cost ${recruitCost}) payback ${paybackDays.toFixed(2)}d exceeds 60d`
    );
  }
});

interface SimResult {
  daysToEligible: number;
  finalCoins: number;
  finalLevel: number;
  finalMinutes: number;
  finalBonusRate: number;
  crafterCount: number;
  forageCount: number;
  granaryCount: number;
}

function simulateStoneToBronzeProgression(dailySessionMinutes: readonly number[]): SimResult {
  let coins = 0;
  let totalXP = 0;
  let totalFocusMinutes = 0;
  let buildings: BuildingInstance[] = [];
  let crafters = 0;
  let hasCave = false;
  let caveLevel = 0;
  let elderCount = 0;
  let woodworkerCount = 0;
  let hasCampfire = false;
  let hasTotem = false;
  let hasElderHut = false;
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

  const getCurrentCoinBonus = (): number => {
    let b = 0;
    for (const inst of buildings) {
      if (inst.definitionId === foragingDef.id) b += 0.02 * inst.level;
      if (inst.definitionId === granaryDef.id) b += 0.03 * inst.level;
    }
    b += Math.min(0.3, crafters * 0.03);
    if (crafters >= 1 && elderCount >= 1 && woodworkerCount >= 1) b += 0.05;
    return b;
  };

  for (let day = 1; day <= 35; day += 1) {
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
      const villagerCount = crafters + elderCount + woodworkerCount;

      // Candidate 1: Floor requirement buildings/upgrades first by lowest cost or highest Coin ROI
      type ActionCandidate = {
        roiScore: number;
        cost: number;
        apply: () => void;
      };
      const candidates: ActionCandidate[] = [];

      // Economy buildings (build up to 4 each, upgrade up to floor Lv.4)
      const forageInstances = buildings.filter((b) => b.definitionId === foragingDef.id);
      if (
        forageInstances.length < 4 &&
        playerLevel >= foragingDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= foragingDef.unlockRequirements.minTotalFocusMinutes
      ) {
        candidates.push({
          roiScore: 0.02 / foragingDef.baseCost,
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
        if (inst.level < 4 && playerLevel >= foragingDef.unlockRequirements.minPlayerLevel + inst.level) {
          const upCost = calculateUpgradeCost(foragingDef, inst.level);
          candidates.push({
            roiScore: 0.02 / upCost,
            cost: upCost,
            apply: () => {
              buildings = buildings.map((b) =>
                b.id === inst.id ? { ...b, level: b.level + 1 } : b
              );
            },
          });
        }
      }

      const granaryInstances = buildings.filter((b) => b.definitionId === granaryDef.id);
      if (
        granaryInstances.length < 4 &&
        playerLevel >= granaryDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= granaryDef.unlockRequirements.minTotalFocusMinutes
      ) {
        candidates.push({
          roiScore: 0.03 / granaryDef.baseCost,
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
        if (inst.level < 4 && playerLevel >= granaryDef.unlockRequirements.minPlayerLevel + inst.level) {
          const upCost = calculateUpgradeCost(granaryDef, inst.level);
          candidates.push({
            roiScore: 0.03 / upCost,
            cost: upCost,
            apply: () => {
              buildings = buildings.map((b) =>
                b.id === inst.id ? { ...b, level: b.level + 1 } : b
              );
            },
          });
        }
      }

      // Cave for villagers + floor Lv.4
      if (
        !hasCave &&
        playerLevel >= caveDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= caveDef.unlockRequirements.minTotalFocusMinutes
      ) {
        candidates.push({
          roiScore: 0.0005, // unlocks crafters
          cost: caveDef.baseCost,
          apply: () => {
            hasCave = true;
            caveLevel = 1;
            buildings.push({
              id: `b_cave`,
              definitionId: caveDef.id,
              position: { x: 0, y: 0 },
              level: 1,
              placedAt: dayMs,
            });
          },
        });
      } else if (hasCave && caveLevel < 4 && playerLevel >= caveDef.unlockRequirements.minPlayerLevel + caveLevel) {
        const caveUpCost = calculateUpgradeCost(caveDef, caveLevel);
        candidates.push({
          roiScore: 0.0002,
          cost: caveUpCost,
          apply: () => {
            caveLevel += 1;
            buildings = buildings.map((b) =>
              b.definitionId === caveDef.id ? { ...b, level: caveLevel } : b
            );
          },
        });
      }

      // Recruit Crafters if Cave capacity allows (keep total count efficient: up to 4 crafters)
      if (hasCave && villagerCount < caveLevel * 2 && crafters < 4) {
        const recCost = getVillagerRecruitCost(villagerCount);
        candidates.push({
          roiScore: 0.03 / recCost,
          cost: recCost,
          apply: () => {
            crafters += 1;
          },
        });
      }

      // Checklist prerequisite buildings (Campfire, Totem, Elder Hut) once we have economy momentum
      if (!hasCampfire && day >= 5) {
        candidates.push({
          roiScore: 0.0001,
          cost: campfireDef.baseCost,
          apply: () => {
            hasCampfire = true;
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
      if (!hasTotem && totalFocusMinutes >= totemDef.unlockRequirements.minTotalFocusMinutes && day >= 5) {
        candidates.push({
          roiScore: 0.0001,
          cost: totemDef.baseCost,
          apply: () => {
            hasTotem = true;
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
        !hasElderHut &&
        playerLevel >= elderHutDef.unlockRequirements.minPlayerLevel &&
        totalFocusMinutes >= elderHutDef.unlockRequirements.minTotalFocusMinutes &&
        day >= 5
      ) {
        candidates.push({
          roiScore: 0.0001,
          cost: elderHutDef.baseCost,
          apply: () => {
            hasElderHut = true;
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

      // Sort affordable candidates by ROI score descending, only buy positive-ROI if time left or required floor incomplete
      const affordable = candidates
        .filter((c) => c.cost <= coins)
        .sort((a, b) => b.roiScore - a.roiScore);

      if (affordable.length > 0) {
        const best = affordable[0];
        // Check if floor checklist is already complete; if complete, stop spending so we save >= 3500 Coins for feeCoins
        const preEval = evaluateEraAdvance({
          era: 'STONE_AGE',
          buildings,
          playerLevel,
          totalFocusMinutes,
          coins: 999999,
        });
        const buildingsReady = preEval.checks
          .filter((chk) => chk.id.startsWith('building:'))
          .every((chk) => chk.met);

        if (!buildingsReady) {
          coins -= best.cost;
          best.apply();
          boughtSomething = true;
        }
      }
    }

    const playerLevel = calculatePlayerLevel(totalXP);
    const evalResult = evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings,
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
        crafterCount: crafters,
        forageCount: buildings.filter((b) => b.definitionId === foragingDef.id).length,
        granaryCount: buildings.filter((b) => b.definitionId === granaryDef.id).length,
      };
    }
  }

  return {
    daysToEligible: 99,
    finalCoins: coins,
    finalLevel: calculatePlayerLevel(totalXP),
    finalMinutes: totalFocusMinutes,
    finalBonusRate: getCurrentCoinBonus(),
    crafterCount: crafters,
    forageCount: buildings.filter((b) => b.definitionId === foragingDef.id).length,
    granaryCount: buildings.filter((b) => b.definitionId === granaryDef.id).length,
  };
}

test('EconomyBalance Suite 3: 3h/day profiles reach Stone -> Bronze eligibility within 1-2 weeks (9, 11, 12, 14 days +-1d)', () => {
  const res180 = simulateStoneToBronzeProgression([180]);
  const res90 = simulateStoneToBronzeProgression([90, 90]);
  const res60 = simulateStoneToBronzeProgression([60, 60, 60]);
  const res45 = simulateStoneToBronzeProgression([45, 45, 45, 45]);

  assert.ok(
    Math.abs(res180.daysToEligible - 9) <= 1,
    `[180] expected ~9 (+-1) days, got ${res180.daysToEligible} (coins=${res180.finalCoins.toFixed(1)}, lv=${res180.finalLevel}, mins=${res180.finalMinutes})`
  );
  assert.ok(
    Math.abs(res90.daysToEligible - 11) <= 1,
    `[90,90] expected ~11 (+-1) days, got ${res90.daysToEligible} (coins=${res90.finalCoins.toFixed(1)}, lv=${res90.finalLevel}, mins=${res90.finalMinutes})`
  );
  assert.ok(
    Math.abs(res60.daysToEligible - 12) <= 1,
    `[60,60,60] expected ~12 (+-1) days, got ${res60.daysToEligible} (coins=${res60.finalCoins.toFixed(1)}, lv=${res60.finalLevel}, mins=${res60.finalMinutes})`
  );
  assert.ok(
    Math.abs(res45.daysToEligible - 14) <= 1,
    `[45,45,45,45] expected ~14 (+-1) days, got ${res45.daysToEligible} (coins=${res45.finalCoins.toFixed(1)}, lv=${res45.finalLevel}, mins=${res45.finalMinutes})`
  );
});

test('EconomyBalance Suite 4: Floor build+upgrade sum (4,303) + feeCoins (3,500) = 7,803 matching STONE_TO_BRONZE_ADVANCE_REQUIREMENTS', () => {
  let floorBuildUpgradeSum = 0;
  for (const req of STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.buildingRequirements) {
    const def = getBuildingDefinition(req.definitionId);
    assert.ok(def, `Missing def ${req.definitionId}`);
    const perBuildingCost = calculateTotalBuildingCoinsSpent(def, req.minLevel);
    floorBuildUpgradeSum += req.minCount * perBuildingCost;
  }

  assert.strictEqual(floorBuildUpgradeSum, 4303);
  assert.strictEqual(STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.feeCoins, 3500);
  assert.strictEqual(floorBuildUpgradeSum + STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.feeCoins, 7803);
});
