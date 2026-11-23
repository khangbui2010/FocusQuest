/**
 * Economy, progression and reward types
 */

export interface PlayerEconomy {
  focusCoins: number;   // Main game currency, decimal precision preserved (IEEE-754 double)
  totalXP: number;       // Lifetime accumulated experience points
  level: number;         // Current player level
}

/**
 * Where a coin bonus originates from. A bonus may only exist in the system that
 * owns it (buildings, technology, milestones, ...) and is aggregated at reward
 * time, so the same bonus is never stored twice.
 */
export type CoinBonusSource = 'BUILDING' | 'TECHNOLOGY' | 'MILESTONE' | 'OTHER';

/**
 * A single additive coin bonus.
 * `rate` is a fraction: 0.10 means +10%.
 * Bonuses are additive (1 + sum(rates)), never compounded.
 */
export interface CoinBonus {
  id: string;             // Stable unique id, e.g. 'building:library' or 'tech:currency'
  source: CoinBonusSource;
  rate: number;           // Additive fraction (0.10 = +10%)
}

export interface RewardCalculationResult {
  eligibleMinutes: number;   // Valid focus minutes qualified for reward
  actualFocusMinutes: number;// Exact elapsed focus minutes (excluding pauses)
  multiplier: number;        // Final session multiplier applied
  coinBonusMultiplier?: number; // Civilization bonus factor: 1 + sum(coin bonuses)
  rawCoinsEarned?: number;   // Precise coin reward before persistence (decimal preserved)
  coinsEarned: number;       // Exact coins awarded to wallet/economy (decimal preserved)
  rawXpEarned?: number;      // Precise XP reward before persistence
  xpEarned: number;          // XP awarded (XP is never modified by coin bonuses)
  isThresholdMet: boolean;   // Whether minimum requirement met (e.g. >= 5 mins for Stopwatch)
  isCompleted: boolean;      // True if finished normally (Countdown target met or Stopwatch finished)
}
