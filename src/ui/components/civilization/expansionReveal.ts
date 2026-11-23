import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../../../core/civilization/constants.ts';
import { GridCoordinate } from '../../../core/civilization/types.ts';
import { REUSED_TINY_TOWN_TILES } from './spriteData.ts';

export const EXPANSION_AXE_PACK = 'tiny-town' as const;
export const EXPANSION_AXE_TILE_INDEX = REUSED_TINY_TOWN_TILES.WOODCUTTER_AXE; // 127
export const EXPANSION_IMPACT_MS = 680;
export const EXPANSION_SHAKE_DURATION_MS = 340;
export const EXPANSION_ANIMATION_DURATION_MS = 1150;

export interface ActiveExpansionReveal {
  readonly id: number;
  readonly origin: GridCoordinate;
  readonly startedAt: number;
  readonly reducedMotion: boolean;
}

export interface ExpansionParticleSpec {
  readonly id: number;
  readonly txPx: number;
  readonly tyPx: number;
  readonly sizePx: number;
  readonly colorHex: string;
}

export interface ExpansionAnimationPlan {
  readonly origin: GridCoordinate;
  readonly axePack: typeof EXPANSION_AXE_PACK;
  readonly axeTileIndex: number;
  readonly impactDelayMs: number;
  readonly shakeDurationMs: number;
  readonly totalDurationMs: number;
  readonly chunkWidthPx: number;
  readonly chunkHeightPx: number;
  readonly centerPxX: number;
  readonly centerPxY: number;
  readonly axeStartYOffsetPx: number;
  readonly particles: readonly ExpansionParticleSpec[];
}

const EXPANSION_PARTICLE_COLORS = Object.freeze([
  '#cf8254', // warm wood chip
  '#eaa56c', // light wood chip
  '#84c669', // leaf chip
  '#479f4a', // dark leaf chip
  '#763b36', // bark dust
  '#ffffff', // impact spark
]);

const BASE_PARTICLE_VECTORS: ReadonlyArray<readonly [number, number, number]> = Object.freeze([
  [-36, -24, 5],
  [34, -26, 5],
  [-42, 12, 4],
  [40, 14, 4],
  [-18, 32, 4],
  [22, 30, 5],
]);

/**
 * SSR-safe check for user's prefers-reduced-motion preference.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Checks whether a single cell coordinate lies within the 4×4 chunk at `chunkOrigin`.
 */
export function isCellInChunk(
  coord: GridCoordinate,
  chunkOrigin: GridCoordinate | null | undefined
): boolean {
  if (!chunkOrigin) return false;
  return (
    coord.x >= chunkOrigin.x &&
    coord.x < chunkOrigin.x + CHUNK_WIDTH &&
    coord.y >= chunkOrigin.y &&
    coord.y < chunkOrigin.y + CHUNK_HEIGHT
  );
}

/**
 * Checks whether placing a building footprint at `origin` overlaps any cell
 * inside the target 4×4 chunk origin (works symmetrically for negative coordinates).
 */
export function doesFootprintOverlapChunkOrigin(
  origin: GridCoordinate,
  footprint: { readonly width: number; readonly height: number },
  chunkOrigin: GridCoordinate | null | undefined
): boolean {
  if (!chunkOrigin) return false;
  const endX = origin.x + Math.max(1, footprint.width);
  const endY = origin.y + Math.max(1, footprint.height);
  const chunkEndX = chunkOrigin.x + CHUNK_WIDTH;
  const chunkEndY = chunkOrigin.y + CHUNK_HEIGHT;

  return (
    origin.x < chunkEndX &&
    endX > chunkOrigin.x &&
    origin.y < chunkEndY &&
    endY > chunkOrigin.y
  );
}

/**
 * Returns true once the post-commit expansion animation reaches EXPANSION_IMPACT_MS
 * (or immediately if no reveal is active or reduced motion is preferred).
 */
export function isExpansionChunkRevealed(
  reveal: ActiveExpansionReveal | null,
  elapsedMs: number
): boolean {
  if (!reveal || reveal.reducedMotion) return true;
  if (!Number.isFinite(elapsedMs)) return false;
  return elapsedMs >= EXPANSION_IMPACT_MS;
}

/**
 * Diffs known chunk origins vs committed snapshot chunks to find newly unlocked chunk origins.
 */
export function detectNewlyAddedChunks(
  prevOrigins: readonly GridCoordinate[],
  nextChunks: readonly { readonly origin: GridCoordinate }[]
): GridCoordinate[] {
  const prevSet = new Set(prevOrigins.map((o) => `${o.x},${o.y}`));
  const added: GridCoordinate[] = [];
  for (const chunk of nextChunks) {
    const key = `${chunk.origin.x},${chunk.origin.y}`;
    if (!prevSet.has(key)) {
      added.push({ x: chunk.origin.x, y: chunk.origin.y });
    }
  }
  return added;
}

/**
 * Builds deterministic visual overlay plan for any unlocked chunk origin (positive or negative).
 */
export function buildExpansionAnimationPlan(
  origin: GridCoordinate,
  cellSize = 32
): ExpansionAnimationPlan {
  const safeCellSize = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 32;
  const chunkWidthPx = CHUNK_WIDTH * safeCellSize;
  const chunkHeightPx = CHUNK_HEIGHT * safeCellSize;
  const centerPxX = chunkWidthPx / 2;
  const centerPxY = chunkHeightPx / 2;

  // Deterministic tiny angular tweak per chunk parity so successive chops look natural
  const parityOffset = Math.abs((origin.x * 7 + origin.y * 13) | 0) % 5;

  const particles: ExpansionParticleSpec[] = BASE_PARTICLE_VECTORS.map(([vx, vy, sizePx], idx) => ({
    id: idx,
    txPx: vx + (idx % 2 === 0 ? parityOffset : -parityOffset),
    tyPx: vy + ((idx + parityOffset) % 3) - 1,
    sizePx,
    colorHex: EXPANSION_PARTICLE_COLORS[idx % EXPANSION_PARTICLE_COLORS.length],
  }));

  return {
    origin: { x: Math.trunc(origin.x), y: Math.trunc(origin.y) },
    axePack: EXPANSION_AXE_PACK,
    axeTileIndex: EXPANSION_AXE_TILE_INDEX,
    impactDelayMs: EXPANSION_IMPACT_MS,
    shakeDurationMs: EXPANSION_SHAKE_DURATION_MS,
    totalDurationMs: EXPANSION_ANIMATION_DURATION_MS,
    chunkWidthPx,
    chunkHeightPx,
    centerPxX,
    centerPxY,
    axeStartYOffsetPx: -Math.round(safeCellSize * 1.75),
    particles,
  };
}
