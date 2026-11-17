/**
 * Utility functions for formatting rewards, numbers, and stats in UI and notifications.
 */

/**
 * Format reward amounts (Coins, XP) according to canonical precision rules.
 * - Whole integers: "25" -> "25"
 * - Decimals: up to 2 decimal places without trailing zeros (e.g. 7.5 -> "7.5", 7.567 -> "7.57")
 */
export function formatRewardAmount(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '0';
  }
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  if (rounded % 1 === 0) {
    return rounded.toString();
  }
  return parseFloat(rounded.toFixed(2)).toString();
}
