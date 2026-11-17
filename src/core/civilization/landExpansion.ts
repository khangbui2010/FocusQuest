/**
 * Pure Land Expansion Economy & Level Gate Engine for Focus Quest.
 * Milestone 5B.6a: Land Expansion Economy, Adjacent Chunk Selection & Confirmation
 *
 * Pure domain logic: zero UI, zero DOM, zero storage dependencies.
 */

import {
  INITIAL_CHUNK_COUNT,
  LAND_EXPANSION_BASE_COST,
  LAND_EXPANSION_RATIO_BASE,
  LAND_EXPANSION_RATIO_STEP,
  LAND_EXPANSION_RATIO_CAP,
  LAND_EXPANSION_LEVEL_OFFSET,
} from './constants.ts';

export type ExpansionFailureReason = 'LEVEL_TOO_LOW' | 'INSUFFICIENT_COINS';

export interface ExpansionEvaluation {
  readonly canExpand: boolean;
  readonly purchaseIndex: number;
  readonly cost: number;
  readonly requiredLevel: number;
  readonly reason?: ExpansionFailureReason;
}

/**
 * Computes the 1-based purchase index `k` given the current number of unlocked chunks.
 * Initial 8x8 territory has INITIAL_CHUNK_COUNT = 4 chunks -> next purchase is k = 1.
 */
export function getExpansionPurchaseIndex(chunkCount: number): number {
  if (typeof chunkCount !== 'number' || !Number.isFinite(chunkCount)) {
    return 1;
  }
  const completedPurchases = Math.max(0, Math.floor(chunkCount) - INITIAL_CHUNK_COUNT);
  return completedPurchases + 1;
}

/**
 * Computes the marginal growth ratio r_i for step i (1-based) in the expansion cost product:
 * r_i = min(CAP, RATIO_BASE + RATIO_STEP * (i - 1))
 */
export function getExpansionStepRatio(stepIndex: number): number {
  const safeStep = Number.isFinite(stepIndex) ? Math.max(1, Math.floor(stepIndex)) : 1;
  return Math.min(
    LAND_EXPANSION_RATIO_CAP,
    LAND_EXPANSION_RATIO_BASE + LAND_EXPANSION_RATIO_STEP * (safeStep - 1)
  );
}

/**
 * Computes the Focus Coins cost for the k-th land expansion purchase:
 * cost(k) = Math.round(BASE_COST * Π_{i=1}^{k-1} r_i)
 * Keeps floating-point product across intermediate steps and rounds once at the end.
 */
export function getExpansionCost(purchaseIndex: number): number {
  const k =
    typeof purchaseIndex === 'number' && Number.isFinite(purchaseIndex)
      ? Math.max(1, Math.floor(purchaseIndex))
      : 1;

  let product = LAND_EXPANSION_BASE_COST;
  for (let i = 1; i < k; i++) {
    product *= getExpansionStepRatio(i);
  }
  return Math.round(product);
}

/**
 * Computes the minimum Player Level required for the k-th land expansion purchase:
 * requiredLevel(k) = k + LEVEL_OFFSET
 */
export function getExpansionRequiredLevel(purchaseIndex: number): number {
  const k =
    typeof purchaseIndex === 'number' && Number.isFinite(purchaseIndex)
      ? Math.max(1, Math.floor(purchaseIndex))
      : 1;
  return k + LAND_EXPANSION_LEVEL_OFFSET;
}

/**
 * Computes approximate focus minutes in Countdown mode needed to earn a given Coins cost
 * (baseline 1.5 Coins/min at ×1.0, and 3.75 Coins/min at max ×2.5 tier, without CoinBonus).
 */
export function getExpansionFocusMinuteEstimate(cost: number): {
  readonly minutesAt1x: number;
  readonly minutesAtMax25x: number;
} {
  const safeCost = typeof cost === 'number' && Number.isFinite(cost) ? Math.max(0, cost) : 0;
  return {
    minutesAt1x: Math.round(safeCost / 1.5),
    minutesAtMax25x: Math.round(safeCost / (1.5 * 2.5)),
  };
}

/**
 * Pure evaluation of whether the player meets Level and Coin requirements for their next expansion.
 */
export function evaluateExpansion(params: {
  chunkCount: number;
  playerLevel: number;
  coins: number;
}): ExpansionEvaluation {
  const purchaseIndex = getExpansionPurchaseIndex(params.chunkCount);
  const cost = getExpansionCost(purchaseIndex);
  const requiredLevel = getExpansionRequiredLevel(purchaseIndex);

  const safeLevel =
    typeof params.playerLevel === 'number' && Number.isFinite(params.playerLevel)
      ? Math.floor(params.playerLevel)
      : 0;
  const safeCoins =
    typeof params.coins === 'number' && Number.isFinite(params.coins) ? params.coins : 0;

  if (safeLevel < requiredLevel) {
    return {
      canExpand: false,
      purchaseIndex,
      cost,
      requiredLevel,
      reason: 'LEVEL_TOO_LOW',
    };
  }

  if (safeCoins < cost) {
    return {
      canExpand: false,
      purchaseIndex,
      cost,
      requiredLevel,
      reason: 'INSUFFICIENT_COINS',
    };
  }

  return {
    canExpand: true,
    purchaseIndex,
    cost,
    requiredLevel,
  };
}
