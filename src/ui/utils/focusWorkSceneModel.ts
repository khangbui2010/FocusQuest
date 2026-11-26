/**
 * Pure deterministic Focus Work Sub-Scene Model (Milestone 5E-2 Section 2).
 *
 * Pure deterministic model without wall-clock or RNG side effects, zero storage I/O.
 * Maps CivilizationState + active SessionSnapshot -> up to 4 active work sub-scenes
 * with distinct non-duplicated real villagers and construction/upgrade/clearing tools.
 */

import { CivilizationState } from '../../core/civilization/civilizationState.ts';
import { GridMap } from '../../core/civilization/gridMap.ts';
import {
  ConstructionJob,
  MAX_ACTIVE_CONSTRUCTION_JOBS,
  assignJobsWithSchedule,
  assignVillagersToActiveJobs,
  getTotalVillagerCount,
  projectJobs,
} from '../../core/civilization/jobs.ts';
import { Villager } from '../../core/civilization/villager.ts';
import { SessionSnapshot } from '../../types/session.ts';
import {
  ConstructionToolSpec,
  ToolKind,
  getConstructionToolKind,
  getConstructionToolSpec,
} from '../components/civilization/constructionTools.ts';
import {
  GridFootprint,
  getWorkSubjectFootprint,
} from '../components/civilization/civilizationScale.ts';
import { REUSED_TINY_TOWN_TILES } from '../components/civilization/spriteData.ts';
import { hashSceneSeed } from './focusSceneModel.ts';

export interface WorkCrewMemberPose {
  readonly villager: Villager;
  readonly side: 'left' | 'right';
  readonly facing: 'right' | 'left';
}

export interface WorkSubSceneModel {
  readonly job: ConstructionJob;
  readonly villagers: readonly Villager[];
  readonly members: readonly WorkCrewMemberPose[];
  readonly definitionId?: string;
  readonly subjectFootprint: GridFootprint;
  readonly expandTreeTile: number;
  readonly toolKind: ToolKind;
  readonly toolSpec: ConstructionToolSpec;
  readonly seed: number;
  readonly sunX: number;
  readonly hillShift: number;
  readonly treeTiles: readonly [number, number];
  readonly remainingSeconds: number;
  readonly totalSeconds: number;
}

export interface FocusWorkSceneBundle {
  readonly activeSubScenes: readonly WorkSubSceneModel[];
  readonly idleVillagers: readonly Villager[];
}

const BACKDROP_TREE_POOL: readonly number[] = [
  REUSED_TINY_TOWN_TILES.TREE_CONIFER_GREEN,
  REUSED_TINY_TOWN_TILES.TREE_ROUND_GREEN,
  REUSED_TINY_TOWN_TILES.TREE_PINE_GREEN,
  REUSED_TINY_TOWN_TILES.TREE_CONIFER_ORANGE,
  REUSED_TINY_TOWN_TILES.TREE_ROUND_ORANGE,
  REUSED_TINY_TOWN_TILES.TREE_PINE_ORANGE,
];

const EXPAND_SUBJECT_TREES: readonly number[] = [
  REUSED_TINY_TOWN_TILES.TREE_CONIFER_GREEN,
  REUSED_TINY_TOWN_TILES.TREE_ROUND_GREEN,
  REUSED_TINY_TOWN_TILES.TREE_PINE_GREEN,
];

/**
 * Computes CSS grid layout classes for 1..4 equal work sub-scenes inside FocusSceneArea.
 */
export function getWorkSceneGridClass(count: number): string {
  if (count <= 1) {
    return 'grid-cols-1 grid-rows-1';
  }
  if (count === 2) {
    return 'grid-cols-2 grid-rows-1';
  }
  if (count === 3) {
    return 'grid-cols-3 grid-rows-1';
  }
  return 'grid-cols-2 grid-rows-2';
}

export function buildWorkSubSceneModels(
  civState: Partial<CivilizationState> | null | undefined,
  options?: {
    readonly session?: SessionSnapshot | null;
    readonly liveFocusSeconds?: number;
    readonly alreadyProjected?: boolean;
  }
): FocusWorkSceneBundle {
  if (!civState || !Array.isArray(civState.jobs) || civState.jobs.length === 0) {
    return {
      activeSubScenes: [],
      idleVillagers: [],
    };
  }

  const session = options?.session ?? null;
  const scheduleOpts =
    session && (session.assignedJobIds !== undefined || session.autoContinueJobs !== undefined)
      ? {
          priorityJobIds: session.assignedJobIds,
          autoContinue: session.autoContinueJobs,
        }
      : undefined;

  const buildings = Array.isArray(civState.buildings) ? civState.buildings : [];
  const villagers = Array.isArray(civState.villagers) ? civState.villagers : [];
  const totalCrew = getTotalVillagerCount(villagers, civState.founderRole);

  let effectiveJobs: readonly ConstructionJob[];
  let effectiveBuildings = buildings;

  if (options?.alreadyProjected) {
    effectiveJobs = civState.jobs;
  } else if (civState.grid && typeof civState.schemaVersion === 'number') {
    const projected = projectJobs(
      {
        schemaVersion: civState.schemaVersion,
        era: civState.era ?? 'STONE_AGE',
        grid: civState.grid,
        buildings,
        villagers,
        jobs: civState.jobs,
        founderRole: civState.founderRole,
        lastUpdated: civState.lastUpdated ?? 0,
      },
      options?.liveFocusSeconds ?? 0,
      scheduleOpts
    );
    effectiveJobs = projected.jobs ?? [];
    effectiveBuildings = projected.buildings;
  } else if ((options?.liveFocusSeconds ?? 0) > 0) {
    // Fallback projection when partial state omits grid snapshot
    const fallbackGrid = new GridMap().toSnapshot();
    const projected = projectJobs(
      {
        schemaVersion: 3,
        era: civState.era ?? 'STONE_AGE',
        grid: fallbackGrid,
        buildings,
        villagers,
        jobs: civState.jobs,
        founderRole: civState.founderRole,
        lastUpdated: civState.lastUpdated ?? 0,
      },
      options?.liveFocusSeconds ?? 0,
      scheduleOpts
    );
    effectiveJobs = projected.jobs ?? [];
    effectiveBuildings = projected.buildings;
  } else {
    effectiveJobs = assignJobsWithSchedule(civState.jobs, totalCrew, scheduleOpts).jobs;
  }

  const { assignments, idleVillagers } = assignVillagersToActiveJobs(
    effectiveJobs,
    villagers,
    civState.founderRole
  );

  const activeSubScenes: WorkSubSceneModel[] = assignments
    .slice(0, MAX_ACTIVE_CONSTRUCTION_JOBS)
    .map(({ job, villagers: assigned }) => {
      const buildingDefId =
        job.definitionId ??
        (job.buildingId
          ? effectiveBuildings.find((b) => b.id === job.buildingId)?.definitionId
          : undefined);
      const seed = hashSceneSeed(job.id);
      const leftTree = BACKDROP_TREE_POOL[seed % BACKDROP_TREE_POOL.length];
      const rightTree = BACKDROP_TREE_POOL[(seed >> 4) % BACKDROP_TREE_POOL.length];
      const expandTreeTile = EXPAND_SUBJECT_TREES[seed % EXPAND_SUBJECT_TREES.length];
      const subjectFootprint = getWorkSubjectFootprint(job.kind, buildingDefId);

      const members: WorkCrewMemberPose[] = assigned.map((villager, idx) =>
        idx === 0
          ? { villager, side: 'left', facing: 'right' }
          : { villager, side: 'right', facing: 'left' }
      );

      return {
        job,
        villagers: assigned,
        members,
        definitionId: buildingDefId,
        subjectFootprint,
        expandTreeTile,
        toolKind: getConstructionToolKind(job.kind, buildingDefId),
        toolSpec: getConstructionToolSpec(job.kind, buildingDefId),
        seed,
        sunX: 118 + (seed % 34),
        hillShift: (seed % 14) - 7,
        treeTiles: [leftTree, rightTree],
        remainingSeconds: job.remainingSeconds,
        totalSeconds: job.totalSeconds,
      };
    });

  return {
    activeSubScenes,
    idleVillagers,
  };
}
