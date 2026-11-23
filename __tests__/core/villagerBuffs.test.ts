import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCostDiscount,
  extractVillagerCoinBonuses,
  getVillagerBuffSummary,
  getVillagerRoleCounts,
  hasCompleteTribeSynergy,
} from '../../src/core/civilization/villagerBuffs.ts';
import {
  VILLAGER_COMPLETE_TRIBE_COIN_BONUS,
  VILLAGER_CRAFTER_COIN_BONUS_CAP,
  VILLAGER_CRAFTER_COIN_BONUS_RATE,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE,
} from '../../src/core/civilization/constants.ts';
import { extractCivilizationCoinBonuses } from '../../src/core/civilization/civilizationBonusHelper.ts';
import { aggregateCoinBonus } from '../../src/core/economy/coinBonus.ts';
import { Villager } from '../../src/core/civilization/villager.ts';
import { VillagerRole } from '../../src/ui/components/civilization/spriteRegistry.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';

const EPSILON = 1e-9;

function makeVillagers(spec: Partial<Record<VillagerRole, number>>): Villager[] {
  const result: Villager[] = [];
  let idx = 0;
  (['elder', 'crafter', 'woodworker'] as const).forEach((role) => {
    const count = spec[role] ?? 0;
    for (let i = 0; i < count; i += 1) {
      idx += 1;
      result.push({
        id: `v_${role}_${idx}`,
        role,
        recruitedAt: 1700000000000 + idx,
      });
    }
  });
  return result;
}

test('VillagerBuffs: getVillagerRoleCounts handles empty, null, undefined, malformed, and frozen inputs cleanly', () => {
  assert.deepStrictEqual(getVillagerRoleCounts(undefined), { elder: 0, crafter: 0, woodworker: 0, total: 0 });
  assert.deepStrictEqual(getVillagerRoleCounts(null), { elder: 0, crafter: 0, woodworker: 0, total: 0 });
  assert.deepStrictEqual(getVillagerRoleCounts([]), { elder: 0, crafter: 0, woodworker: 0, total: 0 });

  const mixed = Object.freeze([
    null,
    undefined,
    { id: 'bad', role: 'warrior', recruitedAt: 1 },
    { id: 'v1', role: 'elder', recruitedAt: 10 },
    { id: 'v2', role: 'crafter', recruitedAt: 20 },
    { id: 'v3', role: 'crafter', recruitedAt: 30 },
    { id: 'v4', role: 'woodworker', recruitedAt: 40 },
  ]) as unknown as readonly Villager[];

  assert.deepStrictEqual(getVillagerRoleCounts(mixed), {
    elder: 1,
    crafter: 2,
    woodworker: 1,
    total: 4,
  });
});

test('VillagerBuffs: Crafter scales +5% per villager and caps strictly at +40% (8 crafters)', () => {
  assert.strictEqual(VILLAGER_CRAFTER_COIN_BONUS_RATE, 0.05);
  assert.strictEqual(VILLAGER_CRAFTER_COIN_BONUS_CAP, 0.4);

  for (let c = 0; c <= 10; c += 1) {
    const villagers = makeVillagers({ crafter: c });
    const summary = getVillagerBuffSummary(villagers);
    const expected = Math.min(VILLAGER_CRAFTER_COIN_BONUS_CAP, c * VILLAGER_CRAFTER_COIN_BONUS_RATE);
    assert.ok(Math.abs(summary.crafterCoinBonus - expected) < EPSILON, `c=${c}: got ${summary.crafterCoinBonus}`);
    assert.strictEqual(summary.crafterAtCap, c >= 8);
    assert.strictEqual(summary.hasCompleteTribe, false);
    assert.strictEqual(summary.tribeCoinBonus, 0);
    assert.ok(Math.abs(summary.totalCoinBonus - expected) < EPSILON);
  }

  // 9th crafter adds 0 extra CoinBonus
  const s8 = getVillagerBuffSummary(makeVillagers({ crafter: 8 }));
  const s9 = getVillagerBuffSummary(makeVillagers({ crafter: 9 }));
  assert.strictEqual(s8.crafterCoinBonus, 0.4);
  assert.strictEqual(s9.crafterCoinBonus, 0.4);
});

test('VillagerBuffs: Woodworker scales -5% expansion discount and caps strictly at -40% (8 woodworkers)', () => {
  assert.strictEqual(VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE, 0.05);
  assert.strictEqual(VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP, 0.4);

  for (let w = 0; w <= 10; w += 1) {
    const summary = getVillagerBuffSummary(makeVillagers({ woodworker: w }));
    const expected = Math.min(
      VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP,
      w * VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE
    );
    assert.ok(
      Math.abs(summary.expansionDiscountRate - expected) < EPSILON,
      `w=${w}: got ${summary.expansionDiscountRate}`
    );
    assert.strictEqual(summary.expansionAtCap, w >= 8);
  }
});

test('VillagerBuffs: Elder scales -6% upgrade discount (4 -> 24%, 5 -> 30% cap, 6 -> 30% cap)', () => {
  assert.strictEqual(VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE, 0.06);
  assert.strictEqual(VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP, 0.3);

  const s4 = getVillagerBuffSummary(makeVillagers({ elder: 4 }));
  assert.ok(Math.abs(s4.upgradeDiscountRate - 0.24) < EPSILON);
  assert.strictEqual(s4.upgradeAtCap, false);

  const s5 = getVillagerBuffSummary(makeVillagers({ elder: 5 }));
  assert.ok(Math.abs(s5.upgradeDiscountRate - 0.3) < EPSILON);
  assert.strictEqual(s5.upgradeAtCap, true);

  const s6 = getVillagerBuffSummary(makeVillagers({ elder: 6 }));
  assert.ok(Math.abs(s6.upgradeDiscountRate - 0.3) < EPSILON);
  assert.strictEqual(s6.upgradeAtCap, true);
});

test('VillagerBuffs: Complete Tribe synergy grants +10% CoinBonus strictly when all 3 roles exist', () => {
  assert.strictEqual(VILLAGER_COMPLETE_TRIBE_COIN_BONUS, 0.1);
  assert.strictEqual(hasCompleteTribeSynergy(makeVillagers({ elder: 5, crafter: 5 })), false);
  assert.strictEqual(hasCompleteTribeSynergy(makeVillagers({ elder: 1, woodworker: 9 })), false);
  assert.strictEqual(hasCompleteTribeSynergy(makeVillagers({ crafter: 9, woodworker: 1 })), false);
  assert.strictEqual(hasCompleteTribeSynergy(makeVillagers({ elder: 1, crafter: 1, woodworker: 1 })), true);

  const summary = getVillagerBuffSummary(makeVillagers({ elder: 1, crafter: 3, woodworker: 1 }));
  assert.strictEqual(summary.hasCompleteTribe, true);
  assert.strictEqual(summary.tribeCoinBonus, VILLAGER_COMPLETE_TRIBE_COIN_BONUS);
  assert.ok(Math.abs(summary.crafterCoinBonus - 0.15) < EPSILON);
  assert.ok(Math.abs(summary.totalCoinBonus - 0.25) < EPSILON);

  const bonuses = extractVillagerCoinBonuses(makeVillagers({ elder: 1, crafter: 3, woodworker: 1 }));
  assert.strictEqual(bonuses.length, 2);
  assert.ok(Math.abs(aggregateCoinBonus(bonuses) - 0.25) < EPSILON);
});

test('VillagerBuffs: Theoretical CoinBonus ceiling is +150% (+100% buildings + +40% crafters + +10% tribe)', () => {
  const buildings: BuildingInstance[] = [
    ...([0, 2, 4, 6].map((x, i) => ({
      id: `fp_${i}`,
      definitionId: 'stone_age_foraging_post',
      position: { x, y: 0 },
      level: 5,
      placedAt: 1000 + i,
    }))),
    ...([0, 2, 4, 6].map((x, i) => ({
      id: `gr_${i}`,
      definitionId: 'stone_age_food_cache',
      position: { x, y: 4 },
      level: 5,
      placedAt: 2000 + i,
    }))),
  ];

  const maxRoster = makeVillagers({ crafter: 8, elder: 1, woodworker: 1 });
  const combined = extractCivilizationCoinBonuses(buildings, maxRoster);
  const totalBonus = aggregateCoinBonus(combined);
  assert.ok(
    Math.abs(totalBonus - 1.5) < EPSILON,
    `Expected theoretical ceiling 1.5 (+150%), got ${totalBonus}`
  );
});

test('VillagerBuffs: applyCostDiscount enforces Math.max(1, round(base * (1 - rate))), min 1 Coin, and guards invalid inputs', () => {
  assert.strictEqual(applyCostDiscount(48, 0.2), 38); // round(38.4) = 38
  assert.strictEqual(applyCostDiscount(60, 0.4), 36); // 60 * 0.6 = 36
  assert.strictEqual(applyCostDiscount(75, 0.05), 71); // round(71.25) = 71
  assert.strictEqual(applyCostDiscount(1, 0.99), 1); // never drops below 1 Coin for positive baseCost
  assert.strictEqual(applyCostDiscount(50, 1.5), 1); // discount clamped at 1.0 -> min 1
  assert.strictEqual(applyCostDiscount(50, -0.5), 50); // negative discount clamped at 0
  assert.strictEqual(applyCostDiscount(0, 0.3), 0);
  assert.strictEqual(applyCostDiscount(-10, 0.3), 0);
  assert.strictEqual(applyCostDiscount(Number.NaN, 0.3), 0);
  assert.strictEqual(applyCostDiscount(100, Number.NaN), 100);
});
