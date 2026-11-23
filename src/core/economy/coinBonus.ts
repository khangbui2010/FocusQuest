import { CoinBonus } from '../../types/economy.ts';

/**
 * Pure aggregation of civilization coin bonuses.
 *
 * The final base rate is:
 *   finalBaseRate = baseRateByMode * (1 + totalCoinBonus)
 *   totalCoinBonus = sum(all applicable coin bonuses)
 *
 * Bonuses are strictly additive. They are never multiplied together, and a
 * bonus that appears more than once (same stable id) is only counted once.
 */

/** A bonus rate must be a finite, non-negative fraction. Anything else is ignored. */
export function normalizeCoinBonusRate(rate: unknown): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return rate;
}

/**
 * Sum every valid, unique coin bonus.
 * Returns 0 for empty/undefined input and silently skips malformed entries.
 */
export function aggregateCoinBonus(
  bonuses: readonly CoinBonus[] | null | undefined
): number {
  if (!bonuses || bonuses.length === 0) {
    return 0;
  }

  const seenIds = new Set<string>();
  let total = 0;

  for (const bonus of bonuses) {
    if (!bonus || typeof bonus.id !== 'string' || bonus.id.length === 0) {
      continue;
    }
    if (seenIds.has(bonus.id)) {
      continue; // Same source bonus supplied twice: apply exactly once.
    }
    seenIds.add(bonus.id);
    total += normalizeCoinBonusRate(bonus.rate);
  }

  return total;
}

/**
 * Convert coin bonuses into the multiplier applied to the base coin rate.
 * No bonus => exactly 1.0 (so existing rewards are bit-for-bit unchanged).
 */
export function getCoinBonusMultiplier(
  bonuses: readonly CoinBonus[] | null | undefined
): number {
  return 1 + aggregateCoinBonus(bonuses);
}
