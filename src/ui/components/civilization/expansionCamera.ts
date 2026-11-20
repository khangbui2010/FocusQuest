import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../../../core/civilization/constants.ts';
import { GridCoordinate } from '../../../core/civilization/types.ts';

export type ExpansionFlowState =
  | 'NORMAL'
  | 'EXPANSION_SELECTING'
  | 'CINEMATIC_MOVING'
  | 'CHOPPING'
  | 'TERRAIN_UPDATING'
  | 'CAMERA_RETURNING';

export type CameraReturnTarget = 'NORMAL' | 'EXPANSION_SELECTING';

export interface CameraPan {
  readonly x: number;
  readonly y: number;
}

export interface CameraViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface RenderBoxBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface CameraSnapshot {
  readonly pan: CameraPan;
  readonly zoom: number;
  readonly viewport: CameraViewportSize;
  readonly stageCenterWorldX: number;
  readonly stageCenterWorldY: number;
}

export const DEFAULT_CELL_SIZE = 32;
export const EXPANSION_CINEMATIC_MS = 600;

export const VALID_EXPANSION_TRANSITIONS: Readonly<
  Record<ExpansionFlowState, readonly ExpansionFlowState[]>
> = Object.freeze({
  NORMAL: ['EXPANSION_SELECTING'],
  EXPANSION_SELECTING: ['CINEMATIC_MOVING', 'CAMERA_RETURNING', 'NORMAL'],
  CINEMATIC_MOVING: ['CHOPPING', 'CAMERA_RETURNING', 'NORMAL'],
  CHOPPING: ['TERRAIN_UPDATING', 'CAMERA_RETURNING', 'NORMAL'],
  TERRAIN_UPDATING: ['CAMERA_RETURNING', 'NORMAL'],
  CAMERA_RETURNING: ['NORMAL', 'EXPANSION_SELECTING'],
});

export function canTransitionExpansionFlow(
  from: ExpansionFlowState,
  to: ExpansionFlowState
): boolean {
  if (from === to) return true;
  return VALID_EXPANSION_TRANSITIONS[from].includes(to);
}

export function transitionExpansionFlow(
  from: ExpansionFlowState,
  to: ExpansionFlowState
): ExpansionFlowState {
  return canTransitionExpansionFlow(from, to) ? to : from;
}

export function isExpansionFlowActive(state: ExpansionFlowState): boolean {
  return state !== 'NORMAL';
}

export function canSelectExpansionSlot(state: ExpansionFlowState): boolean {
  return state === 'EXPANSION_SELECTING';
}

export function canCancelExpansionMode(state: ExpansionFlowState): boolean {
  return state === 'EXPANSION_SELECTING';
}

export function isManualCameraLocked(state: ExpansionFlowState): boolean {
  return (
    state === 'CINEMATIC_MOVING' ||
    state === 'CHOPPING' ||
    state === 'TERRAIN_UPDATING' ||
    state === 'CAMERA_RETURNING'
  );
}

export function isExpansionCandidatesVisible(state: ExpansionFlowState): boolean {
  return state === 'EXPANSION_SELECTING' || state === 'CINEMATIC_MOVING';
}

export function computeStageWorldCenter(renderBox: {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}): { readonly x: number; readonly y: number } {
  return {
    x: renderBox.minX + renderBox.width / 2,
    y: renderBox.minY + renderBox.height / 2,
  };
}

/**
 * Captures an exact persistent camera snapshot when entering Expansion Mode without modifying
 * position, zoom, or viewport dimensions.
 */
export function createCameraSnapshot(
  pan: CameraPan,
  zoom: number,
  viewport: CameraViewportSize,
  renderBox: {
    readonly minX: number;
    readonly minY: number;
    readonly width: number;
    readonly height: number;
  }
): CameraSnapshot {
  const worldCenter = computeStageWorldCenter(renderBox);
  return {
    pan: { x: Math.round(pan.x), y: Math.round(pan.y) },
    zoom,
    viewport: {
      width: Math.max(0, Math.round(viewport.width)),
      height: Math.max(0, Math.round(viewport.height)),
    },
    stageCenterWorldX: worldCenter.x,
    stageCenterWorldY: worldCenter.y,
  };
}

/**
 * Restores the target pan from a saved CameraSnapshot, compensating automatically if the stage
 * bounding box shifted (e.g., after expanding West (-4, 0) or North (0, -4)) so the world point
 * under the camera returns to its exact pre-expansion position with zero jump.
 */
export function computeRestoredPanFromSnapshot(
  snapshot: CameraSnapshot,
  currentRenderBox: {
    readonly minX: number;
    readonly minY: number;
    readonly width: number;
    readonly height: number;
  },
  cellSize = DEFAULT_CELL_SIZE
): CameraPan {
  const newCenter = computeStageWorldCenter(currentRenderBox);
  const deltaCenterX = newCenter.x - snapshot.stageCenterWorldX;
  const deltaCenterY = newCenter.y - snapshot.stageCenterWorldY;

  return {
    x: Math.round(snapshot.pan.x + deltaCenterX * cellSize * snapshot.zoom),
    y: Math.round(snapshot.pan.y + deltaCenterY * cellSize * snapshot.zoom),
  };
}

/**
 * Computes the stage translation `pan` that places the center of the 4x4 chunk at `origin`
 * squarely in the center of the viewport while keeping `zoom` untouched.
 */
export function computeChunkCenterPan(
  origin: GridCoordinate,
  renderMinX: number,
  renderMinY: number,
  mapWidthPx: number,
  mapHeightPx: number,
  zoom: number,
  cellSize = DEFAULT_CELL_SIZE
): { x: number; y: number } {
  const chunkCenterX = (origin.x + CHUNK_WIDTH / 2 - renderMinX) * cellSize;
  const chunkCenterY = (origin.y + CHUNK_HEIGHT / 2 - renderMinY) * cellSize;
  return {
    x: Math.round(-(chunkCenterX - mapWidthPx / 2) * zoom),
    y: Math.round(-(chunkCenterY - mapHeightPx / 2) * zoom),
  };
}

export function easeInOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function interpolatePan(
  start: CameraPan,
  end: CameraPan,
  progress: number
): { x: number; y: number } {
  const e = easeInOutCubic(progress);
  return {
    x: Math.round(start.x + (end.x - start.x) * e),
    y: Math.round(start.y + (end.y - start.y) * e),
  };
}
