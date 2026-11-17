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
export const LAND_EXPANSION_RATIO_CAP = 1.5;
export const LAND_EXPANSION_LEVEL_OFFSET = 2;
