/**
 * Pure Land Expansion Economy & Level Gate Engine for Focus Quest.
 * Milestone 5B.6a: Land Expansion Economy, Adjacent Chunk Selection & Confirmation
 *
 * Pure domain logic: zero UI, zero DOM, zero storage dependencies.
 */

import {
  INITIAL_CHUNK_COUNT,
  LAND_EXPANSION_BASE_COST,
  LAND_EXPANSION_INITIAL_INCREMENT,
  LAND_EXPANSION_STEP_BONUS,
  LAND_EXPANSION_STEP_GROUP_SIZE,
  LAND_EXPANSION_LEVEL_OFFSET,
} from './constants.ts';
import { applyCostDiscount } from './villagerBuffs.ts';

export type ExpansionFailureReason = 'LEVEL_TOO_LOW' | 'INSUFFICIENT_COINS';

export interface ExpansionEvaluation {
  readonly canExpand: boolean;
  readonly purchaseIndex: number;
  readonly baseCost: number;
  readonly discountRate: number;
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
 * Computes the Focus Coins cost for the k-th land expansion purchase (arithmetic progression):
 * cost(1) = BASE_COST (30)
 * cost(k) = BASE_COST + sum_{j=1}^{k-1} (INITIAL_INCREMENT + STEP_BONUS * floor((j - 1) / GROUP_SIZE))
 * k = 1..20 -> [30, 40, 50, 60, 70, 80, 95, 110, 125, 140, 155, 175, 195, 215, 235, 255, 280, 305, 330, 355].
 */
export function getExpansionCost(purchaseIndex: number): number {
  const k =
    typeof purchaseIndex === 'number' && Number.isFinite(purchaseIndex)
      ? Math.max(1, Math.floor(purchaseIndex))
      : 1;

  let cost = LAND_EXPANSION_BASE_COST;
  for (let j = 1; j < k; j++) {
    cost +=
      LAND_EXPANSION_INITIAL_INCREMENT +
      LAND_EXPANSION_STEP_BONUS * Math.floor((j - 1) / LAND_EXPANSION_STEP_GROUP_SIZE);
  }
  return Math.round(cost);
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
  discountRate?: number;
}): ExpansionEvaluation {
  const purchaseIndex = getExpansionPurchaseIndex(params.chunkCount);
  const baseCost = getExpansionCost(purchaseIndex);
  const safeDiscountRate =
    typeof params.discountRate === 'number' && Number.isFinite(params.discountRate)
      ? Math.min(1, Math.max(0, params.discountRate))
      : 0;
  const cost = applyCostDiscount(baseCost, safeDiscountRate);
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
      baseCost,
      discountRate: safeDiscountRate,
      cost,
      requiredLevel,
      reason: 'LEVEL_TOO_LOW',
    };
  }

  if (safeCoins < cost) {
    return {
      canExpand: false,
      purchaseIndex,
      baseCost,
      discountRate: safeDiscountRate,
      cost,
      requiredLevel,
      reason: 'INSUFFICIENT_COINS',
    };
  }

  return {
    canExpand: true,
    purchaseIndex,
    baseCost,
    discountRate: safeDiscountRate,
    cost,
    requiredLevel,
  };
}
