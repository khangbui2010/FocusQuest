import { BuildingInstance } from '../../../core/civilization/buildingTypes.ts';
import { GridMap } from '../../../core/civilization/gridMap.ts';
import { GridCoordinate } from '../../../core/civilization/types.ts';
import { Villager } from '../../../core/civilization/villager.ts';
import { collectWalkableCells, coordKey } from '../../../core/civilization/villagerWander.ts';
import {
  VillagerAnimationName,
  VillagerDirection,
  getVillagerAnimationForDirection,
} from './spriteRegistry.ts';

export const MAX_CONCURRENT_VILLAGER_ENTRIES = 3;
export const VILLAGER_ENTRY_MAX_DURATION_MS = 3000;
export const VILLAGER_ENTRY_STEP_MS = 280;
export const VILLAGER_ENTRY_EDGE_FADE_IN_MS = 120;
export const VILLAGER_ENTRY_ENCLAVE_FADE_IN_MS = 200;
export const VILLAGER_ENTRY_ENTER_CAVE_FADE_MS = 200;
export const VILLAGER_ENTRY_DOORWAY_SETTLE_MS = 440;
const MAX_ENTRY_BFS_DEPTH = 10;
const MAX_ENTRY_WALK_STEPS = 8;

export type VillagerEntryMode =
  | 'walk-from-edge'
  | 'fade-in-settlement'
  | 'doorway-settle';

export interface VillagerEntryPlan {
  readonly mode: VillagerEntryMode;
  readonly doorwayCell: GridCoordinate;
  readonly entranceCell: GridCoordinate;
  readonly startCell: GridCoordinate;
  readonly path: readonly GridCoordinate[];
  readonly steps: number;
  readonly stepMs: number;
  readonly fadeInMs: number;
  readonly walkDurationMs: number;
  readonly holdMs: number;
  readonly fadeOutMs: number;
  readonly totalDurationMs: number;
  readonly initialDirection: VillagerDirection;
}

export interface ActiveVillagerEntry {
  readonly villager: Villager;
  readonly plan: VillagerEntryPlan;
  readonly startedAt: number;
  readonly previewElapsedMs?: number;
}

export interface VillagerEntryFrame {
  readonly x: number;
  readonly y: number;
  readonly cell: GridCoordinate;
  readonly direction: VillagerDirection;
  readonly animation: VillagerAnimationName;
  readonly opacity: number;
  readonly elapsedMs: number;
  readonly progress: number;
  readonly finished: boolean;
}

interface EntryBfsNode {
  readonly cell: GridCoordinate;
  readonly depth: number;
  readonly parentKey: string | null;
}

const ENTRY_CARDINAL_DELTAS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [0, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function getVillagerEntryDirection(
  from: GridCoordinate,
  to: GridCoordinate
): VillagerDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    return dx > 0 ? 'right' : 'left';
  }
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return 'up';
}

function isAdjacentToLockedForest(cell: GridCoordinate, gridMap: GridMap): boolean {
  for (const [dx, dy] of ENTRY_CARDINAL_DELTAS) {
    if (!gridMap.isCellUnlocked(cell.x + dx, cell.y + dy)) {
      return true;
    }
  }
  return false;
}

function reconstructPathToEntrance(
  startKey: string,
  visited: ReadonlyMap<string, EntryBfsNode>
): GridCoordinate[] {
  const path: GridCoordinate[] = [];
  let cursor = visited.get(startKey);
  while (cursor) {
    path.push({ x: cursor.cell.x, y: cursor.cell.y });
    if (cursor.parentKey === null) break;
    cursor = visited.get(cursor.parentKey);
  }
  return path;
}

function pickForestEdgeNode(nodes: readonly EntryBfsNode[]): EntryBfsNode {
  const ideal = nodes.filter((n) => n.depth >= 3 && n.depth <= 7);
  const pool =
    ideal.length > 0
      ? ideal
      : nodes.filter((n) => n.depth >= 1 && n.depth <= MAX_ENTRY_WALK_STEPS);
  const candidates = pool.length > 0 ? pool : nodes;

  return [...candidates].sort((a, b) => {
    const distA = Math.abs(a.depth - 5);
    const distB = Math.abs(b.depth - 5);
    if (distA !== distB) return distA - distB;
    if (a.cell.y !== b.cell.y) return b.cell.y - a.cell.y;
    return a.cell.x - b.cell.x;
  })[0];
}

function pickEnclaveStartNode(nodes: readonly EntryBfsNode[]): EntryBfsNode {
  const bounded = nodes.filter((n) => n.depth >= 1 && n.depth <= MAX_ENTRY_WALK_STEPS);
  const candidates = bounded.length > 0 ? bounded : nodes;

  return [...candidates].sort((a, b) => {
    if (a.depth !== b.depth) return b.depth - a.depth;
    if (a.cell.y !== b.cell.y) return b.cell.y - a.cell.y;
    return a.cell.x - b.cell.x;
  })[0];
}

export interface MapCameraViewportState {
  readonly pan: { readonly x: number; readonly y: number };
  readonly zoom: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly renderBox: {
    readonly minX: number;
    readonly minY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly cellSize: number;
}

export interface IsCaveVisibleInput extends MapCameraViewportState {
  readonly cave: BuildingInstance | undefined;
}

/**
 * Pure viewport visibility check matching MapGridView's centered stage transform:
 * `translate(pan.x, pan.y) scale(zoom)` with `transform-origin: center center`.
 * Returns `false` when Rock Shelter is panned offscreen or out of view after zooming.
 */
export function isCaveVisibleInViewport({
  cave,
  pan,
  zoom,
  viewport,
  renderBox,
  cellSize,
}: IsCaveVisibleInput): boolean {
  if (!cave) return false;
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return true;
  }
  if (!Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(cellSize) || cellSize <= 0) {
    return false;
  }

  const mapWidthPx = renderBox.width * cellSize;
  const mapHeightPx = renderBox.height * cellSize;
  const caveStageLeft = (cave.position.x - renderBox.minX) * cellSize;
  const caveStageTop = (cave.position.y - renderBox.minY) * cellSize;
  const caveStageRight = (cave.position.x + 3 - renderBox.minX) * cellSize;
  const caveStageBottom = (cave.position.y + 3 - renderBox.minY) * cellSize;

  const vxLeft = viewport.width / 2 + pan.x + (caveStageLeft - mapWidthPx / 2) * zoom;
  const vxRight = viewport.width / 2 + pan.x + (caveStageRight - mapWidthPx / 2) * zoom;
  const vyTop = viewport.height / 2 + pan.y + (caveStageTop - mapHeightPx / 2) * zoom;
  const vyBottom = viewport.height / 2 + pan.y + (caveStageBottom - mapHeightPx / 2) * zoom;

  return (
    vxRight > 0 &&
    vxLeft < viewport.width &&
    vyBottom > 0 &&
    vyTop < viewport.height
  );
}

export interface ComputeVillagerCaveEntryInput {
  readonly cave: BuildingInstance | undefined;
  readonly buildings: readonly BuildingInstance[];
  readonly gridMap: GridMap;
}

/**
 * Pure planner computing a UI-only entry path for a newly recruited villager
 * walking into the 3x3 Rock Shelter doorway (`cave.x + 1, cave.y + 2`).
 *
 * Handles:
 * 1. `walk-from-edge`: reachable unlocked forest/settlement perimeter -> entrance -> doorway.
 * 2. `fade-in-settlement`: walled enclave (no forest edge reachable) -> fade-in & walk -> doorway.
 * 3. `doorway-settle`: boxed-in doorway (`entrance` locked or occupied) -> brief <500ms settle.
 */
export function computeVillagerCaveEntryPlan({
  cave,
  buildings,
  gridMap,
}: ComputeVillagerCaveEntryInput): VillagerEntryPlan | null {
  if (!cave) return null;

  const doorwayCell: GridCoordinate = {
    x: cave.position.x + 1,
    y: cave.position.y + 2,
  };
  const entranceCell: GridCoordinate = {
    x: cave.position.x + 1,
    y: cave.position.y + 3,
  };

  const { walkableSet } = collectWalkableCells(gridMap, buildings);
  const entranceKey = coordKey(entranceCell);

  if (!walkableSet.has(entranceKey)) {
    const fadeInMs = 120;
    const holdMs = 160;
    const fadeOutMs = 160;
    return {
      mode: 'doorway-settle',
      doorwayCell,
      entranceCell,
      startCell: doorwayCell,
      path: [doorwayCell],
      steps: 0,
      stepMs: 0,
      fadeInMs,
      walkDurationMs: 0,
      holdMs,
      fadeOutMs,
      totalDurationMs: Math.min(VILLAGER_ENTRY_DOORWAY_SETTLE_MS, fadeInMs + holdMs + fadeOutMs),
      initialDirection: 'up',
    };
  }

  const visited = new Map<string, EntryBfsNode>();
  const queue: EntryBfsNode[] = [{ cell: entranceCell, depth: 0, parentKey: null }];
  visited.set(entranceKey, queue[0]);

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (current.depth >= MAX_ENTRY_BFS_DEPTH) continue;
    const currentKey = coordKey(current.cell);

    for (const [dx, dy] of ENTRY_CARDINAL_DELTAS) {
      const nx = current.cell.x + dx;
      const ny = current.cell.y + dy;
      const nKey = `${nx},${ny}`;
      if (visited.has(nKey)) continue;
      if (!walkableSet.has(nKey)) continue;

      const node: EntryBfsNode = {
        cell: { x: nx, y: ny },
        depth: current.depth + 1,
        parentKey: currentKey,
      };
      visited.set(nKey, node);
      queue.push(node);
    }
  }

  const reachableNodes = [...visited.values()];
  const forestEdgeNodes = reachableNodes.filter((n) =>
    isAdjacentToLockedForest(n.cell, gridMap)
  );

  let mode: VillagerEntryMode;
  let startNode: EntryBfsNode;
  if (forestEdgeNodes.length > 0) {
    mode = 'walk-from-edge';
    startNode = pickForestEdgeNode(forestEdgeNodes);
  } else {
    mode = 'fade-in-settlement';
    startNode = pickEnclaveStartNode(reachableNodes);
  }

  const pathToEntrance = reconstructPathToEntrance(coordKey(startNode.cell), visited);
  const fullPath: GridCoordinate[] = [...pathToEntrance, doorwayCell];
  const steps = Math.max(1, fullPath.length - 1);
  const fadeInMs =
    mode === 'fade-in-settlement'
      ? VILLAGER_ENTRY_ENCLAVE_FADE_IN_MS
      : VILLAGER_ENTRY_EDGE_FADE_IN_MS;
  const fadeOutMs = VILLAGER_ENTRY_ENTER_CAVE_FADE_MS;
  const maxWalkBudget = Math.max(120, VILLAGER_ENTRY_MAX_DURATION_MS - fadeInMs - fadeOutMs);
  const stepMs = Math.max(80, Math.min(VILLAGER_ENTRY_STEP_MS, Math.floor(maxWalkBudget / steps)));
  const walkDurationMs = steps * stepMs;
  const totalDurationMs = Math.min(
    VILLAGER_ENTRY_MAX_DURATION_MS,
    fadeInMs + walkDurationMs + fadeOutMs
  );

  const initialDirection =
    fullPath.length >= 2
      ? getVillagerEntryDirection(fullPath[0], fullPath[1])
      : 'up';

  return {
    mode,
    doorwayCell,
    entranceCell,
    startCell: fullPath[0],
    path: fullPath,
    steps,
    stepMs,
    fadeInMs,
    walkDurationMs,
    holdMs: 0,
    fadeOutMs,
    totalDurationMs,
    initialDirection,
  };
}

/**
 * Pure frame sampler returning exact position, sprite animation, and opacity at `elapsedMs`.
 */
export function sampleVillagerEntryFrame(
  plan: VillagerEntryPlan,
  elapsedMs: number
): VillagerEntryFrame {
  const safeTotal = Math.max(1, plan.totalDurationMs);
  const clamped = Math.max(0, Math.min(safeTotal, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  const progress = clamp01(clamped / safeTotal);
  const finished = clamped >= safeTotal;

  if (plan.mode === 'doorway-settle' || plan.steps === 0 || plan.path.length <= 1) {
    const holdEnd = plan.fadeInMs + plan.holdMs;
    let opacity = 1;
    if (clamped < plan.fadeInMs && plan.fadeInMs > 0) {
      opacity = clamp01(clamped / plan.fadeInMs);
    } else if (clamped >= holdEnd && plan.fadeOutMs > 0) {
      opacity = clamp01(1 - (clamped - holdEnd) / plan.fadeOutMs);
    }
    return {
      x: plan.doorwayCell.x,
      y: plan.doorwayCell.y,
      cell: plan.doorwayCell,
      direction: 'up',
      animation: getVillagerAnimationForDirection('up', false),
      opacity,
      elapsedMs: clamped,
      progress,
      finished,
    };
  }

  if (clamped < plan.fadeInMs) {
    const startCell = plan.path[0];
    const startOpacity = plan.fadeInMs > 0 ? clamp01(clamped / plan.fadeInMs) : 1;
    return {
      x: startCell.x,
      y: startCell.y,
      cell: startCell,
      direction: plan.initialDirection,
      animation: getVillagerAnimationForDirection(plan.initialDirection, false),
      opacity: plan.mode === 'fade-in-settlement' ? startOpacity : 0.25 + 0.75 * startOpacity,
      elapsedMs: clamped,
      progress,
      finished,
    };
  }

  const walkEnd = plan.fadeInMs + plan.walkDurationMs;
  if (clamped < walkEnd && plan.stepMs > 0) {
    const walkElapsed = clamped - plan.fadeInMs;
    const stepIndex = Math.min(plan.steps - 1, Math.floor(walkElapsed / plan.stepMs));
    const stepProgress = clamp01((walkElapsed - stepIndex * plan.stepMs) / plan.stepMs);
    const from = plan.path[stepIndex];
    const to = plan.path[stepIndex + 1];
    const direction = getVillagerEntryDirection(from, to);

    return {
      x: from.x + (to.x - from.x) * stepProgress,
      y: from.y + (to.y - from.y) * stepProgress,
      cell: stepProgress >= 0.5 ? to : from,
      direction,
      animation: getVillagerAnimationForDirection(direction, true),
      opacity: 1,
      elapsedMs: clamped,
      progress,
      finished,
    };
  }

  const fadeOutElapsed = clamped - walkEnd;
  const opacity = plan.fadeOutMs > 0 ? clamp01(1 - fadeOutElapsed / plan.fadeOutMs) : 0;
  return {
    x: plan.doorwayCell.x,
    y: plan.doorwayCell.y,
    cell: plan.doorwayCell,
    direction: 'up',
    animation: getVillagerAnimationForDirection('up', false),
    opacity,
    elapsedMs: clamped,
    progress,
    finished,
  };
}
