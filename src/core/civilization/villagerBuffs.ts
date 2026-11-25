/**
 * Pure Villager Role Buff Engine for Focus Quest Civilization.
 * Milestone Villager V5.2:
 * - Crafter: +5% additive CoinBonus per villager (cap +40% at 8). Focus Coins only.
 * - Woodworker: -5% land expansion Coin cost per villager (cap -40% at 8). Level gate unchanged.
 * - Elder: -6% building upgrade Coin cost per villager (cap -30% at 5). Upgrades only.
 * - Complete Tribe Synergy: >= 1 elder, >= 1 crafter, >= 1 woodworker -> flat +10% CoinBonus.
 * - Strictly pure, deterministic, non-mutating, defensive against malformed inputs.
 */

import { CoinBonus } from '../../types/economy.ts';
import {
  VillagerRole,
  isVillagerRole,
} from '../../ui/components/civilization/spriteRegistry.ts';
import {
  VILLAGER_COMPLETE_TRIBE_COIN_BONUS,
  VILLAGER_CRAFTER_COIN_BONUS_CAP,
  VILLAGER_CRAFTER_COIN_BONUS_RATE,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE,
} from './constants.ts';
import { Villager } from './villager.ts';

export interface VillagerRoleCounts {
  readonly elder: number;
  readonly crafter: number;
  readonly woodworker: number;
  readonly total: number;
}

export interface VillagerBuffSummary {
  readonly counts: VillagerRoleCounts;
  readonly crafterCoinBonus: number;
  readonly crafterAtCap: boolean;
  readonly tribeCoinBonus: number;
  readonly hasCompleteTribe: boolean;
  readonly totalCoinBonus: number;
  readonly expansionDiscountRate: number;
  readonly expansionAtCap: boolean;
  readonly upgradeDiscountRate: number;
  readonly upgradeAtCap: boolean;
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Counts valid villagers by role without mutating or throwing on malformed inputs.
 * Optional `founderRole` contributes +1 to that role (permanent Founder villager).
 */
export function getVillagerRoleCounts(
  villagers: readonly Villager[] | null | undefined,
  founderRole?: VillagerRole | null
): VillagerRoleCounts {
  let elder = 0;
  let crafter = 0;
  let woodworker = 0;

  if (founderRole && isVillagerRole(founderRole)) {
    if (founderRole === 'elder') {
      elder += 1;
    } else if (founderRole === 'crafter') {
      crafter += 1;
    } else if (founderRole === 'woodworker') {
      woodworker += 1;
    }
  }

  if (Array.isArray(villagers)) {
    for (const v of villagers) {
      if (!v || typeof v !== 'object') {
        continue;
      }
      if (!isVillagerRole(v.role)) {
        continue;
      }
      if (v.role === 'elder') {
        elder += 1;
      } else if (v.role === 'crafter') {
        crafter += 1;
      } else if (v.role === 'woodworker') {
        woodworker += 1;
      }
    }
  }

  return {
    elder,
    crafter,
    woodworker,
    total: elder + crafter + woodworker,
  };
}

/**
 * Checks whether the village has at least 1 elder, 1 crafter, and 1 woodworker.
 */
export function hasCompleteTribeSynergy(
  villagers: readonly Villager[] | null | undefined,
  founderRole?: VillagerRole | null
): boolean {
  const counts = getVillagerRoleCounts(villagers, founderRole);
  return counts.elder >= 1 && counts.crafter >= 1 && counts.woodworker >= 1;
}

/**
 * Computes the complete, capped villager buff summary from the current villager roster + optional Founder.
 */
export function getVillagerBuffSummary(
  villagers: readonly Villager[] | null | undefined,
  founderRole?: VillagerRole | null
): VillagerBuffSummary {
  const counts = getVillagerRoleCounts(villagers, founderRole);
  const crafterCoinBonus = Math.min(
    VILLAGER_CRAFTER_COIN_BONUS_CAP,
    roundRate(counts.crafter * VILLAGER_CRAFTER_COIN_BONUS_RATE)
  );
  const hasCompleteTribe = counts.elder >= 1 && counts.crafter >= 1 && counts.woodworker >= 1;
  const tribeCoinBonus = hasCompleteTribe ? VILLAGER_COMPLETE_TRIBE_COIN_BONUS : 0;
  const totalCoinBonus = roundRate(crafterCoinBonus + tribeCoinBonus);

  const expansionDiscountRate = Math.min(
    VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP,
    roundRate(counts.woodworker * VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE)
  );
  const upgradeDiscountRate = Math.min(
    VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP,
    roundRate(counts.elder * VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE)
  );

  return {
    counts,
    crafterCoinBonus,
    crafterAtCap: crafterCoinBonus >= VILLAGER_CRAFTER_COIN_BONUS_CAP,
    tribeCoinBonus,
    hasCompleteTribe,
    totalCoinBonus,
    expansionDiscountRate,
    expansionAtCap: expansionDiscountRate >= VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP,
    upgradeDiscountRate,
    upgradeAtCap: upgradeDiscountRate >= VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP,
  };
}

/**
 * Extracts additive CoinBonus descriptors from villagers (crafters + complete tribe synergy).
 * Applied strictly to Coins on valid completed Focus sessions via RewardEngine / aggregateCoinBonus.
 */
export function extractVillagerCoinBonuses(
  villagers: readonly Villager[] | null | undefined,
  founderRole?: VillagerRole | null
): readonly CoinBonus[] {
  const summary = getVillagerBuffSummary(villagers, founderRole);
  const bonuses: CoinBonus[] = [];

  if (summary.crafterCoinBonus > 0) {
    bonuses.push({
      id: 'villager:crafter',
      source: 'OTHER',
      rate: summary.crafterCoinBonus,
    });
  }

  if (summary.tribeCoinBonus > 0) {
    bonuses.push({
      id: 'villager:tribe',
      source: 'OTHER',
      rate: summary.tribeCoinBonus,
    });
  }

  return bonuses;
}

/**
 * Applies a Coin discount rate in [0, 1] to a positive base cost.
 * Formula: Math.max(1, Math.round(baseCost * (1 - clampedRate))).
 * Returns 0 if baseCost is not a positive finite number.
 */
export function applyCostDiscount(baseCost: number, discountRate: number): number {
  if (typeof baseCost !== 'number' || !Number.isFinite(baseCost) || baseCost <= 0) {
    return 0;
  }
  const safeRate =
    typeof discountRate === 'number' && Number.isFinite(discountRate)
      ? Math.min(1, Math.max(0, discountRate))
      : 0;

  return Math.max(1, Math.round(baseCost * (1 - safeRate)));
}
