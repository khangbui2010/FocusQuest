/**
 * Milestone 5C-2b — Bronze Age Balance & Progression Simulator
 *
 * Strictly CLI / design-validation tool (lives outside src/, public/, __tests__/, dist/).
 * Imports pure functions directly from src/core/ without duplicating formulas.
 *
 * Usage:
 *   npx tsx scripts/simulateBronzeAge.ts
 */

import {
  STONE_AGE_BUILDING_DEFINITIONS,
  calculateUpgradeCost,
  getBuildingDefinition,
} from '../src/core/civilization/buildingCatalog.ts';
import {
  BuildingCategory,
  BuildingDefinition,
  BuildingInstance,
  CivilizationEra,
} from '../src/core/civilization/buildingTypes.ts';
import {
  calculateTotalBuildingCoinsSpent,
  getBuildingCoinBonusRateAtLevel,
  getBuildingPlacementLimit,
  getBuildingUpgradeRequiredPlayerLevel,
} from '../src/core/civilization/buildingUpgrade.ts';
import { extractCivilizationCoinBonuses } from '../src/core/civilization/civilizationBonusHelper.ts';
import {
  BUILDING_UPGRADE_PLAYER_LEVEL_STEP,
  INITIAL_CHUNK_COUNT,
  VILLAGER_CAPACITY_PER_CAVE_LEVEL,
  VILLAGER_COMPLETE_TRIBE_COIN_BONUS,
  VILLAGER_CRAFTER_COIN_BONUS_RATE,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE,
} from '../src/core/civilization/constants.ts';
import {
  ERA_LEVEL_RULES,
  STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
  evaluateEraAdvance,
  getEffectiveMaxLevel,
} from '../src/core/civilization/eraRules.ts';
import { GridMap } from '../src/core/civilization/gridMap.ts';
import {
  AdvanceableCivilizationState,
  ConstructionJob,
  EXPAND_JOB_SPEC,
  JobSpec,
  advanceJobs,
  assignJobsFifo,
  getClearingOrigins,
  getEffectiveTargetLevel,
  getPlaceJobSpec,
  getTotalVillagerCount,
  getUpgradeJobSpec,
  isBuildingUnderConstruction,
} from '../src/core/civilization/jobs.ts';
import {
  getExpansionCost,
  getExpansionRequiredLevel,
} from '../src/core/civilization/landExpansion.ts';
import { GridCoordinate } from '../src/core/civilization/types.ts';
import {
  Villager,
  evaluateRecruitment,
  findVillageCave,
} from '../src/core/civilization/villager.ts';
import {
  applyCostDiscount,
  getVillagerBuffSummary,
} from '../src/core/civilization/villagerBuffs.ts';
import { aggregateCoinBonus } from '../src/core/economy/coinBonus.ts';
import { calculatePlayerLevel } from '../src/core/economy/levelSystem.ts';
import {
  applyCompletedSession,
  claimQuest,
  createInitialQuestState,
  getActiveQuestDefinitions,
} from '../src/core/quests/questEngine.ts';
import { DEFAULT_REWARD_CONFIG, RewardEngine } from '../src/core/reward/rewardEngine.ts';
import { CoinBonus } from '../src/types/economy.ts';
import {
  BRONZE_VILLAGER_ROLES,
  BronzeVillagerRole,
  VillagerRole,
} from '../src/ui/components/civilization/spriteRegistry.ts';

// ---------------------------------------------------------------------------
// Proposed Bronze Age Catalog & Rules (Milestone 5C-2b Proposal)
// ---------------------------------------------------------------------------

export interface ProposedBronzeBuildingSpec {
  readonly def: BuildingDefinition;
  readonly nameVi: string;
  readonly buildLimit: number;
  readonly placeJob: JobSpec;
  readonly housingSlotsPerLevel?: number;
  readonly requiredVillagers?: number;
  readonly requiredRoles?: readonly (VillagerRole | BronzeVillagerRole)[];
  readonly prerequisiteBuildingIds?: readonly string[];
  readonly floorMinCount: number;
  readonly floorMinLevel: number;
}

export const PROPOSED_BRONZE_GLOBAL_COIN_BONUS_CAP = 2.5; // +250% (+150% Stone + +100% Bronze)
export const PROPOSED_BRONZE_BUILDING_COIN_BONUS_CAP = 0.7; // +70% from 5 Economy buildings
export const PROPOSED_BRONZE_VILLAGER_BASE_COST = 120;
export const PROPOSED_BRONZE_VILLAGER_COST_RATIO = 1.28;
export const PROPOSED_BRONZE_HOUSING_SLOTS_PER_LEVEL = 2; // Longhouse Lv.1..5 -> 2..10 Bronze slots

// Role caps (orthogonal to Stone Age roles: Elder=upgrade cost, Crafter=CoinBonus, Woodworker=land cost)
export const PROPOSED_BRONZE_ROLE_BUFFS = {
  merchantCoinBonusRate: 0.05,
  merchantCoinBonusCap: 0.2, // max 4 Merchants = +20%
  bronzeGuildCoinBonus: 0.1, // >=1 smith, >=1 merchant, >=1 mason = +10%
  smithPlaceDiscountRate: 0.05,
  smithPlaceDiscountCap: 0.2, // max 4 Smiths = -20% on PLACE_BUILDING baseCost
  masonTimeDiscountRate: 0.05,
  masonTimeDiscountCap: 0.2, // max 4 Masons = -20% on place/upgrade construction seconds (min 60s)
} as const;

export const PROPOSED_BRONZE_IRON_FEE_COINS = 1500;

export const PROPOSED_BRONZE_SPECS: readonly ProposedBronzeBuildingSpec[] = [
  // --- DECORATIVE (non-upgradeable) ---
  {
    def: {
      id: 'bronze_apiary',
      name: 'Apiary',
      description: 'Wooden hives tended at the settlement edge for beeswax and honeycraft.',
      era: 'BRONZE_AGE',
      category: 'DECORATIVE',
      footprint: { width: 2, height: 2 },
      baseCost: 70,
      upgradeCostMultiplier: 1.0,
      maxLevel: 1,
      unlockRequirements: { minPlayerLevel: 9, minTotalFocusMinutes: 540, minEra: 'BRONZE_AGE' },
      effects: [],
      iconIdentifier: 'hexagon',
    },
    nameVi: 'Trại Ong',
    buildLimit: 2,
    placeJob: { crew: 1, durationSeconds: 3600 },
    floorMinCount: 1,
    floorMinLevel: 1,
  },
  {
    def: {
      id: 'bronze_watchtower',
      name: 'Watchtower',
      description: 'Timber-and-stone lookout tower guarding expanded settlement borders.',
      era: 'BRONZE_AGE',
      category: 'DECORATIVE',
      footprint: { width: 2, height: 3 },
      baseCost: 110,
      upgradeCostMultiplier: 1.0,
      maxLevel: 1,
      unlockRequirements: { minPlayerLevel: 12, minTotalFocusMinutes: 900, minEra: 'BRONZE_AGE' },
      effects: [],
      iconIdentifier: 'eye',
    },
    nameVi: 'Tháp Canh',
    buildLimit: 2,
    placeJob: { crew: 2, durationSeconds: 5400 },
    requiredVillagers: 11,
    floorMinCount: 1,
    floorMinLevel: 1,
  },

  // --- FOCUS_SUPPORT ---
  {
    def: {
      id: 'bronze_longhouse',
      name: 'Bronze Longhouse',
      description: 'Timber hall housing skilled Bronze Age specialists (+2 Bronze villager slots per level).',
      era: 'BRONZE_AGE',
      category: 'FOCUS_SUPPORT',
      footprint: { width: 4, height: 2 },
      baseCost: 120,
      upgradeCostMultiplier: 1.55,
      maxLevel: 5,
      unlockRequirements: { minPlayerLevel: 10, minTotalFocusMinutes: 600, minEra: 'BRONZE_AGE' },
      effects: [{ type: 'FOCUS_FEATURE_UNLOCK', featureId: 'bronze_villager_housing' }],
      iconIdentifier: 'home',
    },
    nameVi: 'Nhà Dài Đồng',
    buildLimit: 1,
    placeJob: { crew: 2, durationSeconds: 7200 },
    housingSlotsPerLevel: PROPOSED_BRONZE_HOUSING_SLOTS_PER_LEVEL,
    prerequisiteBuildingIds: ['stone_age_study_cave'],
    floorMinCount: 1,
    floorMinLevel: 5,
  },
  {
    def: {
      id: 'bronze_scribe_hall',
      name: 'Scribe Hall',
      description: 'Archive chamber unlocking Bronze-tier session mode and hourly Focus breakdowns.',
      era: 'BRONZE_AGE',
      category: 'FOCUS_SUPPORT',
      footprint: { width: 2, height: 3 },
      baseCost: 180,
      upgradeCostMultiplier: 1.0,
      maxLevel: 1,
      unlockRequirements: { minPlayerLevel: 13, minTotalFocusMinutes: 1000, minEra: 'BRONZE_AGE' },
      effects: [{ type: 'FOCUS_STAT_UNLOCK', statId: 'focus_metric_era_productivity' }],
      iconIdentifier: 'scroll',
    },
    nameVi: 'Nhà Ghi chép',
    buildLimit: 1,
    placeJob: { crew: 2, durationSeconds: 7200 },
    prerequisiteBuildingIds: ['stone_age_elder_hut'],
    floorMinCount: 1,
    floorMinLevel: 1,
  },
  {
    def: {
      id: 'bronze_town_hall',
      name: 'Town Hall',
      description: 'Civic council hall organizing Bronze Age deep-focus presets and settlement milestones.',
      era: 'BRONZE_AGE',
      category: 'FOCUS_SUPPORT',
      footprint: { width: 4, height: 3 },
      baseCost: 420,
      upgradeCostMultiplier: 1.0,
      maxLevel: 1,
      unlockRequirements: { minPlayerLevel: 18, minTotalFocusMinutes: 1800, minEra: 'BRONZE_AGE' },
      effects: [{ type: 'FOCUS_FEATURE_UNLOCK', featureId: 'focus_preset_bronze_council' }],
      iconIdentifier: 'landmark',
    },
    nameVi: 'Tòa Thị chính',
    buildLimit: 1,
    placeJob: { crew: 4, durationSeconds: 14400 },
    requiredVillagers: 14,
    requiredRoles: ['smith', 'merchant', 'mason'],
    prerequisiteBuildingIds: ['bronze_longhouse', 'bronze_scribe_hall'],
    floorMinCount: 1,
    floorMinLevel: 1,
  },

  // --- ECONOMY_EFFECT (capped per type, total +70% CoinBonus) ---
  {
    def: {
      id: 'bronze_market_stall',
      name: 'Market Stall',
      description: 'Barter stall trading surplus goods (+0.5% additive Focus Coins per level).',
      era: 'BRONZE_AGE',
      category: 'ECONOMY_EFFECT',
      footprint: { width: 2, height: 2 },
      baseCost: 80,
      upgradeCostMultiplier: 1.28,
      maxLevel: 10,
      unlockRequirements: { minPlayerLevel: 9, minTotalFocusMinutes: 600, minEra: 'BRONZE_AGE' },
      effects: [{ type: 'COIN_BONUS', rate: 0.005 }],
      iconIdentifier: 'store',
    },
    nameVi: 'Quầy Chợ Đồng',
    buildLimit: 2,
    placeJob: { crew: 1, durationSeconds: 3600 },
    prerequisiteBuildingIds: ['bronze_longhouse'],
    floorMinCount: 2,
    floorMinLevel: 8,
  },
  {
    def: {
      id: 'bronze_irrigated_field',
      name: 'Irrigated Field',
      description: 'Canal-fed crop plot stabilizing harvests (+0.5% additive Focus Coins per level).',
      era: 'BRONZE_AGE',
      category: 'ECONOMY_EFFECT',
      footprint: { width: 3, height: 3 },
      baseCost: 100,
      upgradeCostMultiplier: 1.28,
      maxLevel: 10,
      unlockRequirements: { minPlayerLevel: 11, minTotalFocusMinutes: 800, minEra: 'BRONZE_AGE' },
      effects: [{ type: 'COIN_BONUS', rate: 0.005 }],
      iconIdentifier: 'sprout',
    },
    nameVi: 'Ruộng Tưới tiêu',
    buildLimit: 2,
    placeJob: { crew: 2, durationSeconds: 7200 },
    floorMinCount: 2,
    floorMinLevel: 8,
  },
  {
    def: {
      id: 'bronze_grain_silo',
      name: 'Bronze Grain Silo',
      description: 'Reinforced silo storing irrigated harvests (+0.5% additive Focus Coins per level).',
      era: 'BRONZE_AGE',
      category: 'ECONOMY_EFFECT',
      footprint: { width: 2, height: 3 },
      baseCost: 120,
      upgradeCostMultiplier: 1.28,
      maxLevel: 10,
      unlockRequirements: { minPlayerLevel: 13, minTotalFocusMinutes: 1000, minEra: 'BRONZE_AGE' },
      effects: [{ type: 'COIN_BONUS', rate: 0.005 }],
      iconIdentifier: 'warehouse',
    },
    nameVi: 'Kho Ngũ cốc Đồng',
    buildLimit: 2,
    placeJob: { crew: 2, durationSeconds: 7200 },
    prerequisiteBuildingIds: ['bronze_irrigated_field'],
    floorMinCount: 2,
    floorMinLevel: 8,
  },
  {
    def: {
      id: 'bronze_craft_workshop',
      name: 'Craft Workshop',
      description: 'Artisan workshop shaping tools and pottery (+1% additive Focus Coins per level).',
      era: 'BRONZE_AGE',
      category: 'ECONOMY_EFFECT',
      footprint: { width: 3, height: 2 },
      baseCost: 150,
      upgradeCostMultiplier: 1.3,
      maxLevel: 10,
      unlockRequirements: { minPlayerLevel: 15, minTotalFocusMinutes: 1300, minEra: 'BRONZE_AGE' },
      effects: [{ type: 'COIN_BONUS', rate: 0.01 }],
      iconIdentifier: 'hammer',
    },
    nameVi: 'Xưởng Thủ công',
    buildLimit: 2,
    placeJob: { crew: 3, durationSeconds: 9000 },
    requiredRoles: ['smith'],
    floorMinCount: 2,
    floorMinLevel: 8,
  },
  {
    def: {
      id: 'bronze_forge',
      name: 'Bronze Forge',
      description: 'Smelting furnace casting bronze tools (+1% additive Focus Coins per level).',
      era: 'BRONZE_AGE',
      category: 'ECONOMY_EFFECT',
      footprint: { width: 3, height: 2 },
      baseCost: 190,
      upgradeCostMultiplier: 1.3,
      maxLevel: 10,
      unlockRequirements: { minPlayerLevel: 18, minTotalFocusMinutes: 1600, minEra: 'BRONZE_AGE' },
      effects: [{ type: 'COIN_BONUS', rate: 0.01 }],
      iconIdentifier: 'flame',
    },
    nameVi: 'Lò đúc Đồng',
    buildLimit: 2,
    placeJob: { crew: 3, durationSeconds: 10800 },
    requiredVillagers: 13,
    requiredRoles: ['smith'],
    floorMinCount: 2,
    floorMinLevel: 8,
  },
];

const BRONZE_SPEC_MAP = new Map(PROPOSED_BRONZE_SPECS.map((s) => [s.def.id, s]));

function resolveAnyDef(id: string): BuildingDefinition | undefined {
  return getBuildingDefinition(id) ?? BRONZE_SPEC_MAP.get(id)?.def;
}

function getBronzeRecruitCost(currentBronzeRecruited: number): number {
  return Math.round(
    PROPOSED_BRONZE_VILLAGER_BASE_COST *
      Math.pow(PROPOSED_BRONZE_VILLAGER_COST_RATIO, currentBronzeRecruited)
  );
}

function getEffectiveBronzeJobDuration(baseSeconds: number, masonCount: number): number {
  if (baseSeconds <= 0) return 0;
  const discount = Math.min(
    PROPOSED_BRONZE_ROLE_BUFFS.masonTimeDiscountCap,
    masonCount * PROPOSED_BRONZE_ROLE_BUFFS.masonTimeDiscountRate
  );
  return Math.max(60, Math.round(baseSeconds * (1 - discount)));
}

function findFirstValidPlacement(
  gridMap: GridMap,
  footprint: { readonly width: number; readonly height: number }
): GridCoordinate | null {
  const bounds = gridMap.getBoundingBox();
  for (let y = bounds.minY; y <= bounds.maxY - footprint.height + 1; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX - footprint.width + 1; x += 1) {
      if (gridMap.canPlaceBuilding({ x, y }, footprint).isValid) {
        return { x, y };
      }
    }
  }
  return null;
}

function getCombinedUpgradeCost(def: BuildingDefinition, currentLevel: number): number {
  return calculateUpgradeCost(def, currentLevel);
}

// ---------------------------------------------------------------------------
// Extended Simulation State (Reuses src/core pure functions)
// ---------------------------------------------------------------------------

interface BronzeVillagerRecord {
  readonly id: string;
  readonly role: BronzeVillagerRole;
  readonly recruitedAt: number;
}

interface SimSummaryRow {
  readonly label: string;
  readonly sessions: readonly number[];
  readonly completionRate: number;
  readonly stoneToBronzeDays: number;
  readonly stoneEntryCoins: number;
  readonly stoneEntryLevel: number;
  readonly stoneEntryBonus: number;
  readonly bronzeFloorDaysAfterAdvance: number;
  readonly bronzeMaxDaysAfterAdvance: number;
  readonly bronzeMaxTotalDays: number;
  readonly bronzeMaxLevel: number;
  readonly bronzeMaxBonus: number;
  readonly coinsPerFocusHourBeforeBronze: number;
  readonly coinsPerFocusHourAfterBronze: number;
  readonly bronzeTotalJobSeconds: number;
  readonly stoneJobSeconds: number;
  readonly landExpansionsAtMax: number;
  readonly stoneVillagersAtMax: number;
  readonly bronzeVillagersAtMax: number;
  readonly finalCoins: number;
}

const rewardEngine = new RewardEngine(DEFAULT_REWARD_CONFIG);

function runProfileSimulation(
  label: string,
  dailySessionMinutes: readonly number[],
  options: {
    readonly completionRate?: number;
    readonly maxDays?: number;
    readonly founderRole?: VillagerRole;
    readonly includeQuests?: boolean;
  } = {}
): SimSummaryRow {
  const completionRate = options.completionRate ?? 1.0;
  const maxDays = options.maxDays ?? 200;
  const founderRole: VillagerRole = options.founderRole ?? 'crafter';
  const includeQuests = options.includeQuests ?? true;

  let coins = 0;
  let totalXP = 0;
  let totalFocusMinutes = 0;
  let nextId = 1;
  let stoneJobSeconds = 0;
  let bronzeJobSeconds = 0;

  let era: CivilizationEra = 'STONE_AGE';
  let stoneAdvanceDay = -1;
  let stoneEntryCoins = 0;
  let stoneEntryLevel = 1;
  let stoneEntryBonus = 0;
  let bronzeFloorDaysAfterAdvance = -1;
  let bronzeMaxDaysAfterAdvance = -1;

  let civState: AdvanceableCivilizationState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: new GridMap().toSnapshot(),
    buildings: [],
    villagers: [],
    jobs: [],
    founderRole,
    lastUpdated: 0,
  };
  let bronzeVillagers: BronzeVillagerRecord[] = [];

  const startUtcMs = Date.UTC(2026, 0, 5, 12, 0, 0);
  let questState = createInitialQuestState(startUtcMs);

  const countStoneRole = (role: VillagerRole): number =>
    (civState.founderRole === role ? 1 : 0) +
    (civState.villagers ?? []).filter((v) => v.role === role).length;

  const countBronzeRole = (role: BronzeVillagerRole): number =>
    bronzeVillagers.filter((v) => v.role === role).length;

  const getTotalCrewWithBronze = (): number =>
    getTotalVillagerCount(civState.villagers, civState.founderRole) + bronzeVillagers.length;

  const getAllCoinBonuses = (): readonly CoinBonus[] => {
    const activeJobs = civState.jobs ?? [];
    const stoneBonuses = extractCivilizationCoinBonuses(
      civState.buildings,
      civState.villagers,
      activeJobs,
      civState.founderRole
    );

    const extra: CoinBonus[] = [];
    for (const b of civState.buildings) {
      if (isBuildingUnderConstruction(b.id, activeJobs)) continue;
      const bSpec = BRONZE_SPEC_MAP.get(b.definitionId);
      if (!bSpec) continue;
      const rate = getBuildingCoinBonusRateAtLevel(bSpec.def, b.level);
      if (rate > 0) {
        extra.push({ id: `bronze_bldg:${b.id}`, source: 'BUILDING', rate });
      }
    }

    const merchants = countBronzeRole('merchant');
    const smiths = countBronzeRole('smith');
    const masons = countBronzeRole('mason');
    const merchantRate = Math.min(
      PROPOSED_BRONZE_ROLE_BUFFS.merchantCoinBonusCap,
      merchants * PROPOSED_BRONZE_ROLE_BUFFS.merchantCoinBonusRate
    );
    if (merchantRate > 0) {
      extra.push({ id: 'villager:merchant', source: 'OTHER', rate: merchantRate });
    }
    if (merchants >= 1 && smiths >= 1 && masons >= 1) {
      extra.push({
        id: 'villager:bronze_guild',
        source: 'OTHER',
        rate: PROPOSED_BRONZE_ROLE_BUFFS.bronzeGuildCoinBonus,
      });
    }

    return [...stoneBonuses, ...extra];
  };

  const getTotalCoinBonusRate = (): number => {
    const raw = aggregateCoinBonus(getAllCoinBonuses());
    const cap = era === 'STONE_AGE' ? 1.5 : PROPOSED_BRONZE_GLOBAL_COIN_BONUS_CAP;
    return Math.min(cap, raw);
  };

  const isBronzeFloorReached = (): boolean => {
    const activeJobs = civState.jobs ?? [];
    const completedBuildings = civState.buildings.filter(
      (b) => !isBuildingUnderConstruction(b.id, activeJobs)
    );
    if (activeJobs.length > 0 && era === 'BRONZE_AGE') {
      // require floor buildings themselves finished
    }
    for (const spec of PROPOSED_BRONZE_SPECS) {
      const matching = completedBuildings.filter(
        (b) => b.definitionId === spec.def.id && b.level >= spec.floorMinLevel
      );
      if (matching.length < spec.floorMinCount) return false;
    }
    return (
      countBronzeRole('smith') >= 1 &&
      countBronzeRole('merchant') >= 1 &&
      countBronzeRole('mason') >= 1
    );
  };

  const isBronzeMaxReached = (): boolean => {
    const activeJobs = civState.jobs ?? [];
    const completedBuildings = civState.buildings.filter(
      (b) => !isBuildingUnderConstruction(b.id, activeJobs)
    );
    for (const spec of PROPOSED_BRONZE_SPECS) {
      const matching = completedBuildings.filter(
        (b) => b.definitionId === spec.def.id && b.level >= spec.def.maxLevel
      );
      if (matching.length < spec.buildLimit) return false;
    }
    return bronzeVillagers.length >= 10 && activeJobs.length === 0;
  };

  const spendStoneOptimal = (dayMs: number): void => {
    let bought = true;
    while (bought) {
      bought = false;
      const playerLevel = calculatePlayerLevel(totalXP);
      const buffSummary = getVillagerBuffSummary(civState.villagers, civState.founderRole);
      const activeJobs = civState.jobs ?? [];
      const completedExpansions = Math.max(0, civState.grid.chunks.length - INITIAL_CHUNK_COUNT);
      const totalCrew = getTotalCrewWithBronze();
      const gridMap = GridMap.fromSnapshot(civState.grid);

      const foragingDef = getBuildingDefinition('stone_age_foraging_post')!;
      const granaryDef = getBuildingDefinition('stone_age_food_cache')!;
      const caveDef = getBuildingDefinition('stone_age_study_cave')!;
      const campfireDef = getBuildingDefinition('stone_age_campfire')!;
      const totemDef = getBuildingDefinition('stone_age_totem')!;
      const elderHutDef = getBuildingDefinition('stone_age_elder_hut')!;

      type Cand = { roi: number; cost: number; apply: () => void };
      const cands: Cand[] = [];

      const enqueuePlace = (def: BuildingDefinition, pos: GridCoordinate, paidCoins: number) => {
        const spec = getPlaceJobSpec(def.id);
        const bId = `b_${nextId++}`;
        gridMap.placeBuilding(bId, pos, def.footprint);
        const inst: BuildingInstance = {
          id: bId,
          definitionId: def.id,
          position: pos,
          level: 1,
          placedAt: dayMs,
        };
        let nextJobs = activeJobs;
        if (spec.durationSeconds > 0) {
          stoneJobSeconds += spec.durationSeconds;
          const j: ConstructionJob = {
            id: `j_${nextId++}`,
            kind: 'place',
            status: 'PENDING',
            definitionId: def.id,
            buildingId: bId,
            crewRequired: spec.crew,
            totalSeconds: spec.durationSeconds,
            remainingSeconds: spec.durationSeconds,
            paidCoins,
            createdAt: dayMs,
          };
          nextJobs = assignJobsFifo([...activeJobs, j], totalCrew).jobs;
        }
        civState = {
          ...civState,
          grid: gridMap.toSnapshot(),
          buildings: [...civState.buildings, inst],
          jobs: nextJobs,
          lastUpdated: dayMs,
        };
      };

      const enqueueUpgrade = (inst: BuildingInstance, nextTarget: number, paidCoins: number) => {
        const upSpec = getUpgradeJobSpec(nextTarget - 1);
        stoneJobSeconds += upSpec.durationSeconds;
        const j: ConstructionJob = {
          id: `j_${nextId++}`,
          kind: 'upgrade',
          status: 'PENDING',
          definitionId: inst.definitionId,
          buildingId: inst.id,
          targetLevel: nextTarget,
          crewRequired: upSpec.crew,
          totalSeconds: upSpec.durationSeconds,
          remainingSeconds: upSpec.durationSeconds,
          paidCoins,
          createdAt: dayMs,
        };
        civState = {
          ...civState,
          jobs: assignJobsFifo([...activeJobs, j], totalCrew).jobs,
          lastUpdated: dayMs,
        };
      };

      const caveAny = civState.buildings.find((b) => b.definitionId === caveDef.id);
      const caveReady = findVillageCave(civState.buildings, activeJobs);
      const forageList = civState.buildings.filter((b) => b.definitionId === foragingDef.id);
      const granaryList = civState.buildings.filter((b) => b.definitionId === granaryDef.id);
      const clearingCount = getClearingOrigins(activeJobs).length;

      // Cave
      if (!caveAny && totalCrew >= 1 && totalFocusMinutes >= caveDef.unlockRequirements.minTotalFocusMinutes) {
        const pos = findFirstValidPlacement(gridMap, caveDef.footprint);
        if (pos) {
          cands.push({
            roi: 0.25,
            cost: caveDef.baseCost,
            apply: () => enqueuePlace(caveDef, pos, caveDef.baseCost),
          });
        }
      } else if (caveReady) {
        const effLv = getEffectiveTargetLevel(caveReady, activeJobs);
        if (
          effLv < 5 &&
          totalCrew >= getUpgradeJobSpec(effLv).crew &&
          playerLevel >= caveDef.unlockRequirements.minPlayerLevel + effLv
        ) {
          const upCost = applyCostDiscount(
            calculateUpgradeCost(caveDef, effLv),
            buffSummary.upgradeDiscountRate
          );
          const needCap =
            (civState.villagers?.length ?? 0) >= effLv * VILLAGER_CAPACITY_PER_CAVE_LEVEL;
          cands.push({
            roi: (needCap ? 0.05 : 0.00002) / upCost,
            cost: upCost,
            apply: () => enqueueUpgrade(caveReady, effLv + 1, upCost),
          });
        }
      }

      // Stone villagers: target up to 2 elders, 2 crafters, 1 woodworker for fast Bronze advance
      if (
        caveReady &&
        (civState.villagers?.length ?? 0) < caveReady.level * VILLAGER_CAPACITY_PER_CAVE_LEVEL
      ) {
        const targets: Array<[VillagerRole, number]> = [
          ['elder', 2],
          ['crafter', 2],
          ['woodworker', 1],
        ];
        for (const [role, cap] of targets) {
          if (countStoneRole(role) >= cap) continue;
          const ev = evaluateRecruitment({
            caveBuilding: caveReady,
            villagers: civState.villagers,
            founderRole: civState.founderRole,
            playerCoins: Number.MAX_SAFE_INTEGER,
            role,
          });
          if (!ev.canRecruit) continue;
          const unlockTwo = totalCrew === 1 ? 0.2 : 0;
          const tribe =
            countStoneRole(role) === 0 &&
            (['elder', 'crafter', 'woodworker'] as VillagerRole[]).filter(
              (r) => r !== role && countStoneRole(r) >= 1
            ).length === 2
              ? VILLAGER_COMPLETE_TRIBE_COIN_BONUS
              : 0;
          const val =
            role === 'elder'
              ? VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE * 1.5
              : role === 'crafter'
              ? VILLAGER_CRAFTER_COIN_BONUS_RATE
              : 0.015;
          cands.push({
            roi: (unlockTwo + val + tribe) / ev.cost,
            cost: ev.cost,
            apply: () => {
              const nv: Villager = { id: `v_${nextId++}`, role, recruitedAt: dayMs };
              const nextV = [...(civState.villagers ?? []), nv];
              const nextCrew = getTotalVillagerCount(nextV, civState.founderRole);
              civState = {
                ...civState,
                villagers: nextV,
                jobs: assignJobsFifo(activeJobs, nextCrew).jobs,
                lastUpdated: dayMs,
              };
            },
          });
        }
      }

      // 3 Land expansions
      if (completedExpansions + clearingCount < 3 && totalCrew >= EXPAND_JOB_SPEC.crew) {
        const expIdx = completedExpansions + clearingCount + 1;
        if (playerLevel >= getExpansionRequiredLevel(expIdx)) {
          const queued = new Set(getClearingOrigins(activeJobs).map((o) => `${o.x},${o.y}`));
          const slot = gridMap
            .getAvailableExpansionSlots()
            .find((s) => !queued.has(`${s.x},${s.y}`));
          if (slot) {
            const expCost = applyCostDiscount(
              getExpansionCost(expIdx),
              buffSummary.expansionDiscountRate
            );
            cands.push({
              roi: 0.0001 / expCost,
              cost: expCost,
              apply: () => {
                stoneJobSeconds += EXPAND_JOB_SPEC.durationSeconds;
                const j: ConstructionJob = {
                  id: `j_${nextId++}`,
                  kind: 'expand',
                  status: 'PENDING',
                  origin: slot,
                  purchaseIndex: expIdx,
                  crewRequired: EXPAND_JOB_SPEC.crew,
                  totalSeconds: EXPAND_JOB_SPEC.durationSeconds,
                  remainingSeconds: EXPAND_JOB_SPEC.durationSeconds,
                  paidCoins: expCost,
                  createdAt: dayMs,
                };
                civState = {
                  ...civState,
                  jobs: assignJobsFifo([...activeJobs, j], totalCrew).jobs,
                  lastUpdated: dayMs,
                };
              },
            });
          }
        }
      }

      // 4 Foraging Posts + 4 Granaries
      for (const [def, list, limit] of [
        [foragingDef, forageList, 4],
        [granaryDef, granaryList, 4],
      ] as const) {
        if (
          list.length < limit &&
          totalCrew >= getPlaceJobSpec(def.id).crew &&
          playerLevel >= def.unlockRequirements.minPlayerLevel &&
          totalFocusMinutes >= def.unlockRequirements.minTotalFocusMinutes
        ) {
          const pos = findFirstValidPlacement(gridMap, def.footprint);
          if (pos) {
            const r = getBuildingCoinBonusRateAtLevel(def, 1);
            cands.push({
              roi: r / def.baseCost,
              cost: def.baseCost,
              apply: () => enqueuePlace(def, pos, def.baseCost),
            });
          }
        }
        for (const inst of list) {
          if (isBuildingUnderConstruction(inst.id, activeJobs)) continue;
          const eff = getEffectiveTargetLevel(inst, activeJobs);
          if (
            eff < 5 &&
            totalCrew >= getUpgradeJobSpec(eff).crew &&
            playerLevel >= def.unlockRequirements.minPlayerLevel + eff
          ) {
            const uc = applyCostDiscount(
              calculateUpgradeCost(def, eff),
              buffSummary.upgradeDiscountRate
            );
            const r = getBuildingCoinBonusRateAtLevel(def, 1);
            cands.push({
              roi: r / uc,
              cost: uc,
              apply: () => enqueueUpgrade(inst, eff + 1, uc),
            });
          }
        }
      }

      // Campfire, Totem, Elder's Hut
      for (const def of [campfireDef, totemDef, elderHutDef]) {
        if (
          !civState.buildings.some((b) => b.definitionId === def.id) &&
          totalCrew >= getPlaceJobSpec(def.id).crew &&
          playerLevel >= def.unlockRequirements.minPlayerLevel &&
          totalFocusMinutes >= def.unlockRequirements.minTotalFocusMinutes
        ) {
          const pos = findFirstValidPlacement(gridMap, def.footprint);
          if (pos) {
            cands.push({
              roi: 0.00001 / def.baseCost,
              cost: def.baseCost,
              apply: () => enqueuePlace(def, pos, def.baseCost),
            });
          }
        }
      }

      const aff = cands.filter((c) => c.cost <= coins).sort((a, b) => b.roi - a.roi);
      if (aff.length > 0) {
        coins -= aff[0].cost;
        aff[0].apply();
        bought = true;
      }
    }
  };

  const spendBronzeOptimal = (dayMs: number): void => {
    let bought = true;
    while (bought) {
      bought = false;
      const playerLevel = calculatePlayerLevel(totalXP);
      const stoneBuffs = getVillagerBuffSummary(civState.villagers, civState.founderRole);
      const smithDiscount = Math.min(
        PROPOSED_BRONZE_ROLE_BUFFS.smithPlaceDiscountCap,
        countBronzeRole('smith') * PROPOSED_BRONZE_ROLE_BUFFS.smithPlaceDiscountRate
      );
      const masonCount = countBronzeRole('mason');
      const activeJobs = civState.jobs ?? [];
      const totalCrew = getTotalCrewWithBronze();
      const gridMap = GridMap.fromSnapshot(civState.grid);
      const clearingCount = getClearingOrigins(activeJobs).length;
      const completedExpansions = Math.max(0, civState.grid.chunks.length - INITIAL_CHUNK_COUNT);

      type Cand = { roi: number; cost: number; apply: () => void };
      const cands: Cand[] = [];

      const enqueueBronzePlace = (
        spec: ProposedBronzeBuildingSpec,
        pos: GridCoordinate,
        paidCoins: number
      ) => {
        const bId = `b_${nextId++}`;
        gridMap.placeBuilding(bId, pos, spec.def.footprint);
        const inst: BuildingInstance = {
          id: bId,
          definitionId: spec.def.id,
          position: pos,
          level: 1,
          placedAt: dayMs,
        };
        const dur = getEffectiveBronzeJobDuration(spec.placeJob.durationSeconds, masonCount);
        bronzeJobSeconds += dur;
        const j: ConstructionJob = {
          id: `j_${nextId++}`,
          kind: 'place',
          status: 'PENDING',
          definitionId: spec.def.id,
          buildingId: bId,
          crewRequired: spec.placeJob.crew,
          totalSeconds: dur,
          remainingSeconds: dur,
          paidCoins,
          createdAt: dayMs,
        };
        civState = {
          ...civState,
          grid: gridMap.toSnapshot(),
          buildings: [...civState.buildings, inst],
          jobs: assignJobsFifo([...activeJobs, j], totalCrew).jobs,
          lastUpdated: dayMs,
        };
      };

      const enqueueBronzeUpgrade = (
        inst: BuildingInstance,
        nextTarget: number,
        paidCoins: number
      ) => {
        const baseSpec = getUpgradeJobSpec(nextTarget - 1);
        const dur = getEffectiveBronzeJobDuration(baseSpec.durationSeconds, masonCount);
        bronzeJobSeconds += dur;
        const j: ConstructionJob = {
          id: `j_${nextId++}`,
          kind: 'upgrade',
          status: 'PENDING',
          definitionId: inst.definitionId,
          buildingId: inst.id,
          targetLevel: nextTarget,
          crewRequired: baseSpec.crew,
          totalSeconds: dur,
          remainingSeconds: dur,
          paidCoins,
          createdAt: dayMs,
        };
        civState = {
          ...civState,
          jobs: assignJobsFifo([...activeJobs, j], totalCrew).jobs,
          lastUpdated: dayMs,
        };
      };

      // A. Recruit remaining Stone villagers up to 10 (5 Elders for -30% discount, 5 Crafters/Woodworkers)
      const caveReady = findVillageCave(civState.buildings, activeJobs);
      if (
        caveReady &&
        (civState.villagers?.length ?? 0) < caveReady.level * VILLAGER_CAPACITY_PER_CAVE_LEVEL
      ) {
        const targets: Array<[VillagerRole, number]> = [
          ['elder', 5], // hit -30% upgrade discount cap
          ['woodworker', 4], // -20% expansion discount
          ['crafter', 8],
        ];
        for (const [role, cap] of targets) {
          if (countStoneRole(role) >= cap) continue;
          const ev = evaluateRecruitment({
            caveBuilding: caveReady,
            villagers: civState.villagers,
            founderRole: civState.founderRole,
            playerCoins: Number.MAX_SAFE_INTEGER,
            role,
          });
          if (!ev.canRecruit) continue;
          const val =
            role === 'elder'
              ? 0.04
              : role === 'crafter'
              ? 0.03
              : 0.002;
          cands.push({
            roi: val / ev.cost,
            cost: ev.cost,
            apply: () => {
              const nv: Villager = { id: `v_${nextId++}`, role, recruitedAt: dayMs };
              const nextV = [...(civState.villagers ?? []), nv];
              civState = {
                ...civState,
                villagers: nextV,
                jobs: assignJobsFifo(activeJobs, getTotalCrewWithBronze()).jobs,
                lastUpdated: dayMs,
              };
            },
          });
        }
      }

      // B. Bronze Longhouse placement & upgrades (to Lv.5 -> 10 Bronze slots)
      const longhouseSpec = BRONZE_SPEC_MAP.get('bronze_longhouse')!;
      const longhouseReady = civState.buildings.find(
        (b) => b.definitionId === 'bronze_longhouse' && !isBuildingUnderConstruction(b.id, activeJobs)
      );
      if (longhouseReady) {
        const eff = getEffectiveTargetLevel(longhouseReady, activeJobs);
        if (
          eff < longhouseSpec.def.maxLevel &&
          totalCrew >= getUpgradeJobSpec(eff).crew &&
          playerLevel >= getBuildingUpgradeRequiredPlayerLevel(longhouseSpec.def, eff)
        ) {
          const uc = applyCostDiscount(
            getCombinedUpgradeCost(longhouseSpec.def, eff),
            stoneBuffs.upgradeDiscountRate
          );
          const needMoreBronzeSlots =
            bronzeVillagers.length >= eff * PROPOSED_BRONZE_HOUSING_SLOTS_PER_LEVEL &&
            bronzeVillagers.length < 10;
          cands.push({
            roi: (needMoreBronzeSlots ? 0.05 : 0.0005) / uc,
            cost: uc,
            apply: () => enqueueBronzeUpgrade(longhouseReady, eff + 1, uc),
          });
        }
      }

      // C. Recruit Bronze Villagers (target 4 merchants, 3 smiths, 3 masons = 10)
      if (
        longhouseReady &&
        bronzeVillagers.length < longhouseReady.level * PROPOSED_BRONZE_HOUSING_SLOTS_PER_LEVEL
      ) {
        const targets: Array<[BronzeVillagerRole, number]> = [
          ['merchant', 4],
          ['smith', 3],
          ['mason', 3],
        ];
        const recruitCost = getBronzeRecruitCost(bronzeVillagers.length);
        for (const [role, cap] of targets) {
          if (countBronzeRole(role) >= cap) continue;
          const completesGuild =
            countBronzeRole(role) === 0 &&
            BRONZE_VILLAGER_ROLES.filter((r) => r !== role && countBronzeRole(r) >= 1).length === 2
              ? PROPOSED_BRONZE_ROLE_BUFFS.bronzeGuildCoinBonus
              : 0;
          const roleScore =
            role === 'merchant' ? 0.05 : role === 'smith' ? 0.035 : 0.03;
          cands.push({
            roi: (roleScore + completesGuild) / recruitCost,
            cost: recruitCost,
            apply: () => {
              bronzeVillagers = [
                ...bronzeVillagers,
                { id: `bv_${nextId++}`, role, recruitedAt: dayMs },
              ];
              civState = {
                ...civState,
                jobs: assignJobsFifo(activeJobs, getTotalCrewWithBronze()).jobs,
                lastUpdated: dayMs,
              };
            },
          });
        }
      }

      // D. Bronze Buildings (Place & Upgrade)
      let needMoreLand = false;
      const completedIds = new Set(
        civState.buildings
          .filter((b) => !isBuildingUnderConstruction(b.id, activeJobs))
          .map((b) => b.definitionId)
      );

      for (const spec of PROPOSED_BRONZE_SPECS) {
        const instances = civState.buildings.filter((b) => b.definitionId === spec.def.id);
        const prereqOk = (spec.prerequisiteBuildingIds ?? []).every((pid) => completedIds.has(pid));
        const rolesOk = (spec.requiredRoles ?? []).every((r) =>
          (BRONZE_VILLAGER_ROLES as readonly string[]).includes(r)
            ? countBronzeRole(r as BronzeVillagerRole) >= 1
            : countStoneRole(r as VillagerRole) >= 1
        );
        const villOk = totalCrew >= (spec.requiredVillagers ?? 0);

        if (
          instances.length < spec.buildLimit &&
          prereqOk &&
          rolesOk &&
          villOk &&
          totalCrew >= spec.placeJob.crew &&
          playerLevel >= spec.def.unlockRequirements.minPlayerLevel &&
          totalFocusMinutes >= spec.def.unlockRequirements.minTotalFocusMinutes
        ) {
          const pos = findFirstValidPlacement(gridMap, spec.def.footprint);
          if (pos) {
            const pCost = applyCostDiscount(spec.def.baseCost, smithDiscount);
            const rate = getBuildingCoinBonusRateAtLevel(spec.def, 1);
            const score =
              spec.def.id === 'bronze_longhouse'
                ? 0.25
                : spec.def.category === 'ECONOMY_EFFECT'
                ? rate / pCost
                : spec.def.category === 'FOCUS_SUPPORT'
                ? 0.0008 / pCost
                : 0.0002 / pCost;
            cands.push({
              roi: score,
              cost: pCost,
              apply: () => enqueueBronzePlace(spec, pos, pCost),
            });
          } else {
            needMoreLand = true;
          }
        }

        if (spec.def.category === 'ECONOMY_EFFECT') {
          for (const inst of instances) {
            if (isBuildingUnderConstruction(inst.id, activeJobs)) continue;
            const eff = getEffectiveTargetLevel(inst, activeJobs);
            if (
              eff < spec.def.maxLevel &&
              totalCrew >= getUpgradeJobSpec(eff).crew &&
              playerLevel >= getBuildingUpgradeRequiredPlayerLevel(spec.def, eff)
            ) {
              const uc = applyCostDiscount(
                getCombinedUpgradeCost(spec.def, eff),
                stoneBuffs.upgradeDiscountRate
              );
              const rate = getBuildingCoinBonusRateAtLevel(spec.def, 1);
              cands.push({
                roi: rate / uc,
                cost: uc,
                apply: () => enqueueBronzeUpgrade(inst, eff + 1, uc),
              });
            }
          }
        }
      }

      // E. Expand Land whenever any Bronze footprint doesn't fit (or keep small buffer >= 20 free cells)
      if ((needMoreLand || gridMap.getEmptyCellCount() < 16) && clearingCount === 0 && totalCrew >= 2) {
        const expIdx = completedExpansions + 1;
        if (playerLevel >= getExpansionRequiredLevel(expIdx)) {
          const slot = gridMap.getAvailableExpansionSlots()[0];
          if (slot) {
            const expCost = applyCostDiscount(
              getExpansionCost(expIdx),
              stoneBuffs.expansionDiscountRate
            );
            cands.push({
              roi: needMoreLand ? 0.5 : 0.005,
              cost: expCost,
              apply: () => {
                bronzeJobSeconds += EXPAND_JOB_SPEC.durationSeconds;
                const j: ConstructionJob = {
                  id: `j_${nextId++}`,
                  kind: 'expand',
                  status: 'PENDING',
                  origin: slot,
                  purchaseIndex: expIdx,
                  crewRequired: EXPAND_JOB_SPEC.crew,
                  totalSeconds: EXPAND_JOB_SPEC.durationSeconds,
                  remainingSeconds: EXPAND_JOB_SPEC.durationSeconds,
                  paidCoins: expCost,
                  createdAt: dayMs,
                };
                civState = {
                  ...civState,
                  jobs: assignJobsFifo([...activeJobs, j], totalCrew).jobs,
                  lastUpdated: dayMs,
                };
              },
            });
          }
        }
      }

      const aff = cands.filter((c) => c.cost <= coins).sort((a, b) => b.roi - a.roi);
      if (aff.length > 0) {
        coins -= aff[0].cost;
        aff[0].apply();
        bought = true;
      }
    }
  };

  for (let day = 1; day <= maxDays; day += 1) {
    const dayMs = startUtcMs + (day - 1) * 24 * 60 * 60 * 1000;
    const d = new Date(dayMs);
    const dateKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;

    for (let sIdx = 0; sIdx < dailySessionMinutes.length; sIdx += 1) {
      const mins = dailySessionMinutes[sIdx];
      // Deterministic completion rate model (e.g. 90% means 1 in 10 sessions gives up at 50% time)
      const isCompleted =
        completionRate >= 1.0 || ((day * 7 + sIdx) % 10) < Math.round(completionRate * 10);

      if (isCompleted) {
        const cappedBonus = getTotalCoinBonusRate();
        const res = rewardEngine.calculateReward({
          mode: 'COUNTDOWN',
          status: 'COMPLETED',
          targetMinutes: mins,
          actualFocusMinutes: mins,
          coinBonuses: cappedBonus > 0 ? [{ id: 'sim_cap', source: 'BUILDING', rate: cappedBonus }] : [],
        });

        coins += res.coinsEarned;
        totalXP += res.xpEarned;
        totalFocusMinutes += mins;

        if ((civState.jobs?.length ?? 0) > 0) {
          // Use custom crew count aware advanceJobs by passing synthetic villagers array length matching totalCrew
          const simState: AdvanceableCivilizationState = {
            ...civState,
            villagers: [
              ...(civState.villagers ?? []),
              ...bronzeVillagers.map((bv) => ({
                id: bv.id,
                role: 'crafter' as VillagerRole,
                recruitedAt: bv.recruitedAt,
              })),
            ],
          };
          const advanced = advanceJobs(simState, mins * 60);
          civState = {
            ...civState,
            grid: advanced.grid,
            buildings: advanced.buildings,
            jobs: advanced.jobs,
          };
        }

        questState = applyCompletedSession(
          questState,
          { completedDateKey: dateKey, completedFocusMinutes: mins },
          dayMs
        );
      } else {
        // Abandoned halfway: 0 Coins/XP/Jobs/Quests, half minutes recorded to lifetime stats
        totalFocusMinutes += Math.floor(mins * 0.5);
      }

      if (era === 'STONE_AGE') {
        spendStoneOptimal(dayMs);
      } else {
        spendBronzeOptimal(dayMs);
      }
    }

    if (includeQuests) {
      for (const qDef of getActiveQuestDefinitions('DAILY', questState)) {
        const claimed = claimQuest(questState, 'DAILY', qDef.id, dayMs);
        questState = claimed.state;
        if (claimed.claimed) {
          coins += claimed.coins;
          totalXP += claimed.xp;
        }
      }
      for (const qDef of getActiveQuestDefinitions('WEEKLY', questState)) {
        const claimed = claimQuest(questState, 'WEEKLY', qDef.id, dayMs);
        questState = claimed.state;
        if (claimed.claimed) {
          coins += claimed.coins;
          totalXP += claimed.xp;
        }
      }
    }

    if (era === 'STONE_AGE') {
      spendStoneOptimal(dayMs);

      const playerLevel = calculatePlayerLevel(totalXP);
      const activeJobs = civState.jobs ?? [];
      const activeBuildingsOnly = civState.buildings.filter(
        (b) => !isBuildingUnderConstruction(b.id, activeJobs)
      );
      const completedExpansions = Math.max(0, civState.grid.chunks.length - INITIAL_CHUNK_COUNT);
      const evalRes = evaluateEraAdvance({
        era: 'STONE_AGE',
        buildings: activeBuildingsOnly,
        villagers: civState.villagers ?? [],
        founderRole: civState.founderRole,
        landExpansions: completedExpansions,
        playerLevel,
        totalFocusMinutes,
        coins,
      });

      if (evalRes.eligible) {
        stoneAdvanceDay = day;
        stoneEntryCoins = coins;
        stoneEntryLevel = playerLevel;
        stoneEntryBonus = getTotalCoinBonusRate();
        coins -= STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.feeCoins;
        era = 'BRONZE_AGE';
        civState = { ...civState, era: 'BRONZE_AGE' };
        // Spend remaining coins on Day 1 of Bronze Age
        spendBronzeOptimal(dayMs);
      }
    } else {
      spendBronzeOptimal(dayMs);

      if (bronzeFloorDaysAfterAdvance === -1 && isBronzeFloorReached()) {
        bronzeFloorDaysAfterAdvance = day - stoneAdvanceDay;
      }
      if (bronzeMaxDaysAfterAdvance === -1 && isBronzeMaxReached()) {
        bronzeMaxDaysAfterAdvance = day - stoneAdvanceDay;
        const baseHourRate =
          (dailySessionMinutes.reduce((a, b) => a + b, 0) /
            dailySessionMinutes.reduce((a, b) => a + b, 0)) *
          DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
          rewardEngine.calculateReward({
            mode: 'COUNTDOWN',
            status: 'COMPLETED',
            targetMinutes: dailySessionMinutes[0],
            actualFocusMinutes: dailySessionMinutes[0],
          }).multiplier;
        const maxBronzeBonus = getTotalCoinBonusRate();
        return {
          label,
          sessions: dailySessionMinutes,
          completionRate,
          stoneToBronzeDays: stoneAdvanceDay,
          stoneEntryCoins,
          stoneEntryLevel,
          stoneEntryBonus,
          bronzeFloorDaysAfterAdvance,
          bronzeMaxDaysAfterAdvance,
          bronzeMaxTotalDays: day,
          bronzeMaxLevel: calculatePlayerLevel(totalXP),
          bronzeMaxBonus: maxBronzeBonus,
          coinsPerFocusHourBeforeBronze: baseHourRate * 60 * (1 + stoneEntryBonus),
          coinsPerFocusHourAfterBronze: baseHourRate * 60 * (1 + maxBronzeBonus),
          bronzeTotalJobSeconds: bronzeJobSeconds,
          stoneJobSeconds,
          landExpansionsAtMax: Math.max(0, civState.grid.chunks.length - INITIAL_CHUNK_COUNT),
          stoneVillagersAtMax: getTotalVillagerCount(civState.villagers, civState.founderRole),
          bronzeVillagersAtMax: bronzeVillagers.length,
          finalCoins: coins,
        };
      }
    }
  }

  const fallbackBonus = getTotalCoinBonusRate();
  const baseMinRate =
    DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
    rewardEngine.calculateReward({
      mode: 'COUNTDOWN',
      status: 'COMPLETED',
      targetMinutes: dailySessionMinutes[0],
      actualFocusMinutes: dailySessionMinutes[0],
    }).multiplier;

  return {
    label,
    sessions: dailySessionMinutes,
    completionRate,
    stoneToBronzeDays: stoneAdvanceDay,
    stoneEntryCoins,
    stoneEntryLevel,
    stoneEntryBonus,
    bronzeFloorDaysAfterAdvance,
    bronzeMaxDaysAfterAdvance,
    bronzeMaxTotalDays: maxDays,
    bronzeMaxLevel: calculatePlayerLevel(totalXP),
    bronzeMaxBonus: fallbackBonus,
    coinsPerFocusHourBeforeBronze: baseMinRate * 60 * (1 + stoneEntryBonus),
    coinsPerFocusHourAfterBronze: baseMinRate * 60 * (1 + fallbackBonus),
    bronzeTotalJobSeconds: bronzeJobSeconds,
    stoneJobSeconds,
    landExpansionsAtMax: Math.max(0, civState.grid.chunks.length - INITIAL_CHUNK_COUNT),
    stoneVillagersAtMax: getTotalVillagerCount(civState.villagers, civState.founderRole),
    bronzeVillagersAtMax: bronzeVillagers.length,
    finalCoins: coins,
  };
}

// ---------------------------------------------------------------------------
// Print Catalog Summary + Simulation Tables
// ---------------------------------------------------------------------------

function main(): void {
  console.log('=== STONE AGE REFERENCE CHECK (PRODUCT_SPEC.md) ===');
  for (const def of STONE_AGE_BUILDING_DEFINITIONS) {
    const limit = getBuildingPlacementLimit(def) ?? 1;
    const maxL = getEffectiveMaxLevel(def, 'STONE_AGE');
    console.log(
      `  ${def.id.padEnd(26)} | cap=${limit} | maxLv=${maxL} | maxSpend=${calculateTotalBuildingCoinsSpent(
        def,
        maxL
      )}`
    );
  }

  console.log('\n=== PROPOSED BRONZE AGE CATALOG COSTS ===');
  let totalFloorNet = 0;
  let totalMaxNet = 0;
  let totalMaxGross = 0;
  let totalBonus = 0;
  let totalCells = 0;

  for (const spec of PROPOSED_BRONZE_SPECS) {
    const def = spec.def;
    const isUp = def.maxLevel > 1;
    let grossPerUnit = def.baseCost;
    for (let lv = 1; lv < def.maxLevel; lv += 1) {
      grossPerUnit += calculateUpgradeCost(def, lv);
    }
    const netPerUnit =
      applyCostDiscount(def.baseCost, 0.15) +
      (grossPerUnit - def.baseCost) * 0.7; // avg -15% Smith, -30% Elder

    let floorPerUnit = def.baseCost;
    for (let lv = 1; lv < spec.floorMinLevel; lv += 1) {
      floorPerUnit += calculateUpgradeCost(def, lv);
    }
    const floorNetPerUnit =
      applyCostDiscount(def.baseCost, 0.15) + (floorPerUnit - def.baseCost) * 0.7;

    totalMaxGross += spec.buildLimit * grossPerUnit;
    totalMaxNet += spec.buildLimit * netPerUnit;
    totalFloorNet += spec.floorMinCount * floorNetPerUnit;
    totalCells += spec.buildLimit * def.footprint.width * def.footprint.height;

    const rateMax = getBuildingCoinBonusRateAtLevel(def, def.maxLevel) * spec.buildLimit;
    totalBonus += rateMax;

    console.log(
      `  ${def.id.padEnd(24)} | ${def.category.padEnd(14)} | ${def.footprint.width}x${def.footprint.height} | lim=${spec.buildLimit} | maxLv=${def.maxLevel
        .toString()
        .padStart(2)} | base=${def.baseCost.toString().padStart(3)} | x${def.upgradeCostMultiplier.toFixed(
        2
      )} | gross1=${Math.round(grossPerUnit)
        .toString()
        .padStart(5)} | netAll=${Math.round(spec.buildLimit * netPerUnit)
        .toString()
        .padStart(5)} | bonus=${(rateMax * 100).toFixed(1)}%`
    );
  }
  console.log(
    `  TOTALS: cells=${totalCells}, buildingBonusMax=+${(totalBonus * 100).toFixed(
      1
    )}%, floorNet~=${Math.round(totalFloorNet)}, maxGross=${Math.round(
      totalMaxGross
    )}, maxNet~=${Math.round(totalMaxNet)}`
  );

  console.log('\n=== BRONZE VILLAGER COSTS (n=0..9) ===');
  let bvTotal = 0;
  const bvCosts: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const c = getBronzeRecruitCost(i);
    bvCosts.push(c);
    bvTotal += c;
  }
  console.log(`  Costs: [${bvCosts.join(', ')}] -> Total 10 Bronze = ${bvTotal} Coins`);

  console.log('\n=== PROGRESSION SIMULATION (100% completion rate, with Daily/Weekly Quests) ===');
  const profiles: Array<readonly [string, readonly number[], number]> = [
    ['1h/d [60]', [60], 220],
    ['1.5h/d [45,45]', [45, 45], 200],
    ['2h/d [60,60]', [60, 60], 180],
    ['2h/d [120]', [120], 180],
    ['3h/d [45,45,45,45]', [45, 45, 45, 45], 160],
    ['3h/d [60,60,60]', [60, 60, 60], 150],
    ['3h/d [180]', [180], 150],
  ];

  const rows100 = profiles.map(([label, sess, maxD]) =>
    runProfileSimulation(label, sess, { completionRate: 1.0, maxDays: maxD })
  );

  for (const r of rows100) {
    const dailyFocusSec = r.sessions.reduce((a, b) => a + b, 0) * 60;
    const jobDaysSeq = r.bronzeTotalJobSeconds / dailyFocusSec;
    const jobDaysPar3 = r.bronzeTotalJobSeconds / (dailyFocusSec * 3.0);
    console.log(
      `${r.label.padEnd(20)} | S->B=${r.stoneToBronzeDays}d (Lv.${r.stoneEntryLevel}, +${Math.round(
        r.stoneEntryBonus * 100
      )}%) | Floor=+${r.bronzeFloorDaysAfterAdvance}d | Max=+${
        r.bronzeMaxDaysAfterAdvance
      }d (Total ${r.bronzeMaxTotalDays}d, Lv.${r.bronzeMaxLevel}, +${Math.round(
        r.bronzeMaxBonus * 100
      )}%) | C/hr: ${r.coinsPerFocusHourBeforeBronze.toFixed(
        0
      )} -> ${r.coinsPerFocusHourAfterBronze.toFixed(0)} | BronzeJobs=${(
        r.bronzeTotalJobSeconds / 3600
      ).toFixed(1)}h (seq=${jobDaysSeq.toFixed(1)}d, 3xCrew=${jobDaysPar3.toFixed(1)}d) | Exp=${
        r.landExpansionsAtMax
      }`
    );
  }

  console.log('\n=== REALISTIC SENSITIVITY CHECK (90% session completion rate, with Quests) ===');
  const rows90 = profiles.map(([label, sess, maxD]) =>
    runProfileSimulation(`${label} @90%`, sess, { completionRate: 0.9, maxDays: maxD })
  );
  for (const r of rows90) {
    console.log(
      `${r.label.padEnd(24)} | S->B=${r.stoneToBronzeDays}d | Floor=+${r.bronzeFloorDaysAfterAdvance}d | Max=+${r.bronzeMaxDaysAfterAdvance}d (Total ${r.bronzeMaxTotalDays}d, Lv.${r.bronzeMaxLevel})`
    );
  }

  console.log('\n=== SENSITIVITY CHECK (100% completion, Focus-only WITHOUT Quests) ===');
  const rowsNoQ = [
    ['1.5h/d [45,45]', [45, 45], 240] as const,
    ['2h/d [60,60]', [60, 60], 200] as const,
    ['3h/d [60,60,60]', [60, 60, 60], 160] as const,
  ].map(([label, sess, maxD]) =>
    runProfileSimulation(`${label} (noQ)`, sess, {
      completionRate: 1.0,
      maxDays: maxD,
      includeQuests: false,
    })
  );
  for (const r of rowsNoQ) {
    console.log(
      `${r.label.padEnd(24)} | S->B=${r.stoneToBronzeDays}d | Floor=+${r.bronzeFloorDaysAfterAdvance}d | Max=+${r.bronzeMaxDaysAfterAdvance}d (Total ${r.bronzeMaxTotalDays}d, Lv.${r.bronzeMaxLevel})`
    );
  }

  console.log('\n=== TABLE (C): COINS / FOCUS HOUR BEFORE VS AFTER BRONZE ===');
  const modes: Array<
    readonly [string, 'COUNTDOWN' | 'STOPWATCH', number]
  > = [
    ['Stopwatch 25m (x1.0)', 'STOPWATCH', 25],
    ['Stopwatch 60m (x1.4)', 'STOPWATCH', 60],
    ['Countdown 25m (x1.0)', 'COUNTDOWN', 25],
    ['Countdown 45m (x1.2)', 'COUNTDOWN', 45],
    ['Countdown 60m (x1.4)', 'COUNTDOWN', 60],
    ['Countdown 120m (x1.8)', 'COUNTDOWN', 120],
    ['Countdown 180m (x2.5)', 'COUNTDOWN', 180],
  ];
  const tiers: Array<readonly [string, number]> = [
    ['StoneBase(0%)', 0.0],
    ['StoneEntry(+120%)', 1.2],
    ['StoneMax(+150%)', 1.5],
    ['BronzeOpt(+235%)', 2.35],
    ['BronzeCap(+250%)', 2.5],
  ];
  for (const [mLabel, mode, mins] of modes) {
    const vals = tiers.map(([, rate]) => {
      const res = rewardEngine.calculateReward({
        mode,
        status: 'COMPLETED',
        targetMinutes: mins,
        actualFocusMinutes: mins,
        coinBonuses: rate > 0 ? [{ id: 'c', source: 'BUILDING', rate }] : [],
      });
      const perHour = (res.coinsEarned / mins) * 60;
      return perHour.toFixed(1).padStart(6);
    });
    const mult = rewardEngine.calculateReward({
      mode,
      status: 'COMPLETED',
      targetMinutes: mins,
      actualFocusMinutes: mins,
    }).multiplier;
    const stoneMaxVal = Number(vals[2]);
    const bronzeOptVal = Number(vals[3]);
    const bronzeCapVal = Number(vals[4]);
    console.log(
      `  ${mLabel.replace(/\(x[0-9.]+\)/, `(x${mult.toFixed(1)})`).padEnd(22)} | ${vals.join(' | ')} | Opt/StoneMax=+${(
        ((bronzeOptVal - stoneMaxVal) / stoneMaxVal) *
        100
      ).toFixed(1)}% | Cap/StoneMax=+${(((bronzeCapVal - stoneMaxVal) / stoneMaxVal) * 100).toFixed(
        1
      )}%`
    );
  }

  console.log('\n=== TABLE (D): CONSTRUCTION FOCUS SECONDS & REAL DAYS BY CREW COUNT ===');
  const buildFullBronzeJobQueue = (masonCount: number, expansionCount: number): ConstructionJob[] => {
    const q: ConstructionJob[] = [];
    let idx = 1;
    for (const spec of PROPOSED_BRONZE_SPECS) {
      for (let c = 0; c < spec.buildLimit; c += 1) {
        const pDur = getEffectiveBronzeJobDuration(spec.placeJob.durationSeconds, masonCount);
        q.push({
          id: `bq_${idx++}`,
          kind: 'place',
          status: 'PENDING',
          definitionId: spec.def.id,
          buildingId: `bb_${idx}`,
          crewRequired: spec.placeJob.crew,
          totalSeconds: pDur,
          remainingSeconds: pDur,
          paidCoins: 0,
          createdAt: 0,
        });
        for (let lv = 1; lv < spec.def.maxLevel; lv += 1) {
          const uSpec = getUpgradeJobSpec(lv);
          const uDur = getEffectiveBronzeJobDuration(uSpec.durationSeconds, masonCount);
          q.push({
            id: `bq_${idx++}`,
            kind: 'upgrade',
            status: 'PENDING',
            definitionId: spec.def.id,
            buildingId: `bb_${idx}`,
            targetLevel: lv + 1,
            crewRequired: uSpec.crew,
            totalSeconds: uDur,
            remainingSeconds: uDur,
            paidCoins: 0,
            createdAt: 0,
          });
        }
      }
    }
    for (let e = 0; e < expansionCount; e += 1) {
      q.push({
        id: `bq_${idx++}`,
        kind: 'expand',
        status: 'PENDING',
        origin: { x: 100 + e * 4, y: 0 },
        purchaseIndex: 4 + e,
        crewRequired: EXPAND_JOB_SPEC.crew,
        totalSeconds: EXPAND_JOB_SPEC.durationSeconds,
        remainingSeconds: EXPAND_JOB_SPEC.durationSeconds,
        paidCoins: 0,
        createdAt: 0,
      });
    }
    return q;
  };

  const simulateQueueDrainSeconds = (masonCount: number, crewCount: number, expansionCount: number): {
    totalJobSeconds: number;
    wallFocusSeconds: number;
  } => {
    const rawQueue = buildFullBronzeJobQueue(masonCount, expansionCount);
    const totalJobSeconds = rawQueue.reduce((sum, j) => sum + j.totalSeconds, 0);
    let state: AdvanceableCivilizationState = {
      schemaVersion: 2,
      era: 'BRONZE_AGE',
      grid: new GridMap().toSnapshot(),
      buildings: [],
      villagers: Array.from({ length: Math.max(0, crewCount - 1) }, (_, i) => ({
        id: `sim_v_${i}`,
        role: 'crafter' as VillagerRole,
        recruitedAt: 0,
      })),
      founderRole: 'crafter',
      jobs: assignJobsFifo(rawQueue, crewCount).jobs,
      lastUpdated: 0,
    };
    let wallFocusSeconds = 0;
    while ((state.jobs?.length ?? 0) > 0) {
      const active = (state.jobs ?? []).filter((j) => j.status === 'ACTIVE');
      if (active.length === 0) break;
      const step = Math.min(...active.map((j) => j.remainingSeconds));
      const next = advanceJobs(state, step);
      wallFocusSeconds += step;
      state = {
        ...state,
        grid: next.grid,
        buildings: next.buildings,
        jobs: next.jobs,
      };
    }
    return { totalJobSeconds, wallFocusSeconds };
  };

  for (const [masonLabel, mCount] of [
    ['Mason=0 (0%)', 0],
    ['Mason=3 (-15%)', 3],
    ['Mason=4 (-20%)', 4],
  ] as const) {
    const qBase = buildFullBronzeJobQueue(mCount, 7); // 7 typical Bronze expansions (from 3 to 10)
    const totSec = qBase.reduce((s, j) => s + j.totalSeconds, 0);
    console.log(
      `  ${masonLabel.padEnd(16)} | TotalJobSec=${totSec}s (${(totSec / 3600).toFixed(2)}h, inc. 16 place + 94 upgrades + 7 exp)`
    );
    for (const crew of [4, 6, 8, 10, 14, 21]) {
      const res = simulateQueueDrainSeconds(mCount, crew, 7);
      const h = res.wallFocusSeconds / 3600;
      const effPar = res.totalJobSeconds / res.wallFocusSeconds;
      console.log(
        `    Crew=${String(crew).padStart(2)} (max ${Math.min(4, crew)} active) -> WallFocus=${res.wallFocusSeconds}s (${h.toFixed(
          2
        )}h, effPar=${effPar.toFixed(2)}x) | 1h/d=${(h / 1).toFixed(1)}d | 1.5h/d=${(
          h / 1.5
        ).toFixed(1)}d | 2h/d=${(h / 2).toFixed(1)}d | 3h/d=${(h / 3).toFixed(1)}d`
      );
    }
  }
}

main();
