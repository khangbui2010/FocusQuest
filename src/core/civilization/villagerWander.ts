/**
 * Pure Villager Wandering Domain Engine for Focus Quest Civilization.
 * Milestone Villager V3: UI-Only Map Wandering (Zero Persisted Coordinates)
 *
 * Rules:
 * - Strictly pure & deterministic: zero Date.now(), zero Math.random(), zero I/O.
 * - Villagers only occupy/traverse unlocked cells outside all building footprints.
 * - No two villagers may share the same cell on any tick (strict reservation + swap prevention).
 * - Weighted attractors: Campfire (highest) > Houses/Economy (medium) > Cave & Totem (low).
 *   When none of those buildings exist, defaults around the Cave entrance.
 * - Alternates naturally between walking (BFS shortest path <= 12 steps) and waiting (idle).
 */

import { CHUNK_HEIGHT, CHUNK_WIDTH } from './constants.ts';
import { getBuildingDefinition } from './buildingCatalog.ts';
import { BuildingInstance } from './buildingTypes.ts';
import { GridMap } from './gridMap.ts';
import { getFootprintCoordinates } from './placementValidator.ts';
import { GridCoordinate } from './types.ts';
import {
  Villager,
  VILLAGE_CAVE_DEFINITION_ID,
  findVillageCave,
  getVillagerIdleSpots,
} from './villager.ts';
import { VillagerRole } from '../../ui/components/civilization/spriteRegistry.ts';

export const VILLAGER_WANDER_TICK_MS = 700;
export const MAX_WANDER_PATH_STEPS = 12;
export const ATTRACTOR_PICK_PROBABILITY = 0.7;

export type HorizontalFacing = 'left' | 'right';
export type VillagerAnimationName = 'idle' | 'walk_down' | 'walk_right' | 'walk_left';

export interface VillagerWanderState {
  readonly villagerId: string;
  readonly role: VillagerRole;
  readonly recruitedAt: number;
  readonly cell: GridCoordinate;
  readonly facing: HorizontalFacing;
  readonly animation: VillagerAnimationName;
  readonly waitTicks: number;
  readonly path: readonly GridCoordinate[];
}

export interface AttractorSpot {
  readonly cell: GridCoordinate;
  readonly weight: number;
  readonly sourceBuildingId: string;
  readonly definitionId: string;
}

export interface WanderWorld {
  readonly gridMap: GridMap;
  readonly buildings: readonly BuildingInstance[];
  readonly cave: BuildingInstance | undefined;
  readonly walkableSet: ReadonlySet<string>;
  readonly walkableCells: readonly GridCoordinate[];
  readonly buildingOccupiedSet: ReadonlySet<string>;
  readonly attractors: readonly AttractorSpot[];
}

const BUILDING_ATTRACTOR_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  stone_age_campfire: 10,
  stone_age_elder_hut: 5,
  stone_age_foraging_post: 5,
  stone_age_food_cache: 5,
  stone_age_study_cave: 2,
  stone_age_totem: 2,
});

const CARDINAL_DELTAS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]);

const SPAWN_PRIORITY_OFFSETS: ReadonlyArray<readonly [number, number]> = (() => {
  // Offsets relative to Cave bottom-center anchor (cave.x + 1, cave.y + 2)
  const offsets: [number, number][] = [
    [0, 1], // Direct entrance door step
    [-1, 1],
    [1, 1],
    [-2, 0],
    [2, 0],
    [-2, 1],
    [2, 1],
    [0, 2],
    [-1, 2],
    [1, 2],
    [-2, 2],
    [2, 2],
    [-2, -1],
    [2, -1],
    [-2, -2],
    [2, -2],
    [0, -3],
    [-1, -3],
    [1, -3],
    [-2, -3],
    [2, -3],
  ];
  const seen = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
  for (let radius = 3; radius <= 5; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const key = `${dx},${dy}`;
        if (!seen.has(key)) {
          seen.add(key);
          offsets.push([dx, dy]);
        }
      }
    }
  }
  return offsets;
})();

export function coordKey(c: GridCoordinate): string {
  return `${c.x},${c.y}`;
}

function manhattanDistance(a: GridCoordinate, b: GridCoordinate): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Deterministic 32-bit FNV-1a string hash.
 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic 32-bit Mulberry32 PRNG returning values in [0, 1).
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createVillagerTickRng(villagerId: string, tick: number): () => number {
  const base = hashSeed(villagerId);
  const mixed = (base ^ Math.imul((tick + 1) >>> 0, 0x9e3779b1)) >>> 0;
  return createSeededRng(mixed);
}

function randomInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  if (maxInclusive <= minInclusive) return minInclusive;
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

function sortVillagersStable(villagers: readonly Villager[]): readonly Villager[] {
  return [...villagers].sort(
    (a, b) => a.recruitedAt - b.recruitedAt || a.id.localeCompare(b.id)
  );
}

/**
 * Maps a single-step delta onto VillagerSprite's supported animation set
 * ('idle' | 'walk_down' | 'walk_right' | 'walk_left').
 * Since VillagerSprite has no 'walk_up', northward steps fall back to `lastFacing`.
 */
export function getWalkAnimation(
  from: GridCoordinate,
  to: GridCoordinate,
  lastFacing: HorizontalFacing = 'right'
): VillagerAnimationName {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx > 0) return 'walk_right';
  if (dx < 0) return 'walk_left';
  if (dx === 0 && dy > 0) return 'walk_down';
  if (dx === 0 && dy < 0) return lastFacing === 'left' ? 'walk_left' : 'walk_right';
  return 'idle';
}

export function getNextHorizontalFacing(
  from: GridCoordinate,
  to: GridCoordinate,
  lastFacing: HorizontalFacing = 'right'
): HorizontalFacing {
  const dx = to.x - from.x;
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  return lastFacing;
}

export function getAttractorWeight(definitionId: string): number {
  return BUILDING_ATTRACTOR_WEIGHTS[definitionId] ?? 0;
}

function collectBuildingOccupiedKeys(
  gridMap: GridMap,
  buildings: readonly BuildingInstance[]
): Set<string> {
  const occupied = new Set<string>();

  for (const building of buildings) {
    const def = getBuildingDefinition(building.definitionId);
    const footprint = def?.footprint ?? { width: 1, height: 1 };
    const coords = getFootprintCoordinates(building.position, footprint);
    for (const c of coords) {
      occupied.add(coordKey(c));
    }
  }

  for (const chunk of gridMap.getUnlockedChunks()) {
    for (let dy = 0; dy < CHUNK_HEIGHT; dy++) {
      for (let dx = 0; dx < CHUNK_WIDTH; dx++) {
        const cx = chunk.origin.x + dx;
        const cy = chunk.origin.y + dy;
        if (gridMap.getOccupyingBuilding(cx, cy) !== undefined) {
          occupied.add(`${cx},${cy}`);
        }
      }
    }
  }

  return occupied;
}

/**
 * Computes all walkable cells (strictly unlocked and outside all building footprints),
 * sorted deterministically by (y, x). Safe with negative coordinates and arbitrary chunk layouts.
 */
export function collectWalkableCells(
  gridMap: GridMap,
  buildings: readonly BuildingInstance[]
): {
  readonly walkableSet: Set<string>;
  readonly walkableCells: GridCoordinate[];
  readonly buildingOccupiedSet: Set<string>;
} {
  const buildingOccupiedSet = collectBuildingOccupiedKeys(gridMap, buildings);
  const walkableSet = new Set<string>();
  const walkableCells: GridCoordinate[] = [];

  for (const chunk of gridMap.getUnlockedChunks()) {
    for (let dy = 0; dy < CHUNK_HEIGHT; dy++) {
      for (let dx = 0; dx < CHUNK_WIDTH; dx++) {
        const cx = chunk.origin.x + dx;
        const cy = chunk.origin.y + dy;
        const key = `${cx},${cy}`;
        if (walkableSet.has(key)) continue;
        if (!gridMap.isCellUnlocked(cx, cy)) continue;
        if (buildingOccupiedSet.has(key)) continue;
        walkableSet.add(key);
        walkableCells.push({ x: cx, y: cy });
      }
    }
  }

  walkableCells.sort((a, b) => a.y - b.y || a.x - b.x);
  return { walkableSet, walkableCells, buildingOccupiedSet };
}

/**
 * Builds weighted walkable adjacent spots around buildings.
 * Weights: Campfire (10) > Houses/Economy (5) > Cave entrance & Totem (2).
 * Stops are at least 1 cell away from building footprints and never inside footprints.
 */
export function getWanderAttractors(
  buildings: readonly BuildingInstance[],
  gridMap?: GridMap,
  walkableSetOverride?: ReadonlySet<string>
): readonly AttractorSpot[] {
  const buildingOccupiedSet = gridMap
    ? collectBuildingOccupiedKeys(gridMap, buildings)
    : (() => {
        const set = new Set<string>();
        for (const b of buildings) {
          const def = getBuildingDefinition(b.definitionId);
          const coords = getFootprintCoordinates(b.position, def?.footprint ?? { width: 1, height: 1 });
          for (const c of coords) set.add(coordKey(c));
        }
        return set;
      })();

  const bestSpotByCell = new Map<string, AttractorSpot>();

  const registerCandidate = (
    cell: GridCoordinate,
    weight: number,
    sourceBuildingId: string,
    definitionId: string
  ) => {
    const key = coordKey(cell);
    if (buildingOccupiedSet.has(key)) return;
    if (walkableSetOverride) {
      if (!walkableSetOverride.has(key)) return;
    } else if (gridMap && !gridMap.isCellUnlocked(cell.x, cell.y)) {
      return;
    }

    const existing = bestSpotByCell.get(key);
    if (!existing || weight > existing.weight) {
      bestSpotByCell.set(key, {
        cell: { x: cell.x, y: cell.y },
        weight,
        sourceBuildingId,
        definitionId,
      });
    }
  };

  for (const building of buildings) {
    const weight = getAttractorWeight(building.definitionId);
    if (weight <= 0) continue;

    if (building.definitionId === VILLAGE_CAVE_DEFINITION_ID) {
      // Focus Cave attraction around its southern entrance and immediate side perimeter
      const entranceX = building.position.x + 1;
      const entranceY = building.position.y + 2;
      for (const [dx, dy] of SPAWN_PRIORITY_OFFSETS.slice(0, 12)) {
        registerCandidate(
          { x: entranceX + dx, y: entranceY + dy },
          weight,
          building.id,
          building.definitionId
        );
      }
      continue;
    }

    const def = getBuildingDefinition(building.definitionId);
    const footprint = def?.footprint ?? { width: 1, height: 1 };
    const startX = building.position.x - 1;
    const endX = building.position.x + footprint.width;
    const startY = building.position.y - 1;
    const endY = building.position.y + footprint.height;

    for (let cy = startY; cy <= endY; cy++) {
      for (let cx = startX; cx <= endX; cx++) {
        registerCandidate({ x: cx, y: cy }, weight, building.id, building.definitionId);
      }
    }
  }

  // Fallback when no non-Cave attractors exist yet: ensure Cave entrance cells still attract
  if (bestSpotByCell.size === 0) {
    const cave = findVillageCave(buildings);
    if (cave) {
      const entranceX = cave.position.x + 1;
      const entranceY = cave.position.y + 2;
      for (const [dx, dy] of SPAWN_PRIORITY_OFFSETS.slice(0, 16)) {
        registerCandidate(
          { x: entranceX + dx, y: entranceY + dy },
          BUILDING_ATTRACTOR_WEIGHTS.stone_age_study_cave,
          cave.id,
          cave.definitionId
        );
      }
    }
  }

  return [...bestSpotByCell.values()].sort(
    (a, b) => b.weight - a.weight || a.cell.y - b.cell.y || a.cell.x - b.cell.x
  );
}

/**
 * Builds an immutable WanderWorld snapshot used by pathfinding and step ticks.
 */
export function buildWanderWorld(
  gridMap: GridMap,
  buildings: readonly BuildingInstance[]
): WanderWorld {
  const cave = findVillageCave(buildings);
  const { walkableSet, walkableCells, buildingOccupiedSet } = collectWalkableCells(
    gridMap,
    buildings
  );
  const attractors = getWanderAttractors(buildings, gridMap, walkableSet);

  return {
    gridMap,
    buildings,
    cave,
    walkableSet,
    walkableCells,
    buildingOccupiedSet,
    attractors,
  };
}

/**
 * Resolves the Cave entrance spawn coordinate for a newly recruited villager,
 * preferring the cell directly south of the 3x3 Cave door and avoiding occupied cells.
 */
export function getSpawnCell(
  cave: BuildingInstance | undefined,
  worldOrGrid: WanderWorld | GridMap,
  occupiedKeys: ReadonlySet<string> = new Set()
): GridCoordinate | null {
  const isWanderWorld = 'walkableCells' in worldOrGrid;
  const gridMap = isWanderWorld ? worldOrGrid.gridMap : worldOrGrid;

  const isCellValid = (cx: number, cy: number): boolean => {
    const key = `${cx},${cy}`;
    if (occupiedKeys.has(key)) return false;
    if (isWanderWorld) {
      return worldOrGrid.walkableSet.has(key);
    }
    return gridMap.isCellUnlocked(cx, cy) && gridMap.getOccupyingBuilding(cx, cy) === undefined;
  };

  if (cave) {
    const entranceX = cave.position.x + 1;
    const entranceY = cave.position.y + 2;
    for (const [dx, dy] of SPAWN_PRIORITY_OFFSETS) {
      const cx = entranceX + dx;
      const cy = entranceY + dy;
      if (isCellValid(cx, cy)) {
        return { x: cx, y: cy };
      }
    }
  }

  const anchor: GridCoordinate = cave
    ? { x: cave.position.x + 1, y: cave.position.y + 3 }
    : { x: 0, y: 0 };

  const candidates = isWanderWorld
    ? worldOrGrid.walkableCells
    : collectWalkableCells(gridMap, []).walkableCells;

  let best: GridCoordinate | null = null;
  let bestDist = Infinity;
  for (const cell of candidates) {
    if (!isCellValid(cell.x, cell.y)) continue;
    const dist = manhattanDistance(cell, anchor);
    if (
      dist < bestDist ||
      (dist === bestDist && best && (cell.y < best.y || (cell.y === best.y && cell.x < best.x)))
    ) {
      best = { x: cell.x, y: cell.y };
      bestDist = dist;
    }
  }

  return best;
}

function findNearestFreeWalkableCell(
  from: GridCoordinate,
  world: WanderWorld,
  blockedKeys: ReadonlySet<string>
): GridCoordinate | null {
  let best: GridCoordinate | null = null;
  let bestDist = Infinity;
  for (const cell of world.walkableCells) {
    if (blockedKeys.has(coordKey(cell))) continue;
    const dist = manhattanDistance(from, cell);
    if (
      dist < bestDist ||
      (dist === bestDist && best && (cell.y < best.y || (cell.y === best.y && cell.x < best.x)))
    ) {
      best = { x: cell.x, y: cell.y };
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Initializes villager wander states deterministically at V2 idle spots around the Cave.
 */
export function createInitialWanderStates(
  villagers: readonly Villager[],
  world: WanderWorld
): readonly VillagerWanderState[] {
  if (villagers.length === 0 || world.walkableCells.length === 0) {
    return [];
  }

  const idleSpots = getVillagerIdleSpots(villagers, world.cave, world.gridMap);
  const spotById = new Map(idleSpots.map((s) => [s.villagerId, s.coordinate]));
  const sorted = sortVillagersStable(villagers);
  const takenKeys = new Set<string>();
  const states: VillagerWanderState[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    const spot = spotById.get(v.id);
    let cell: GridCoordinate | null =
      spot && world.walkableSet.has(coordKey(spot)) && !takenKeys.has(coordKey(spot))
        ? { x: spot.x, y: spot.y }
        : null;

    if (!cell) {
      cell = getSpawnCell(world.cave, world, takenKeys);
    }
    if (!cell) continue;

    takenKeys.add(coordKey(cell));
    const rng = createSeededRng(hashSeed(v.id));
    states.push({
      villagerId: v.id,
      role: v.role,
      recruitedAt: v.recruitedAt,
      cell,
      facing: i % 2 === 0 ? 'right' : 'left',
      animation: 'idle',
      waitTicks: randomInt(rng, 0, 2),
      path: [],
    });
  }

  return states;
}

/**
 * Revalidates existing villager states when territory or buildings change
 * (e.g., placing a building on top of a villager relocates them to nearest free cell).
 */
export function revalidateWanderStates(
  states: readonly VillagerWanderState[],
  world: WanderWorld
): readonly VillagerWanderState[] {
  if (states.length === 0 || world.walkableCells.length === 0) {
    return [];
  }

  const sorted = [...states].sort(
    (a, b) => a.recruitedAt - b.recruitedAt || a.villagerId.localeCompare(b.villagerId)
  );
  const takenKeys = new Set<string>();
  const result: VillagerWanderState[] = [];

  for (const state of sorted) {
    const currentKey = coordKey(state.cell);
    let validCell: GridCoordinate | null = null;
    let keepPath = true;

    if (world.walkableSet.has(currentKey) && !takenKeys.has(currentKey)) {
      validCell = state.cell;
    } else {
      validCell = findNearestFreeWalkableCell(state.cell, world, takenKeys);
      keepPath = false;
    }

    if (!validCell) continue;
    takenKeys.add(coordKey(validCell));

    const validPath: GridCoordinate[] = [];
    if (keepPath) {
      for (const step of state.path) {
        if (!world.walkableSet.has(coordKey(step))) break;
        validPath.push(step);
      }
    }

    result.push({
      ...state,
      cell: validCell,
      animation: keepPath ? state.animation : 'idle',
      path: validPath,
    });
  }

  return result;
}

/**
 * Synchronizes existing wander states against the latest Villager list & world:
 * - Preserves positions & paths of existing villagers (revalidated if buildings changed).
 * - Removes demolished/vanished villagers cleanly.
 * - Spawns newly recruited villagers at the Cave entrance (`getSpawnCell`) with waitTicks = 0
 *   so they smoothly walk outward on subsequent ticks without teleporting existing villagers.
 */
export function syncWanderStates(
  prevStates: readonly VillagerWanderState[],
  villagers: readonly Villager[],
  world: WanderWorld,
  isInitialHydration = false
): readonly VillagerWanderState[] {
  if (villagers.length === 0 || world.walkableCells.length === 0) {
    return [];
  }

  if (isInitialHydration) {
    return createInitialWanderStates(villagers, world);
  }

  const villagerMap = new Map(villagers.map((v) => [v.id, v]));
  const keptPrev = prevStates.filter((s) => villagerMap.has(s.villagerId));
  const revalidated = revalidateWanderStates(keptPrev, world);
  const existingIds = new Set(revalidated.map((s) => s.villagerId));
  const takenKeys = new Set(revalidated.map((s) => coordKey(s.cell)));

  const sortedAll = sortVillagersStable(villagers);
  const additions: VillagerWanderState[] = [];

  for (const v of sortedAll) {
    if (existingIds.has(v.id)) continue;
    const spawnCell = getSpawnCell(world.cave, world, takenKeys);
    if (!spawnCell) continue;
    takenKeys.add(coordKey(spawnCell));
    additions.push({
      villagerId: v.id,
      role: v.role,
      recruitedAt: v.recruitedAt,
      cell: spawnCell,
      facing: 'right',
      animation: 'idle',
      waitTicks: 0,
      path: [],
    });
  }

  return [...revalidated, ...additions].sort(
    (a, b) => a.recruitedAt - b.recruitedAt || a.villagerId.localeCompare(b.villagerId)
  );
}

/**
 * Sets all active villager animations to 'idle' while preserving their exact cell & path
 * (used when hidden or paused during expansion / camera lock).
 */
export function pauseWanderStates(
  states: readonly VillagerWanderState[]
): readonly VillagerWanderState[] {
  let anyWalking = false;
  for (const s of states) {
    if (s.animation !== 'idle') {
      anyWalking = true;
      break;
    }
  }
  if (!anyWalking) return states;
  return states.map((s) => (s.animation === 'idle' ? s : { ...s, animation: 'idle' }));
}

interface BfsNode {
  readonly cell: GridCoordinate;
  readonly depth: number;
  readonly parentKey: string | null;
}

function runBoundedBfs(
  start: GridCoordinate,
  world: WanderWorld,
  blockedKeys: ReadonlySet<string>,
  maxDepth: number,
  rng: () => number
): Map<string, BfsNode> {
  const startKey = coordKey(start);
  const visited = new Map<string, BfsNode>();
  visited.set(startKey, { cell: start, depth: 0, parentKey: null });

  const queue: BfsNode[] = [{ cell: start, depth: 0, parentKey: null }];
  let head = 0;

  // Deterministic shuffled cardinal order avoids rigid straight-line L-patrols
  const dirs = [...CARDINAL_DELTAS];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = dirs[i];
    dirs[i] = dirs[j];
    dirs[j] = tmp;
  }

  while (head < queue.length) {
    const current = queue[head++];
    if (current.depth >= maxDepth) continue;

    const currentKey = coordKey(current.cell);
    for (const [dx, dy] of dirs) {
      const nx = current.cell.x + dx;
      const ny = current.cell.y + dy;
      const nKey = `${nx},${ny}`;
      if (visited.has(nKey)) continue;
      if (!world.walkableSet.has(nKey)) continue;
      if (blockedKeys.has(nKey)) continue;

      const node: BfsNode = {
        cell: { x: nx, y: ny },
        depth: current.depth + 1,
        parentKey: currentKey,
      };
      visited.set(nKey, node);
      queue.push(node);
    }
  }

  return visited;
}

function reconstructPath(
  targetKey: string,
  visited: ReadonlyMap<string, BfsNode>,
  maxSteps: number
): GridCoordinate[] {
  const reversed: GridCoordinate[] = [];
  let cursor = visited.get(targetKey);
  while (cursor && cursor.parentKey !== null) {
    reversed.push(cursor.cell);
    cursor = visited.get(cursor.parentKey);
  }
  reversed.reverse();
  return reversed.slice(0, maxSteps);
}

function pickWeightedIndex(weights: readonly number[], rng: () => number): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function planNextPath(
  origin: GridCoordinate,
  world: WanderWorld,
  blockedKeys: ReadonlySet<string>,
  rng: () => number
): GridCoordinate[] {
  const localVisited = runBoundedBfs(origin, world, blockedKeys, MAX_WANDER_PATH_STEPS, rng);
  const startKey = coordKey(origin);

  const reachableAttractors = world.attractors.filter((a) => {
    const k = coordKey(a.cell);
    return k !== startKey && localVisited.has(k);
  });

  // 70% bias toward weighted attractors (fallback to wider BFS if distant on large map)
  const useAttractor = rng() < ATTRACTOR_PICK_PROBABILITY;
  if (useAttractor) {
    if (reachableAttractors.length > 0) {
      const idx = pickWeightedIndex(
        reachableAttractors.map((a) => a.weight),
        rng
      );
      return reconstructPath(
        coordKey(reachableAttractors[idx].cell),
        localVisited,
        MAX_WANDER_PATH_STEPS
      );
    }

    if (world.attractors.length > 0) {
      const wideVisited = runBoundedBfs(origin, world, blockedKeys, MAX_WANDER_PATH_STEPS * 2, rng);
      const wideAttractors = world.attractors.filter((a) => {
        const k = coordKey(a.cell);
        return k !== startKey && wideVisited.has(k);
      });
      if (wideAttractors.length > 0) {
        const idx = pickWeightedIndex(
          wideAttractors.map((a) => a.weight),
          rng
        );
        return reconstructPath(
          coordKey(wideAttractors[idx].cell),
          wideVisited,
          MAX_WANDER_PATH_STEPS
        );
      }
    }
  }

  // Otherwise pick a random reachable walkable cell (prefer cells 1..8 steps away)
  const candidateKeys: string[] = [];
  for (const [k, node] of localVisited.entries()) {
    if (k !== startKey && node.depth >= 1) {
      candidateKeys.push(k);
    }
  }
  if (candidateKeys.length === 0) return [];

  const chosenKey = candidateKeys[Math.floor(rng() * candidateKeys.length)];
  return reconstructPath(chosenKey, localVisited, MAX_WANDER_PATH_STEPS);
}

/**
 * Advances every villager by one deterministic tick (~700ms).
 * Invariants guaranteed by construction:
 * - Zero steps onto building footprints or locked/forest cells.
 * - Zero duplicate coordinates across all villagers on every tick.
 * - Alternates walking and idling cleanly.
 */
export function stepWander(
  states: readonly VillagerWanderState[],
  world: WanderWorld,
  tick: number
): readonly VillagerWanderState[] {
  if (states.length === 0 || world.walkableCells.length === 0) {
    return [];
  }

  const sorted = [...states].sort(
    (a, b) => a.recruitedAt - b.recruitedAt || a.villagerId.localeCompare(b.villagerId)
  );

  // Track cells reserved for this tick's output and cells occupied by not-yet-stepped villagers
  const reservedNextKeys = new Set<string>();
  const pendingCurrentKeys = new Set<string>(sorted.map((s) => coordKey(s.cell)));
  const nextStates: VillagerWanderState[] = [];

  for (const state of sorted) {
    const prevKey = coordKey(state.cell);
    pendingCurrentKeys.delete(prevKey);

    const occupiedByOthers = new Set<string>([...reservedNextKeys, ...pendingCurrentKeys]);

    // Safety guard if state entered stepWander on an invalidated cell
    if (!world.walkableSet.has(prevKey) || reservedNextKeys.has(prevKey)) {
      const safeCell = findNearestFreeWalkableCell(state.cell, world, occupiedByOthers);
      if (!safeCell) continue;
      reservedNextKeys.add(coordKey(safeCell));
      nextStates.push({
        ...state,
        cell: safeCell,
        animation: 'idle',
        waitTicks: 1,
        path: [],
      });
      continue;
    }

    const rng = createVillagerTickRng(state.villagerId, tick);

    if (state.waitTicks > 0) {
      reservedNextKeys.add(prevKey);
      nextStates.push({
        ...state,
        animation: 'idle',
        waitTicks: state.waitTicks - 1,
      });
      continue;
    }

    let activePath = state.path;
    if (activePath.length === 0) {
      activePath = planNextPath(state.cell, world, occupiedByOthers, rng);
    }

    if (activePath.length === 0) {
      reservedNextKeys.add(prevKey);
      nextStates.push({
        ...state,
        animation: 'idle',
        waitTicks: randomInt(rng, 2, 4),
        path: [],
      });
      continue;
    }

    const nextStep = activePath[0];
    const nextStepKey = coordKey(nextStep);
    const isStepClear =
      world.walkableSet.has(nextStepKey) &&
      !occupiedByOthers.has(nextStepKey) &&
      manhattanDistance(state.cell, nextStep) === 1;

    if (!isStepClear) {
      // Blocked dynamically by another villager; pause briefly and clear stale path
      reservedNextKeys.add(prevKey);
      nextStates.push({
        ...state,
        animation: 'idle',
        waitTicks: randomInt(rng, 1, 2),
        path: [],
      });
      continue;
    }

    const remainingPath = activePath.slice(1);
    const nextFacing = getNextHorizontalFacing(state.cell, nextStep, state.facing);
    const nextAnim = getWalkAnimation(state.cell, nextStep, state.facing);
    const reachedGoal = remainingPath.length === 0;

    let nextWait = 0;
    if (reachedGoal) {
      const attractorAtGoal = world.attractors.find((a) => coordKey(a.cell) === nextStepKey);
      nextWait =
        attractorAtGoal && attractorAtGoal.weight >= 10
          ? randomInt(rng, 3, 7)
          : randomInt(rng, 2, 5);
    }

    reservedNextKeys.add(nextStepKey);
    nextStates.push({
      ...state,
      cell: nextStep,
      facing: nextFacing,
      animation: nextAnim,
      waitTicks: nextWait,
      path: remainingPath,
    });
  }

  return nextStates;
}
