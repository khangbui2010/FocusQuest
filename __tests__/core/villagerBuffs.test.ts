import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCostDiscount,
  extractVillagerCoinBonuses,
  getVillagerBuffSummary,
  getVillagerRoleCounts,
  hasCompleteTribeSynergy,
} from '../../src/core/civilization/villagerBuffs.ts';
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

test('VillagerBuffs: Crafter scales +3% per villager and caps strictly at +30% (10 crafters)', () => {
  for (let c = 0; c <= 12; c += 1) {
    const villagers = makeVillagers({ crafter: c });
    const summary = getVillagerBuffSummary(villagers);
    const expected = Math.min(0.3, c * 0.03);
    assert.ok(Math.abs(summary.crafterCoinBonus - expected) < EPSILON, `c=${c}: got ${summary.crafterCoinBonus}`);
    assert.strictEqual(summary.crafterAtCap, c >= 10);
    assert.strictEqual(summary.hasCompleteTribe, false);
    assert.strictEqual(summary.tribeCoinBonus, 0);
    assert.ok(Math.abs(summary.totalCoinBonus - expected) < EPSILON);
  }

  // 11th crafter adds 0 extra CoinBonus
  const s10 = getVillagerBuffSummary(makeVillagers({ crafter: 10 }));
  const s11 = getVillagerBuffSummary(makeVillagers({ crafter: 11 }));
  assert.strictEqual(s10.crafterCoinBonus, 0.3);
  assert.strictEqual(s11.crafterCoinBonus, 0.3);
});

test('VillagerBuffs: Woodworker scales -5% expansion discount and caps strictly at -40% (8 woodworkers)', () => {
  for (let w = 0; w <= 10; w += 1) {
    const summary = getVillagerBuffSummary(makeVillagers({ woodworker: w }));
    const expected = Math.min(0.4, w * 0.05);
    assert.ok(
      Math.abs(summary.expansionDiscountRate - expected) < EPSILON,
      `w=${w}: got ${summary.expansionDiscountRate}`
    );
    assert.strictEqual(summary.expansionAtCap, w >= 8);
  }
});

test('VillagerBuffs: Elder scales -4% upgrade discount (7 -> 28%, 8 -> 30% cap, 9 -> 30% cap)', () => {
  const s7 = getVillagerBuffSummary(makeVillagers({ elder: 7 }));
  assert.ok(Math.abs(s7.upgradeDiscountRate - 0.28) < EPSILON);
  assert.strictEqual(s7.upgradeAtCap, false);

  const s8 = getVillagerBuffSummary(makeVillagers({ elder: 8 }));
  assert.ok(Math.abs(s8.upgradeDiscountRate - 0.3) < EPSILON);
  assert.strictEqual(s8.upgradeAtCap, true);

  const s9 = getVillagerBuffSummary(makeVillagers({ elder: 9 }));
  assert.ok(Math.abs(s9.upgradeDiscountRate - 0.3) < EPSILON);
  assert.strictEqual(s9.upgradeAtCap, true);
});

test('VillagerBuffs: Complete Tribe synergy grants +5% CoinBonus strictly when all 3 roles exist', () => {
  assert.strictEqual(hasCompleteTribeSynergy(makeVillagers({ elder: 5, crafter: 5 })), false);
  assert.strictEqual(hasCompleteTribeSynergy(makeVillagers({ elder: 1, woodworker: 9 })), false);
  assert.strictEqual(hasCompleteTribeSynergy(makeVillagers({ crafter: 9, woodworker: 1 })), false);
  assert.strictEqual(hasCompleteTribeSynergy(makeVillagers({ elder: 1, crafter: 1, woodworker: 1 })), true);

  const summary = getVillagerBuffSummary(makeVillagers({ elder: 1, crafter: 3, woodworker: 1 }));
  assert.strictEqual(summary.hasCompleteTribe, true);
  assert.strictEqual(summary.tribeCoinBonus, 0.05);
  assert.ok(Math.abs(summary.crafterCoinBonus - 0.09) < EPSILON);
  assert.ok(Math.abs(summary.totalCoinBonus - 0.14) < EPSILON);

  const bonuses = extractVillagerCoinBonuses(makeVillagers({ elder: 1, crafter: 3, woodworker: 1 }));
  assert.strictEqual(bonuses.length, 2);
  assert.ok(Math.abs(aggregateCoinBonus(bonuses) - 0.14) < EPSILON);
});

test('VillagerBuffs: Theoretical CoinBonus ceiling is +135% (+100% buildings + +30% crafters + +5% tribe)', () => {
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

  const maxRoster = makeVillagers({ crafter: 10, elder: 1, woodworker: 1 });
  const combined = extractCivilizationCoinBonuses(buildings, maxRoster);
  const totalBonus = aggregateCoinBonus(combined);
  assert.ok(
    Math.abs(totalBonus - 1.35) < EPSILON,
    `Expected theoretical ceiling 1.35 (+135%), got ${totalBonus}`
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
