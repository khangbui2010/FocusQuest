import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_CHUNK_COUNT,
  LAND_EXPANSION_BASE_COST,
  LAND_EXPANSION_INITIAL_INCREMENT,
  LAND_EXPANSION_STEP_BONUS,
  LAND_EXPANSION_STEP_GROUP_SIZE,
  LAND_EXPANSION_LEVEL_OFFSET,
  getExpansionPurchaseIndex,
  getExpansionCost,
  getExpansionRequiredLevel,
  getExpansionFocusMinuteEstimate,
  evaluateExpansion,
} from '../../src/core/civilization/index.ts';

test('LandExpansion constants match Stage 5E-1 arithmetic specification', () => {
  assert.strictEqual(INITIAL_CHUNK_COUNT, 4);
  assert.strictEqual(LAND_EXPANSION_BASE_COST, 30);
  assert.strictEqual(LAND_EXPANSION_INITIAL_INCREMENT, 10);
  assert.strictEqual(LAND_EXPANSION_STEP_BONUS, 5);
  assert.strictEqual(LAND_EXPANSION_STEP_GROUP_SIZE, 5);
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

test('getExpansionCost computes exact Stage C arithmetic progression for k=1..20', () => {
  const expectedFirst20 = [
    30, 40, 50, 60, 70, 80, 95, 110, 125, 140,
    155, 175, 195, 215, 235, 255, 280, 305, 330, 355,
  ];

  for (let k = 1; k <= 20; k += 1) {
    assert.strictEqual(
      getExpansionCost(k),
      expectedFirst20[k - 1],
      `Purchase k=${k} cost mismatch`
    );
  }

  // Strictly monotonically increasing across purchases 1..25
  let prevCost = 0;
  for (let k = 1; k <= 25; k++) {
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
  const first = getExpansionFocusMinuteEstimate(30);
  assert.strictEqual(first.minutesAt1x, 20);    // 30 / 1.5 = 20
  assert.strictEqual(first.minutesAtMax25x, 8); // 30 / 3.75 = 8

  const second = getExpansionFocusMinuteEstimate(40);
  assert.strictEqual(second.minutesAt1x, 27);   // round(40 / 1.5) = 27
  assert.strictEqual(second.minutesAtMax25x, 11); // round(40 / 3.75) = 11
});

test('evaluateExpansion checks Level gate before Coins gate and supports decimal balances', () => {
  // 1. Level too low (even with ample coins) -> LEVEL_TOO_LOW
  const lowLevel = evaluateExpansion({ chunkCount: 4, playerLevel: 2, coins: 1000 });
  assert.strictEqual(lowLevel.canExpand, false);
  assert.strictEqual(lowLevel.purchaseIndex, 1);
  assert.strictEqual(lowLevel.cost, 30);
  assert.strictEqual(lowLevel.requiredLevel, 3);
  assert.strictEqual(lowLevel.reason, 'LEVEL_TOO_LOW');

  // 2. Level met (Lv. 3) but Coins slightly below cost (29.99) -> INSUFFICIENT_COINS
  const lowCoins = evaluateExpansion({ chunkCount: 4, playerLevel: 3, coins: 29.99 });
  assert.strictEqual(lowCoins.canExpand, false);
  assert.strictEqual(lowCoins.reason, 'INSUFFICIENT_COINS');

  // 3. Both Level and float Coins met -> canExpand = true
  const valid = evaluateExpansion({ chunkCount: 4, playerLevel: 3, coins: 30.25 });
  assert.strictEqual(valid.canExpand, true);
  assert.strictEqual(valid.reason, undefined);
  assert.strictEqual(valid.cost, 30);
  assert.strictEqual(valid.requiredLevel, 3);

  // 4. Subsequent expansion (chunkCount = 6 -> k = 3 -> req Lv. 5, cost 50)
  const thirdNeedLevel = evaluateExpansion({ chunkCount: 6, playerLevel: 4, coins: 500 });
  assert.strictEqual(thirdNeedLevel.canExpand, false);
  assert.strictEqual(thirdNeedLevel.purchaseIndex, 3);
  assert.strictEqual(thirdNeedLevel.cost, 50);
  assert.strictEqual(thirdNeedLevel.baseCost, 50);
  assert.strictEqual(thirdNeedLevel.discountRate, 0);
  assert.strictEqual(thirdNeedLevel.requiredLevel, 5);
  assert.strictEqual(thirdNeedLevel.reason, 'LEVEL_TOO_LOW');

  const thirdValid = evaluateExpansion({ chunkCount: 6, playerLevel: 5, coins: 50 });
  assert.strictEqual(thirdValid.canExpand, true);

  // 5. Woodworker discount reduces Coin cost without changing requiredLevel (k + 2)
  const discountedThird = evaluateExpansion({
    chunkCount: 6,
    playerLevel: 5,
    coins: 30,
    discountRate: 0.4,
  });
  assert.strictEqual(discountedThird.canExpand, true);
  assert.strictEqual(discountedThird.baseCost, 50);
  assert.strictEqual(discountedThird.discountRate, 0.4);
  assert.strictEqual(discountedThird.cost, 30); // Math.round(50 * 0.6) = 30
  assert.strictEqual(discountedThird.requiredLevel, 5);
});
