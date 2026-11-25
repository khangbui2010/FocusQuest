/**
 * Pure Civilization Construction Job & Auto-Crew Scheduling Engine.
 * Milestone 5E-1 (Stage A):
 * - Three Focus-based construction jobs: 'place', 'upgrade', 'expand'.
 * - Single centralized table of crew requirements and Focus second durations.
 * - Automatic FIFO crew scheduling (max 4 concurrent ACTIVE jobs).
 * - Continuous event-step simulation (`advanceJobs` / `projectJobs`) carrying leftover
 *   Focus seconds from completed jobs to newly freed / queued jobs within the same session.
 * - Strictly pure & deterministic: zero Date.now(), zero Math.random(), zero I/O.
 */

import { GridMap } from './gridMap.ts';
import { GridCoordinate, GridMapSnapshot } from './types.ts';
import { BuildingInstance } from './buildingTypes.ts';
import type { Villager } from './villager.ts';
import {
  VillagerRole,
  isVillagerRole,
} from '../../ui/components/civilization/spriteRegistry.ts';

export type ConstructionJobKind = 'place' | 'upgrade' | 'expand';
export type ConstructionJobStatus = 'ACTIVE' | 'PENDING';

export interface ConstructionJob {
  readonly id: string;
  readonly kind: ConstructionJobKind;
  readonly status: ConstructionJobStatus;
  readonly definitionId?: string;
  readonly buildingId?: string;
  readonly targetLevel?: number;
  readonly origin?: GridCoordinate;
  readonly purchaseIndex?: number;
  readonly crewRequired: number;
  readonly totalSeconds: number;
  readonly remainingSeconds: number;
  readonly paidCoins: number;
  readonly createdAt: number;
}

export interface JobSpec {
  readonly crew: number;
  readonly durationSeconds: number;
}

export const MAX_ACTIVE_CONSTRUCTION_JOBS = 4;

/**
 * Single centralized design table for placing Stone Age buildings (Section A2).
 * All durations are integer Focus seconds.
 */
export const CONSTRUCTION_PLACE_SPEC: Readonly<Record<string, JobSpec>> = Object.freeze({
  stone_age_campfire: Object.freeze({ crew: 0, durationSeconds: 0 }),
  stone_age_totem: Object.freeze({ crew: 1, durationSeconds: 3600 }),
  stone_age_study_cave: Object.freeze({ crew: 1, durationSeconds: 3600 }),
  stone_age_foraging_post: Object.freeze({ crew: 1, durationSeconds: 3600 }),
  stone_age_elder_hut: Object.freeze({ crew: 2, durationSeconds: 7200 }),
  stone_age_food_cache: Object.freeze({ crew: 2, durationSeconds: 7200 }),
});

/**
 * Single centralized design spec for clearing & expanding a 4x4 land chunk (Section A2).
 */
export const EXPAND_JOB_SPEC: JobSpec = Object.freeze({
  crew: 2,
  durationSeconds: 3600,
});

/**
 * Returns crew requirement & Focus second duration for placing `definitionId`.
 */
export function getPlaceJobSpec(definitionId: string): JobSpec {
  return CONSTRUCTION_PLACE_SPEC[definitionId] ?? { crew: 1, durationSeconds: 3600 };
}

/**
 * Single centralized design rule for upgrading L -> L+1 (L in 1..4) (Section A2):
 * - Crew: 1 if L <= 2, else 2.
 * - Duration: 5 * L minutes (300s, 600s, 900s, 1200s).
 */
export function getUpgradeJobSpec(currentLevel: number): JobSpec {
  const safeLevel =
    typeof currentLevel === 'number' && Number.isInteger(currentLevel) && currentLevel >= 1
      ? currentLevel
      : 1;
  return {
    crew: safeLevel <= 2 ? 1 : 2,
    durationSeconds: 5 * safeLevel * 60,
  };
}

/**
 * Computes total available villagers including permanent Founder villager (if chosen).
 */
export function getTotalVillagerCount(
  villagers?: readonly Pick<Villager, 'role'>[] | null,
  founderRole?: VillagerRole | null
): number {
  const recruitedCount = Array.isArray(villagers) ? villagers.length : 0;
  const founderCount = founderRole && isVillagerRole(founderRole) ? 1 : 0;
  return recruitedCount + founderCount;
}

/**
 * Checks whether a placed building instance currently has a pending/active 'place' job
 * (i.e. it is UNDER_CONSTRUCTION and gives 0 effect).
 */
export function isBuildingUnderConstruction(
  buildingId: string,
  jobs?: readonly ConstructionJob[] | null
): boolean {
  if (!Array.isArray(jobs) || !buildingId) {
    return false;
  }
  return jobs.some((job) => job.kind === 'place' && job.buildingId === buildingId);
}

/**
 * Retrieves the 'place' job for a building if it is currently under construction.
 */
export function getPlaceJobForBuilding(
  buildingId: string,
  jobs?: readonly ConstructionJob[] | null
): ConstructionJob | undefined {
  if (!Array.isArray(jobs) || !buildingId) {
    return undefined;
  }
  return jobs.find((job) => job.kind === 'place' && job.buildingId === buildingId);
}

/**
 * Retrieves all queued ('ACTIVE' | 'PENDING') upgrade jobs targeting `buildingId`,
 * sorted by ascending `targetLevel`.
 */
export function getUpgradeJobsForBuilding(
  buildingId: string,
  jobs?: readonly ConstructionJob[] | null
): readonly ConstructionJob[] {
  if (!Array.isArray(jobs) || !buildingId) {
    return [];
  }
  return jobs
    .filter((job) => job.kind === 'upgrade' && job.buildingId === buildingId)
    .sort((a, b) => (a.targetLevel ?? 0) - (b.targetLevel ?? 0));
}

/**
 * Returns the highest queued targetLevel for `instance`, or `instance.level` if none.
 */
export function getEffectiveTargetLevel(
  instance: Pick<BuildingInstance, 'id' | 'level'>,
  jobs?: readonly ConstructionJob[] | null
): number {
  let maxTarget = instance.level;
  if (!Array.isArray(jobs)) {
    return maxTarget;
  }
  for (const job of jobs) {
    if (
      job.kind === 'upgrade' &&
      job.buildingId === instance.id &&
      typeof job.targetLevel === 'number' &&
      Number.isInteger(job.targetLevel) &&
      job.targetLevel > maxTarget
    ) {
      maxTarget = job.targetLevel;
    }
  }
  return maxTarget;
}

/**
 * Checks whether a 4x4 chunk origin currently has a pending/active 'expand' clearing job.
 */
export function isChunkClearing(
  origin: GridCoordinate,
  jobs?: readonly ConstructionJob[] | null
): boolean {
  return getExpandJobAtOrigin(origin, jobs) !== undefined;
}

/**
 * Returns the 'expand' clearing job matching `origin`, if any.
 */
export function getExpandJobAtOrigin(
  origin: GridCoordinate,
  jobs?: readonly ConstructionJob[] | null
): ConstructionJob | undefined {
  if (!Array.isArray(jobs)) {
    return undefined;
  }
  return jobs.find(
    (job) =>
      job.kind === 'expand' &&
      job.origin !== undefined &&
      job.origin.x === origin.x &&
      job.origin.y === origin.y
  );
}

/**
 * Lists all chunk origins currently being cleared ('expand' jobs).
 */
export function getClearingOrigins(
  jobs?: readonly ConstructionJob[] | null
): readonly GridCoordinate[] {
  if (!Array.isArray(jobs)) {
    return [];
  }
  const origins: GridCoordinate[] = [];
  for (const job of jobs) {
    if (job.kind === 'expand' && job.origin) {
      origins.push({ x: job.origin.x, y: job.origin.y });
    }
  }
  return origins;
}

export interface CrewSummary {
  readonly totalCrew: number;
  readonly busyCrew: number;
  readonly freeCrew: number;
  readonly activeCount: number;
  readonly pendingCount: number;
}

/**
 * Computes current active/pending job counts and crew usage.
 */
export function getCrewSummary(
  jobs?: readonly ConstructionJob[] | null,
  villagers?: readonly Pick<Villager, 'role'>[] | null,
  founderRole?: VillagerRole | null
): CrewSummary {
  const totalCrew = getTotalVillagerCount(villagers, founderRole);
  let busyCrew = 0;
  let activeCount = 0;
  let pendingCount = 0;

  if (Array.isArray(jobs)) {
    for (const job of jobs) {
      if (job.status === 'ACTIVE') {
        activeCount += 1;
        busyCrew += Math.max(0, job.crewRequired);
      } else {
        pendingCount += 1;
      }
    }
  }

  return {
    totalCrew,
    busyCrew,
    freeCrew: Math.max(0, totalCrew - busyCrew),
    activeCount,
    pendingCount,
  };
}

export interface AssignJobsFifoResult {
  readonly jobs: readonly ConstructionJob[];
  readonly totalCrew: number;
  readonly busyCrew: number;
  readonly freeCrew: number;
  readonly activeCount: number;
}

/**
 * Determines the lowest remaining upgrade targetLevel per buildingId among incomplete upgrade jobs.
 * Ensures sequential serialization of queued upgrades targeting the same building.
 */
function buildLowestUpgradeTargetMap(jobs: readonly ConstructionJob[]): Map<string, number> {
  const lowestByBuilding = new Map<string, number>();
  for (const job of jobs) {
    if (job.kind === 'upgrade' && job.buildingId && typeof job.targetLevel === 'number') {
      const existing = lowestByBuilding.get(job.buildingId);
      if (existing === undefined || job.targetLevel < existing) {
        lowestByBuilding.set(job.buildingId, job.targetLevel);
      }
    }
  }
  return lowestByBuilding;
}

export interface JobScheduleOptions {
  readonly priorityJobIds?: readonly string[];
  readonly autoContinue?: boolean;
}

/**
 * Pure FIFO auto-crew scheduler (Section A5):
 * - Maximum MAX_ACTIVE_CONSTRUCTION_JOBS (4) concurrent ACTIVE jobs.
 * - Sum of ACTIVE crewRequired <= totalVillagers.
 * - Same-building 'upgrade' jobs run strictly sequentially in ascending targetLevel order.
 * - Preserves already-ACTIVE valid jobs; promotes PENDING jobs in FIFO array order
 *   whenever active slots (<4) and free crew allow.
 */
export function assignJobsFifo(
  jobs: readonly ConstructionJob[],
  totalVillagers: number
): AssignJobsFifoResult {
  const totalCrew =
    typeof totalVillagers === 'number' && Number.isFinite(totalVillagers) && totalVillagers > 0
      ? Math.floor(totalVillagers)
      : 0;

  if (!Array.isArray(jobs) || jobs.length === 0) {
    return {
      jobs: [],
      totalCrew,
      busyCrew: 0,
      freeCrew: totalCrew,
      activeCount: 0,
    };
  }

  const lowestUpgradeTarget = buildLowestUpgradeTargetMap(jobs);
  const assignedStatuses: ConstructionJobStatus[] = jobs.map(() => 'PENDING');
  const activeUpgradeBuildingIds = new Set<string>();

  let activeCount = 0;
  let busyCrew = 0;

  // Pass 1: Keep already-ACTIVE jobs that still satisfy invariants
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job.status !== 'ACTIVE') {
      continue;
    }
    if (activeCount >= MAX_ACTIVE_CONSTRUCTION_JOBS) {
      continue;
    }
    if (busyCrew + job.crewRequired > totalCrew) {
      continue;
    }
    if (job.kind === 'upgrade' && job.buildingId) {
      const lowestTarget = lowestUpgradeTarget.get(job.buildingId);
      if (
        lowestTarget !== job.targetLevel ||
        activeUpgradeBuildingIds.has(job.buildingId)
      ) {
        continue;
      }
      activeUpgradeBuildingIds.add(job.buildingId);
    }
    assignedStatuses[i] = 'ACTIVE';
    activeCount += 1;
    busyCrew += job.crewRequired;
  }

  // Pass 2: Promote PENDING (and any demoted) jobs in strict FIFO order
  for (let i = 0; i < jobs.length; i += 1) {
    if (assignedStatuses[i] === 'ACTIVE') {
      continue;
    }
    if (activeCount >= MAX_ACTIVE_CONSTRUCTION_JOBS) {
      break;
    }
    const job = jobs[i];
    if (busyCrew + job.crewRequired > totalCrew) {
      continue;
    }
    if (job.kind === 'upgrade' && job.buildingId) {
      const lowestTarget = lowestUpgradeTarget.get(job.buildingId);
      if (
        lowestTarget !== job.targetLevel ||
        activeUpgradeBuildingIds.has(job.buildingId)
      ) {
        continue;
      }
      activeUpgradeBuildingIds.add(job.buildingId);
    }
    assignedStatuses[i] = 'ACTIVE';
    activeCount += 1;
    busyCrew += job.crewRequired;
  }

  const nextJobs = jobs.map((job, idx) =>
    job.status === assignedStatuses[idx]
      ? job
      : { ...job, status: assignedStatuses[idx] }
  );

  return {
    jobs: nextJobs,
    totalCrew,
    busyCrew,
    freeCrew: Math.max(0, totalCrew - busyCrew),
    activeCount,
  };
}

/**
 * Schedules construction jobs honoring optional pre-session priority ordering and
 * `autoContinue` flag:
 * - When `options?.priorityJobIds === undefined` and `options?.autoContinue !== false`,
 *   behaves identically to `assignJobsFifo`.
 * - When `priorityJobIds` is provided, activates valid jobs matching `priorityJobIds`
 *   in the requested order first (skipping any missing/completed/cancelled IDs safely),
 *   strictly honoring <= 4 active jobs, totalCrew limit, and same-building sequential upgrades.
 * - If `autoContinue !== false`, remaining capacity is filled in FIFO order; if `false`,
 *   unselected PENDING jobs wait until priority/active work finishes or manual next session.
 */
export function assignJobsWithSchedule(
  jobs: readonly ConstructionJob[],
  totalVillagers: number,
  options?: JobScheduleOptions
): AssignJobsFifoResult {
  if (
    !options ||
    (options.priorityJobIds === undefined && options.autoContinue !== false)
  ) {
    return assignJobsFifo(jobs, totalVillagers);
  }

  const totalCrew =
    typeof totalVillagers === 'number' && Number.isFinite(totalVillagers) && totalVillagers > 0
      ? Math.floor(totalVillagers)
      : 0;

  if (!Array.isArray(jobs) || jobs.length === 0) {
    return {
      jobs: [],
      totalCrew,
      busyCrew: 0,
      freeCrew: totalCrew,
      activeCount: 0,
    };
  }

  const autoContinue = options.autoContinue !== false;
  const lowestUpgradeTarget = buildLowestUpgradeTargetMap(jobs);
  const assignedStatuses: ConstructionJobStatus[] = jobs.map(() => 'PENDING');
  const activeUpgradeBuildingIds = new Set<string>();

  let activeCount = 0;
  let busyCrew = 0;

  const tryActivateAt = (idx: number): void => {
    if (idx < 0 || idx >= jobs.length || assignedStatuses[idx] === 'ACTIVE') {
      return;
    }
    if (activeCount >= MAX_ACTIVE_CONSTRUCTION_JOBS) {
      return;
    }
    const job = jobs[idx];
    if (busyCrew + job.crewRequired > totalCrew) {
      return;
    }
    if (job.kind === 'upgrade' && job.buildingId) {
      const lowestTarget = lowestUpgradeTarget.get(job.buildingId);
      if (
        lowestTarget !== job.targetLevel ||
        activeUpgradeBuildingIds.has(job.buildingId)
      ) {
        return;
      }
      activeUpgradeBuildingIds.add(job.buildingId);
    }
    assignedStatuses[idx] = 'ACTIVE';
    activeCount += 1;
    busyCrew += job.crewRequired;
  };

  if (options.priorityJobIds !== undefined) {
    const indexById = new Map<string, number>();
    jobs.forEach((job, idx) => indexById.set(job.id, idx));

    for (const rawId of options.priorityJobIds) {
      if (typeof rawId !== 'string') continue;
      const idx = indexById.get(rawId);
      if (idx !== undefined) {
        tryActivateAt(idx);
      }
    }

    if (autoContinue) {
      for (let i = 0; i < jobs.length; i += 1) {
        if (activeCount >= MAX_ACTIVE_CONSTRUCTION_JOBS) {
          break;
        }
        tryActivateAt(i);
      }
    }
  } else {
    // autoContinue === false without explicit priorityJobIds: preserve currently ACTIVE valid jobs only
    for (let i = 0; i < jobs.length; i += 1) {
      if (jobs[i].status === 'ACTIVE') {
        tryActivateAt(i);
      }
    }
  }

  const nextJobs = jobs.map((job, idx) =>
    job.status === assignedStatuses[idx]
      ? job
      : { ...job, status: assignedStatuses[idx] }
  );

  return {
    jobs: nextJobs,
    totalCrew,
    busyCrew,
    freeCrew: Math.max(0, totalCrew - busyCrew),
    activeCount,
  };
}

export type SessionJobAssignmentErrorCode =
  | 'SESSION_INVALID_JOB_ASSIGNMENT'
  | 'SESSION_JOB_NOT_FOUND'
  | 'SESSION_JOB_DUPLICATE'
  | 'SESSION_JOB_TOO_MANY'
  | 'SESSION_JOB_INSUFFICIENT_CREW'
  | 'SESSION_JOB_UPGRADE_ORDER';

export interface SessionJobAssignmentValidationResult {
  readonly valid: boolean;
  readonly errorCode?: SessionJobAssignmentErrorCode;
  readonly errorMessage?: string;
  readonly errorParams?: Record<string, string | number>;
  readonly totalAssignedCrew: number;
  readonly totalCrew: number;
}

/**
 * Validates explicit pre-session `assignedJobIds` selection against the live CivilizationState.
 * Used atomically inside `SessionCoordinator.startSession` under mutex lock and in simulator.
 */
export function validateSessionJobAssignment(params: {
  readonly jobs?: readonly ConstructionJob[] | null;
  readonly villagers?: readonly Pick<Villager, 'role'>[] | null;
  readonly founderRole?: VillagerRole | null;
  readonly assignedJobIds?: readonly string[];
}): SessionJobAssignmentValidationResult {
  const jobs = Array.isArray(params.jobs) ? params.jobs : [];
  const totalCrew = getTotalVillagerCount(params.villagers, params.founderRole);

  if (params.assignedJobIds === undefined) {
    return { valid: true, totalAssignedCrew: 0, totalCrew };
  }

  if (!Array.isArray(params.assignedJobIds)) {
    return {
      valid: false,
      errorCode: 'SESSION_INVALID_JOB_ASSIGNMENT',
      errorMessage: 'assignedJobIds must be an array of job IDs.',
      totalAssignedCrew: 0,
      totalCrew,
    };
  }

  if (params.assignedJobIds.length > MAX_ACTIVE_CONSTRUCTION_JOBS) {
    return {
      valid: false,
      errorCode: 'SESSION_JOB_TOO_MANY',
      errorMessage: `At most ${MAX_ACTIVE_CONSTRUCTION_JOBS} concurrent jobs can be assigned.`,
      errorParams: { max: MAX_ACTIVE_CONSTRUCTION_JOBS, selected: params.assignedJobIds.length },
      totalAssignedCrew: 0,
      totalCrew,
    };
  }

  const jobById = new Map<string, ConstructionJob>();
  for (const job of jobs) {
    jobById.set(job.id, job);
  }

  const lowestUpgradeTarget = buildLowestUpgradeTargetMap(jobs);
  const seenIds = new Set<string>();
  const seenUpgradeBuildings = new Set<string>();
  let totalAssignedCrew = 0;

  for (const rawId of params.assignedJobIds) {
    if (typeof rawId !== 'string' || rawId.trim().length === 0) {
      return {
        valid: false,
        errorCode: 'SESSION_INVALID_JOB_ASSIGNMENT',
        errorMessage: 'Job ID must be a non-empty string.',
        totalAssignedCrew,
        totalCrew,
      };
    }

    if (seenIds.has(rawId)) {
      return {
        valid: false,
        errorCode: 'SESSION_JOB_DUPLICATE',
        errorMessage: `Duplicate job ID '${rawId}' in session job assignment.`,
        errorParams: { jobId: rawId },
        totalAssignedCrew,
        totalCrew,
      };
    }
    seenIds.add(rawId);

    const job = jobById.get(rawId);
    if (!job) {
      return {
        valid: false,
        errorCode: 'SESSION_JOB_NOT_FOUND',
        errorMessage: `Assigned job '${rawId}' no longer exists.`,
        errorParams: { jobId: rawId },
        totalAssignedCrew,
        totalCrew,
      };
    }

    if (job.kind === 'upgrade' && job.buildingId) {
      const lowestTarget = lowestUpgradeTarget.get(job.buildingId);
      if (
        seenUpgradeBuildings.has(job.buildingId) ||
        (lowestTarget !== undefined && job.targetLevel !== lowestTarget)
      ) {
        return {
          valid: false,
          errorCode: 'SESSION_JOB_UPGRADE_ORDER',
          errorMessage: `Upgrade job '${rawId}' must wait for lower-level upgrade on the same building.`,
          errorParams: { jobId: rawId, buildingId: job.buildingId },
          totalAssignedCrew,
          totalCrew,
        };
      }
      seenUpgradeBuildings.add(job.buildingId);
    }

    totalAssignedCrew += Math.max(0, job.crewRequired);
  }

  if (totalAssignedCrew > totalCrew) {
    return {
      valid: false,
      errorCode: 'SESSION_JOB_INSUFFICIENT_CREW',
      errorMessage: `Selected jobs require ${totalAssignedCrew} villagers, but only ${totalCrew} available.`,
      errorParams: { required: totalAssignedCrew, available: totalCrew },
      totalAssignedCrew,
      totalCrew,
    };
  }

  return {
    valid: true,
    totalAssignedCrew,
    totalCrew,
  };
}

export interface ActiveJobCrewAssignment {
  readonly job: ConstructionJob;
  readonly villagers: readonly Villager[];
}

export interface AssignVillagersToJobsResult {
  readonly assignments: readonly ActiveJobCrewAssignment[];
  readonly assignedVillagerIds: ReadonlySet<string>;
  readonly idleVillagers: readonly Villager[];
}

const FOUNDER_POOL_ID = 'founder_villager';

/**
 * Deterministically maps real villagers (Founder first if present, then recruited villagers
 * ordered by `(recruitedAt, id)`) onto currently ACTIVE jobs (`<= 4`), giving each job
 * `job.crewRequired` distinct villagers without duplicating any villager across scenes.
 */
export function assignVillagersToActiveJobs(
  jobs?: readonly ConstructionJob[] | null,
  villagers?: readonly Villager[] | null,
  founderRole?: VillagerRole | null
): AssignVillagersToJobsResult {
  const recruited = Array.isArray(villagers)
    ? [...villagers].sort((a, b) => a.recruitedAt - b.recruitedAt || a.id.localeCompare(b.id))
    : [];

  const pool: Villager[] = [];
  if (
    founderRole &&
    isVillagerRole(founderRole) &&
    !recruited.some((v) => v.id === FOUNDER_POOL_ID)
  ) {
    pool.push({ id: FOUNDER_POOL_ID, role: founderRole, recruitedAt: 0 });
  }
  pool.push(...recruited);

  const activeJobs = Array.isArray(jobs)
    ? jobs.filter((job) => job.status === 'ACTIVE').slice(0, MAX_ACTIVE_CONSTRUCTION_JOBS)
    : [];

  const assignments: ActiveJobCrewAssignment[] = [];
  const assignedVillagerIds = new Set<string>();
  let cursor = 0;

  for (const job of activeJobs) {
    const need = Math.max(0, Math.floor(job.crewRequired));
    const allocated: Villager[] = [];
    for (let k = 0; k < need && cursor < pool.length; k += 1) {
      const villager = pool[cursor];
      cursor += 1;
      allocated.push(villager);
      assignedVillagerIds.add(villager.id);
    }
    assignments.push({ job, villagers: allocated });
  }

  const idleVillagers = pool.filter((v) => !assignedVillagerIds.has(v.id));

  return {
    assignments,
    assignedVillagerIds,
    idleVillagers,
  };
}

export interface AdvanceableCivilizationState {
  readonly schemaVersion: number;
  readonly era: 'STONE_AGE' | 'BRONZE_AGE' | 'IRON_AGE' | 'MEDIEVAL' | 'EARLY_MODERN' | 'MODERN' | 'FUTURISTIC' | 'INTERPLANETARY';
  readonly grid: GridMapSnapshot;
  readonly buildings: readonly BuildingInstance[];
  readonly villagers?: readonly Villager[];
  readonly jobs?: readonly ConstructionJob[];
  readonly founderRole?: VillagerRole | null;
  readonly lastUpdated: number;
}

/**
 * Pure continuous event-step job simulation (Section A5 / A7 + Milestone 5E-2 scheduling):
 * Advances all ACTIVE jobs by `validSeconds` integer Focus seconds.
 * When any job finishes mid-session (`dt < timeLeft`), applies its completion effects
 * (`place` lifts construction state, `upgrade` applies `targetLevel`, `expand` unlocks chunk),
 * immediately runs `assignJobsWithSchedule`, and carries remaining Focus seconds to newly
 * promoted / priority jobs if `autoContinue !== false`.
 * Never reads Date.now() or Math.random() and never mutates input objects.
 */
export function advanceJobs<T extends AdvanceableCivilizationState>(
  civState: T,
  validSeconds: number,
  options?: JobScheduleOptions
): T {
  const initialJobs = Array.isArray(civState.jobs) ? civState.jobs : [];
  if (initialJobs.length === 0) {
    return civState;
  }

  const totalCrew = getTotalVillagerCount(civState.villagers, civState.founderRole);
  let timeLeft =
    typeof validSeconds === 'number' && Number.isFinite(validSeconds) && validSeconds > 0
      ? Math.floor(validSeconds)
      : 0;

  let workingJobs: readonly ConstructionJob[] = assignJobsWithSchedule(
    initialJobs,
    totalCrew,
    options
  ).jobs;
  if (timeLeft <= 0) {
    const unchanged =
      workingJobs.length === initialJobs.length &&
      workingJobs.every((j, i) => j === initialJobs[i]);
    return unchanged
      ? civState
      : {
          ...civState,
          jobs: workingJobs,
        };
  }

  const gridMap = GridMap.fromSnapshot(civState.grid);
  let workingBuildings: BuildingInstance[] = civState.buildings.map((b) => ({ ...b }));
  let gridModified = false;
  let buildingsModified = false;

  while (timeLeft > 0) {
    let minActiveRemaining = Number.POSITIVE_INFINITY;
    for (const job of workingJobs) {
      if (job.status === 'ACTIVE' && job.remainingSeconds > 0 && job.remainingSeconds < minActiveRemaining) {
        minActiveRemaining = job.remainingSeconds;
      }
    }

    if (!Number.isFinite(minActiveRemaining)) {
      break;
    }

    const dt = Math.min(timeLeft, minActiveRemaining);
    if (dt <= 0) {
      break;
    }
    timeLeft -= dt;

    const remainingJobs: ConstructionJob[] = [];

    for (const job of workingJobs) {
      if (job.status !== 'ACTIVE') {
        remainingJobs.push(job);
        continue;
      }

      const nextRemaining = Math.max(0, job.remainingSeconds - dt);
      if (nextRemaining > 0) {
        remainingJobs.push({
          ...job,
          remainingSeconds: nextRemaining,
        });
        continue;
      }

      // Job completed at this event step
      if (job.kind === 'upgrade' && job.buildingId && typeof job.targetLevel === 'number') {
        const idx = workingBuildings.findIndex((b) => b.id === job.buildingId);
        if (idx !== -1) {
          workingBuildings[idx] = {
            ...workingBuildings[idx],
            level: Math.max(workingBuildings[idx].level, job.targetLevel),
          };
          buildingsModified = true;
        }
      } else if (job.kind === 'expand' && job.origin) {
        const expRes = gridMap.expandChunk(job.origin);
        if (expRes.success) {
          gridModified = true;
        }
      }
      // For 'place', building instance is already at level 1 in `workingBuildings`;
      // removing the 'place' job activates its effects immediately.
    }

    workingJobs = assignJobsWithSchedule(remainingJobs, totalCrew, options).jobs;
  }

  return {
    ...civState,
    grid: gridModified ? gridMap.toSnapshot() : civState.grid,
    buildings: buildingsModified ? workingBuildings : civState.buildings,
    jobs: workingJobs,
  };
}

/**
 * Pure non-mutating live UI preview helper (Milestone 5E-1 Section B3 / 5E-2):
 * Projects job countdown & schedule transitions for `elapsedSeconds` of active Focus
 * without touching persistent storage or timestamps.
 */
export function projectJobs<T extends AdvanceableCivilizationState>(
  civState: T,
  elapsedSeconds: number,
  options?: JobScheduleOptions
): T {
  return advanceJobs(civState, elapsedSeconds, options);
}
