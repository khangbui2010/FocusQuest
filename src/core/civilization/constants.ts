/**
 * Grid & Chunk constants for Focus Quest Civilization Map Engine.
 * Milestone 5B.1 & 5B.5 Stage 4a-2 (ĐC-12):
 * - Initial 8x8 map (64 cells) structured as 2x2 chunks of 4x4.
 */

export const INITIAL_GRID_WIDTH = 8;
export const INITIAL_GRID_HEIGHT = 8;

export const CHUNK_WIDTH = 4;
export const CHUNK_HEIGHT = 4;

export const INITIAL_TOTAL_CELLS = INITIAL_GRID_WIDTH * INITIAL_GRID_HEIGHT; // 64 cells
export const INITIAL_CHUNK_COUNT =
  (INITIAL_GRID_WIDTH / CHUNK_WIDTH) * (INITIAL_GRID_HEIGHT / CHUNK_HEIGHT); // 4 chunks

export const INITIAL_ORIGIN_X = 0;
export const INITIAL_ORIGIN_Y = 0;

// Milestone 5B.6a: Land expansion cost & level gate constants
export const LAND_EXPANSION_BASE_COST = 60;
export const LAND_EXPANSION_RATIO_BASE = 1.25;
export const LAND_EXPANSION_RATIO_STEP = 0.01;
export const LAND_EXPANSION_RATIO_CAP = 1.25;
export const LAND_EXPANSION_LEVEL_OFFSET = 2;

// Milestone 5C-1: Building Upgrade, Demolish Refund & Economy Cap constants
export const BUILDING_UPGRADE_PLAYER_LEVEL_STEP = 1;
export const BUILDING_DEMOLISH_REFUND_RATE = 0.5;
export const MAX_ECONOMY_EFFECT_BUILDINGS = 4;

// Milestone Villager V5.2: Villager recruitment, Cave capacity, and 1-Cave cap constants
export const VILLAGER_BASE_RECRUIT_COST = 25;
export const VILLAGER_RECRUIT_COST_RATIO = 1.35;
export const VILLAGER_CAPACITY_PER_CAVE_LEVEL = 2;
export const MAX_VILLAGE_CAVES = 1;

// Milestone Villager V5.2: Villager role buff rates, caps & complete tribe synergy
export const VILLAGER_CRAFTER_COIN_BONUS_RATE = 0.05;
export const VILLAGER_CRAFTER_COIN_BONUS_CAP = 0.4;
export const VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE = 0.05;
export const VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP = 0.4;
export const VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE = 0.06;
export const VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP = 0.3;
export const VILLAGER_COMPLETE_TRIBE_COIN_BONUS = 0.1;
