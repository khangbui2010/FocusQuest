import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_CHUNK_COUNT,
  LAND_EXPANSION_BASE_COST,
  LAND_EXPANSION_RATIO_BASE,
  LAND_EXPANSION_RATIO_STEP,
  LAND_EXPANSION_RATIO_CAP,
  LAND_EXPANSION_LEVEL_OFFSET,
  getExpansionPurchaseIndex,
  getExpansionStepRatio,
  getExpansionCost,
  getExpansionRequiredLevel,
  getExpansionFocusMinuteEstimate,
  evaluateExpansion,
} from '../../src/core/civilization/index.ts';

test('LandExpansion constants match locked 5B.6a economic specification', () => {
  assert.strictEqual(INITIAL_CHUNK_COUNT, 4);
  assert.strictEqual(LAND_EXPANSION_BASE_COST, 60);
  assert.strictEqual(LAND_EXPANSION_RATIO_BASE, 1.25);
  assert.strictEqual(LAND_EXPANSION_RATIO_STEP, 0.01);
  assert.strictEqual(LAND_EXPANSION_RATIO_CAP, 1.5);
  assert.strictEqual(LAND_EXPANSION_LEVEL_OFFSET, 2);
});

test('getExpansionPurchaseIndex computes 1-based purchase order safely', () => {
  assert.strictEqual(getExpansionPurchaseIndex(4), 1);
  assert.strictEqual(getExpansionPurchaseIndex(5), 2);
  assert.strictEqual(getExpansionPurchaseIndex(10), 7);
  // Defensive lower clamp
  assert.strictEqual(getExpansionPurchaseIndex(0), 1);
  assert.strictEqual(getExpansionPurchaseIndex(-5), 1);
  assert.strictEqual(getExpansionPurchaseIndex(Number.NaN), 1);
});

test('getExpansionStepRatio increments by 0.01 and caps cleanly at 1.50', () => {
  assert.strictEqual(getExpansionStepRatio(1), 1.25);
  assert.strictEqual(getExpansionStepRatio(2), 1.26);
  assert.strictEqual(getExpansionStepRatio(10), 1.34);
  assert.strictEqual(getExpansionStepRatio(25), 1.49);
  assert.strictEqual(getExpansionStepRatio(26), 1.5);
  assert.strictEqual(getExpansionStepRatio(40), 1.5);
});

test('getExpansionCost computes 15 progressive purchases monotonically and rounds once at end', () => {
  const expectedFirst6: Array<[number, number]> = [
    [1, 60],
    [2, 75],
    [3, 95],  // 75 * 1.26 = 94.5 -> 95
    [4, 120], // 94.5 * 1.27 = 120.015 -> 120 (not rounded mid-product: 95*1.27=120.65 -> 121)
    [5, 154], // 120.015 * 1.28 = 153.6192 -> 154
    [6, 198], // 153.6192 * 1.29 = 198.168768 -> 198
  ];

  for (const [k, expected] of expectedFirst6) {
    assert.strictEqual(getExpansionCost(k), expected, `Purchase k=${k} cost mismatch`);
  }

  // Strictly monotonically increasing across purchases 1..20
  let prevCost = 0;
  for (let k = 1; k <= 20; k++) {
    const cost = getExpansionCost(k);
    assert.ok(cost > prevCost, `Expected cost(${k})=${cost} > cost(${k - 1})=${prevCost}`);
    prevCost = cost;
  }
});

test('getExpansionRequiredLevel enforces k + 2 progressive level cap', () => {
  for (let k = 1; k <= 15; k++) {
    assert.strictEqual(getExpansionRequiredLevel(k), k + 2);
  }
});

test('getExpansionFocusMinuteEstimate computes Countdown 1.0x and 2.5x equivalents', () => {
  const first = getExpansionFocusMinuteEstimate(60);
  assert.strictEqual(first.minutesAt1x, 40);    // 60 / 1.5 = 40
  assert.strictEqual(first.minutesAtMax25x, 16); // 60 / 3.75 = 16

  const second = getExpansionFocusMinuteEstimate(75);
  assert.strictEqual(second.minutesAt1x, 50);
  assert.strictEqual(second.minutesAtMax25x, 20);
});

test('evaluateExpansion checks Level gate before Coins gate and supports decimal balances', () => {
  // 1. Level too low (even with ample coins) -> LEVEL_TOO_LOW
  const lowLevel = evaluateExpansion({ chunkCount: 4, playerLevel: 2, coins: 1000 });
  assert.strictEqual(lowLevel.canExpand, false);
  assert.strictEqual(lowLevel.purchaseIndex, 1);
  assert.strictEqual(lowLevel.cost, 60);
  assert.strictEqual(lowLevel.requiredLevel, 3);
  assert.strictEqual(lowLevel.reason, 'LEVEL_TOO_LOW');

  // 2. Level met (Lv. 3) but Coins slightly below cost (59.99) -> INSUFFICIENT_COINS
  const lowCoins = evaluateExpansion({ chunkCount: 4, playerLevel: 3, coins: 59.99 });
  assert.strictEqual(lowCoins.canExpand, false);
  assert.strictEqual(lowCoins.reason, 'INSUFFICIENT_COINS');

  // 3. Both Level and float Coins met -> canExpand = true
  const valid = evaluateExpansion({ chunkCount: 4, playerLevel: 3, coins: 60.25 });
  assert.strictEqual(valid.canExpand, true);
  assert.strictEqual(valid.reason, undefined);
  assert.strictEqual(valid.cost, 60);
  assert.strictEqual(valid.requiredLevel, 3);

  // 4. Subsequent expansion (chunkCount = 6 -> k = 3 -> req Lv. 5, cost 95)
  const thirdNeedLevel = evaluateExpansion({ chunkCount: 6, playerLevel: 4, coins: 500 });
  assert.strictEqual(thirdNeedLevel.canExpand, false);
  assert.strictEqual(thirdNeedLevel.purchaseIndex, 3);
  assert.strictEqual(thirdNeedLevel.cost, 95);
  assert.strictEqual(thirdNeedLevel.requiredLevel, 5);
  assert.strictEqual(thirdNeedLevel.reason, 'LEVEL_TOO_LOW');

  const thirdValid = evaluateExpansion({ chunkCount: 6, playerLevel: 5, coins: 95 });
  assert.strictEqual(thirdValid.canExpand, true);
});
