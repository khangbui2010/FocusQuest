/**
 * Pure deterministic FocusSceneArea model for Milestone Villager V4.
 *
 * Zero wall-clock queries, zero non-deterministic RNG, zero storage I/O.
 * Maps CivilizationState -> unique deduplicated building slots & up to 6
 * seeded villager routes across 'working', 'paused', and 'resting'.
 */

import { BuildingInstance } from '../../core/civilization/buildingTypes.ts';
import { CivilizationState } from '../../core/civilization/civilizationState.ts';
import {
  Villager,
  VILLAGE_CAVE_DEFINITION_ID,
  getEffectiveVillagersForDisplay,
} from '../../core/civilization/villager.ts';
import { isBuildingUnderConstruction } from '../../core/civilization/jobs.ts';
import { VillagerAnimationName, VillagerRole, isVillagerRole } from '../components/civilization/spriteRegistry.ts';
import { STONE_AGE_SPRITE_DATA } from '../components/civilization/spriteData.ts';
import type { ToolKind } from '../components/civilization/constructionTools.ts';

export type SceneFocusState = 'working' | 'paused' | 'resting';

export const SCENE_STAGE_WIDTH_PX = 336;
export const SCENE_STAGE_HEIGHT_PX = 120;
export const MAX_SCENE_VILLAGERS = 6;
export const SCENE_WANDER_TICK_MS = 1200;

export const SCENE_WALK_MIN_X = 46;
export const SCENE_WALK_MAX_X = 264;
export const SCENE_VILLAGER_SIZE_PX = 32;

export interface SceneBuildingSlot {
  readonly definitionId: string;
  readonly leftPx: number;
  readonly bottomPx: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
}

/**
 * Fixed non-overlapping visual slots for all 6 Stone Age buildings inside the 336×120 stage.
 * Horizontal bands are strictly disjoint:
 * - Study Cave:     46..94   (48×48)
 * - Elder's Hut:     96..132 (36×36)
 * - Standing Stone:  133..153 (20×20)
 * - Campfire:        154..186 (32×32)
 * - Foraging Post:  190..226 (36×36)
 * - Primitive Granary: 232..264 (32×48)
 */
export const SCENE_BUILDING_SLOTS: Readonly<Record<string, SceneBuildingSlot>> = Object.freeze({
  stone_age_study_cave: {
    definitionId: 'stone_age_study_cave',
    leftPx: 46,
    bottomPx: 18,
    width: 48,
    height: 48,
    zIndex: 2,
  },
  stone_age_elder_hut: {
    definitionId: 'stone_age_elder_hut',
    leftPx: 96,
    bottomPx: 20,
    width: 36,
    height: 36,
    zIndex: 2,
  },
  stone_age_foraging_post: {
    definitionId: 'stone_age_foraging_post',
    leftPx: 190,
    bottomPx: 20,
    width: 36,
    height: 36,
    zIndex: 2,
  },
  stone_age_food_cache: {
    definitionId: 'stone_age_food_cache',
    leftPx: 232,
    bottomPx: 18,
    width: 32,
    height: 48,
    zIndex: 2,
  },
  stone_age_totem: {
    definitionId: 'stone_age_totem',
    leftPx: 133,
    bottomPx: 16,
    width: 20,
    height: 20,
    zIndex: 3,
  },
  stone_age_campfire: {
    definitionId: 'stone_age_campfire',
    leftPx: 154,
    bottomPx: 10,
    width: 32,
    height: 32,
    zIndex: 4,
  },
});

export interface SceneBuilding {
  readonly definitionId: string;
  readonly count: number;
  readonly leftPx: number;
  readonly bottomPx: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly centerXPx: number;
}

export interface SceneVillager {
  readonly id: string;
  readonly role: VillagerRole;
  readonly recruitedAt: number;
  readonly index: number;
  readonly homeXPx: number;
  readonly restXPx: number;
  readonly bottomPx: number;
}

export interface FocusSceneModel {
  readonly buildings: readonly SceneBuilding[];
  readonly villagers: readonly SceneVillager[];
  readonly hasCampfire: boolean;
  readonly hasCave: boolean;
  readonly hasElder: boolean;
  readonly isEmpty: boolean;
}

export interface SceneVillagerPose {
  readonly id: string;
  readonly role: VillagerRole;
  readonly xPx: number;
  readonly bottomPx: number;
  readonly isMoving: boolean;
  readonly facing: 'left' | 'right';
  readonly animation: VillagerAnimationName;
  readonly showTool: boolean;
  readonly toolKind?: ToolKind;
  readonly toolTileIndex?: number;
  readonly toolSide?: 'left' | 'right';
  readonly showRestZzz: boolean;
}

/**
 * Deterministic 32-bit FNV-1a string hash (mirrors villagerWander.ts).
 */
export function hashSceneSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampWalkX(x: number): number {
  return Math.max(SCENE_WALK_MIN_X, Math.min(SCENE_WALK_MAX_X, Math.round(x)));
}

function getSlotCenterX(slot: SceneBuildingSlot): number {
  return Math.round(slot.leftPx + slot.width / 2 - SCENE_VILLAGER_SIZE_PX / 2);
}

/**
 * Resolves preferred horizontal anchor X for a villager role during 'working'.
 * Prioritizes role-relevant buildings if built, then Campfire, then Cave, then spread across clearing.
 */
function resolveWorkingAnchorX(
  role: VillagerRole,
  builtIds: ReadonlySet<string>,
  index: number,
  total: number
): number {
  const spreadOffset = (index - (total - 1) / 2) * 18;
  const fallbackSpread = clampWalkX(100 + index * 34);

  if (role === 'elder') {
    if (builtIds.has('stone_age_elder_hut')) {
      return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_elder_hut) + spreadOffset * 0.5);
    }
    if (builtIds.has('stone_age_totem')) {
      return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_totem) + spreadOffset * 0.4);
    }
    if (builtIds.has(VILLAGE_CAVE_DEFINITION_ID)) {
      return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_study_cave) + 8 + spreadOffset * 0.4);
    }
    if (builtIds.has('stone_age_campfire')) {
      return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_campfire) - 26 + spreadOffset * 0.4);
    }
    return fallbackSpread;
  }

  if (role === 'crafter') {
    if (builtIds.has('stone_age_campfire')) {
      return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_campfire) - 20 + spreadOffset * 0.6);
    }
    if (builtIds.has('stone_age_foraging_post')) {
      return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_foraging_post) + spreadOffset * 0.5);
    }
    if (builtIds.has(VILLAGE_CAVE_DEFINITION_ID)) {
      return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_study_cave) + 18 + spreadOffset * 0.5);
    }
    return fallbackSpread;
  }

  // woodworker
  if (builtIds.has('stone_age_foraging_post')) {
    return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_foraging_post) + spreadOffset * 0.6);
  }
  if (builtIds.has('stone_age_food_cache')) {
    return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_food_cache) + spreadOffset * 0.5);
  }
  if (builtIds.has('stone_age_campfire')) {
    return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_campfire) + 26 + spreadOffset * 0.6);
  }
  if (builtIds.has(VILLAGE_CAVE_DEFINITION_ID)) {
    return clampWalkX(getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_study_cave) + 26 + spreadOffset * 0.5);
  }
  return fallbackSpread;
}

const REST_CAMPFIRE_OFFSETS = [-36, 34, -58, 56, -20, 18] as const;
const REST_CAVE_OFFSETS = [-8, 22, 46, -24, 70, 94] as const;
const REST_CLEARING_SLOTS = [126, 162, 92, 198, 66, 228] as const;

function resolveRestingAnchorX(
  builtIds: ReadonlySet<string>,
  index: number
): number {
  const safeIdx = Math.max(0, Math.min(MAX_SCENE_VILLAGERS - 1, index));

  if (builtIds.has('stone_age_campfire')) {
    const center = getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_campfire);
    return clampWalkX(center + REST_CAMPFIRE_OFFSETS[safeIdx]);
  }
  if (builtIds.has(VILLAGE_CAVE_DEFINITION_ID)) {
    const center = getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_study_cave);
    return clampWalkX(center + REST_CAVE_OFFSETS[safeIdx]);
  }
  return clampWalkX(REST_CLEARING_SLOTS[safeIdx]);
}

function isValidBuildingInstance(b: unknown): b is BuildingInstance {
  return (
    typeof b === 'object' &&
    b !== null &&
    typeof (b as BuildingInstance).definitionId === 'string' &&
    (b as BuildingInstance).definitionId.length > 0
  );
}

function isValidVillagerInstance(v: unknown): v is Villager {
  if (typeof v !== 'object' || v === null) return false;
  const candidate = v as Villager;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    isVillagerRole(candidate.role) &&
    typeof candidate.recruitedAt === 'number' &&
    Number.isFinite(candidate.recruitedAt)
  );
}

/**
 * Pure builder converting CivilizationState (or null/undefined/partial) into
 * deduplicated SceneBuildings (at most 1 per definitionId) and capped SceneVillagers (max 6).
 */
export function buildFocusSceneModel(
  civilizationState?: Partial<CivilizationState> | null
): FocusSceneModel {
  const rawBuildings = Array.isArray(civilizationState?.buildings)
    ? civilizationState!.buildings
    : [];
  const rawVillagers = Array.isArray(civilizationState?.villagers)
    ? civilizationState!.villagers
    : [];

  const rawJobs = Array.isArray(civilizationState?.jobs)
    ? civilizationState!.jobs
    : [];

  // Deduplicate active buildings: exclude buildings still UNDER_CONSTRUCTION ('place' job)
  const countsByDef = new Map<string, number>();
  for (const item of rawBuildings) {
    if (!isValidBuildingInstance(item)) continue;
    if (isBuildingUnderConstruction(item.id, rawJobs)) continue;
    const defId = item.definitionId;
    if (!SCENE_BUILDING_SLOTS[defId] || !STONE_AGE_SPRITE_DATA[defId]) continue;
    countsByDef.set(defId, (countsByDef.get(defId) ?? 0) + 1);
  }

  const buildings: SceneBuilding[] = Object.values(SCENE_BUILDING_SLOTS)
    .filter((slot) => countsByDef.has(slot.definitionId))
    .map((slot) => ({
      definitionId: slot.definitionId,
      count: countsByDef.get(slot.definitionId) ?? 1,
      leftPx: slot.leftPx,
      bottomPx: slot.bottomPx,
      width: slot.width,
      height: slot.height,
      zIndex: slot.zIndex,
      centerXPx: Math.round(slot.leftPx + slot.width / 2),
    }))
    .sort((a, b) => a.zIndex - b.zIndex || a.leftPx - b.leftPx);

  const builtIds = new Set(buildings.map((b) => b.definitionId));

  // Include Founder Villager (if selected) and deterministically sort without mutating input, capped at 6
  const effectiveVillagers = getEffectiveVillagersForDisplay(
    rawVillagers,
    civilizationState?.founderRole
  );
  const validVillagers = effectiveVillagers
    .filter(isValidVillagerInstance)
    .sort((a, b) => a.recruitedAt - b.recruitedAt || a.id.localeCompare(b.id))
    .slice(0, MAX_SCENE_VILLAGERS);

  const villagers: SceneVillager[] = validVillagers.map((v, idx) => ({
    id: v.id,
    role: v.role,
    recruitedAt: v.recruitedAt,
    index: idx,
    homeXPx: resolveWorkingAnchorX(v.role, builtIds, idx, validVillagers.length),
    restXPx: resolveRestingAnchorX(builtIds, idx),
    bottomPx: idx % 2 === 0 ? 10 : 12,
  }));

  const hasCampfire = builtIds.has('stone_age_campfire');
  const hasCave = builtIds.has(VILLAGE_CAVE_DEFINITION_ID);
  const hasElder = villagers.some((v) => v.role === 'elder');

  return {
    buildings,
    villagers,
    hasCampfire,
    hasCave,
    hasElder,
    isEmpty: buildings.length === 0 && villagers.length === 0,
  };
}

/**
 * Deterministically computes a villager's X position for a specific tick in 'working' mode.
 * Patrol stays centered near the villager's home anchor (preferring built campfire/buildings)
 * and alternates idle pauses with short horizontal steps.
 */
function computeWorkingXAtTick(
  villager: SceneVillager,
  model: FocusSceneModel,
  tick: number
): number {
  const safeTick = Math.max(0, Math.floor(tick));
  if (safeTick === 0) {
    return villager.homeXPx;
  }

  // Pick a target goal every 4 ticks using villager seed + phase bucket
  const phase = Math.floor((safeTick - 1) / 4);
  const stepInPhase = (safeTick - 1) % 4; // 0..3

  // Compute starting position at end of previous phase recursively/iteratively (cheap since capped or localized)
  const rngPrev = phase === 0 ? null : createSeededRng(hashSceneSeed(`${villager.id}:w:${phase - 1}`));
  const prevX =
    phase === 0
      ? villager.homeXPx
      : computePhaseTargetX(villager, model, rngPrev!);

  const rngCurr = createSeededRng(hashSceneSeed(`${villager.id}:w:${phase}`));
  const targetX = computePhaseTargetX(villager, model, rngCurr);

  // First 2 ticks of phase move smoothly toward targetX; ticks 2-3 pause/work idle there!
  if (stepInPhase === 0) {
    return Math.round(prevX + (targetX - prevX) * 0.5);
  }
  return targetX;
}

function computePhaseTargetX(
  villager: SceneVillager,
  model: FocusSceneModel,
  rng: () => number
): number {
  const roll = rng();
  // ~40% chance to visit Campfire if built; otherwise linger around role's home station +/- 28px
  if (model.hasCampfire && roll < 0.4) {
    const fireCenter = getSlotCenterX(SCENE_BUILDING_SLOTS.stone_age_campfire);
    const sideOffset = (villager.index % 2 === 0 ? -1 : 1) * (18 + Math.round(rng() * 18));
    return clampWalkX(fireCenter + sideOffset);
  }
  const jitter = Math.round((rng() * 2 - 1) * 28);
  return clampWalkX(villager.homeXPx + jitter);
}

/**
 * Computes deterministic route, facing, animation, tool visibility, and rest zZ state
 * for one villager at a given scene tick. Pure & side-effect free.
 */
export function getSceneVillagerRoute(
  villager: SceneVillager,
  model: FocusSceneModel,
  sceneState: SceneFocusState,
  tick: number
): SceneVillagerPose {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;

  let xPx = villager.homeXPx;
  let prevXPx = villager.homeXPx;

  if (sceneState === 'paused') {
    xPx = villager.homeXPx;
    prevXPx = villager.homeXPx;
  } else if (sceneState === 'resting') {
    // At tick 0 render/resting entry, walk smoothly from homeXPx to restXPx on tick 1-2, then settle cleanly
    if (safeTick === 0) {
      xPx = villager.restXPx;
      prevXPx = villager.restXPx;
    } else {
      // Gentle occasional shifting around the fire/cave during long breaks
      const cycle = Math.floor((safeTick - 1) / 5);
      const stepInCycle = (safeTick - 1) % 5;
      const prevShift =
        cycle === 0
          ? 0
          : Math.round((createSeededRng(hashSceneSeed(`${villager.id}:r:${cycle - 1}`))() * 2 - 1) * 8);
      const nextShift = Math.round(
        (createSeededRng(hashSceneSeed(`${villager.id}:r:${cycle}`))() * 2 - 1) * 8
      );
      const prevRestX = clampWalkX(villager.restXPx + prevShift);
      const nextRestX = clampWalkX(villager.restXPx + nextShift);
      prevXPx = stepInCycle === 0 ? prevRestX : nextRestX;
      xPx = nextRestX;
    }
  } else {
    // working
    xPx = computeWorkingXAtTick(villager, model, safeTick);
    prevXPx = safeTick > 0 ? computeWorkingXAtTick(villager, model, safeTick - 1) : xPx;
  }

  const dx = xPx - prevXPx;
  const isMoving = sceneState !== 'paused' && safeTick > 0 && dx !== 0;

  const facing: 'left' | 'right' =
    dx > 0 ? 'right' : dx < 0 ? 'left' : villager.index % 2 === 0 ? 'right' : 'left';

  const animation: VillagerAnimationName = isMoving
    ? dx > 0
      ? 'walk_right'
      : 'walk_left'
    : 'idle';

  const showTool =
    sceneState === 'working' &&
    !isMoving &&
    (villager.role === 'crafter' || villager.role === 'woodworker');

  const toolTileIndex =
    showTool && villager.role === 'crafter'
      ? 117
      : showTool && villager.role === 'woodworker'
      ? 119
      : undefined;

  const toolKind: ToolKind | undefined =
    showTool && villager.role === 'crafter'
      ? 'hammer'
      : showTool && villager.role === 'woodworker'
      ? 'axe'
      : undefined;

  const toolSide =
    showTool && villager.role === 'crafter'
      ? 'right'
      : showTool && villager.role === 'woodworker'
      ? 'left'
      : undefined;

  const showRestZzz = sceneState === 'resting' && villager.role === 'elder';

  return {
    id: villager.id,
    role: villager.role,
    xPx,
    bottomPx: villager.bottomPx,
    isMoving,
    facing,
    animation,
    showTool,
    toolKind,
    toolTileIndex,
    toolSide,
    showRestZzz,
  };
}
