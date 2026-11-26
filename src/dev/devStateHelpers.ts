import {
  CivilizationState,
  createInitialCivilizationState,
  validateCivilizationState,
  sanitizeCivilizationState,
} from '../core/civilization/civilizationState.ts';
import { GridMap } from '../core/civilization/gridMap.ts';
import { getBuildingDefinition } from '../core/civilization/buildingCatalog.ts';
import { BuildingInstance, CivilizationEra } from '../core/civilization/buildingTypes.ts';
import { canPlaceAnotherBuildingOfCategory } from '../core/civilization/buildingUpgrade.ts';
import {
  STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
  evaluateEraAdvance,
  getEffectiveMaxLevel,
} from '../core/civilization/eraRules.ts';
import { INITIAL_CHUNK_COUNT } from '../core/civilization/constants.ts';
import {
  ConstructionJob,
  assignJobsFifo,
  getTotalVillagerCount,
} from '../core/civilization/jobs.ts';
import { GridCoordinate, BuildingFootprint } from '../core/civilization/types.ts';
import {
  VILLAGE_CAVE_DEFINITION_ID,
  Villager,
  findVillageCave,
  getVillagerCapacity,
} from '../core/civilization/villager.ts';
import {
  VILLAGER_ROLES,
  VillagerRole,
  isVillagerRole,
} from '../ui/components/civilization/spriteRegistry.ts';
import { calculatePlayerLevel } from '../core/economy/levelSystem.ts';
import { PlayerEconomy } from '../types/economy.ts';
import { DailyStatRecord } from '../types/storageSchema.ts';
import { QuestPeriod, QuestProgress, QuestState } from '../types/quests.ts';
import {
  createInitialQuestState,
  deriveDeterministicSalt,
  getActiveQuestDefinitions,
  rolloverQuestState,
  sanitizeQuestState,
  selectQuestsForPeriod,
} from '../core/quests/questEngine.ts';
import {
  addDaysToDateKey,
  calculateLifetimeFocusMinutes,
  isValidDateKey,
} from '../core/stats/statsAggregator.ts';
import { getLocalDateKey } from '../core/utils/dateUtils.ts';
import { getLocalWeekStartKeyFromDateKey } from '../core/quests/questDates.ts';
import { FocusProfile } from '../types/profiles.ts';
import { UserSettings } from '../types/storageSchema.ts';
import { AwardState } from '../types/awards.ts';
import { STONE_AGE_AWARDS_CATALOG } from '../core/awards/awardsCatalog.ts';
import { sanitizeAwardState } from '../core/awards/awardsState.ts';
import { isEraUnlocked } from '../core/civilization/buildingTypes.ts';
import {
  DEV_PRESET_IDS,
  DevExportBundle,
  DevPresetId,
  DevTimeSpeed,
} from './devTypes.ts';

export function isStrictFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidDevTimeSpeed(value: unknown): value is DevTimeSpeed {
  return value === 1 || value === 10 || value === 60 || value === 600;
}

export function isValidDevPresetId(value: unknown): value is DevPresetId {
  return typeof value === 'string' && (DEV_PRESET_IDS as readonly string[]).includes(value);
}

export function getMinimumXpForLevel(level: number): number {
  if (!isStrictFiniteNumber(level) || level < 1) {
    throw new Error('Invalid Player Level: expected finite number >= 1.');
  }
  const clamped = Math.max(1, Math.min(9999, Math.floor(level)));
  return ((clamped - 1) * clamped) / 2 * 100;
}

export function applyDevSetCoins(economy: PlayerEconomy, amount: number): PlayerEconomy {
  if (!isStrictFiniteNumber(amount) || amount < 0) {
    throw new Error('Invalid Coins amount: expected finite non-negative number.');
  }
  const safeAmount = Math.max(0, Math.min(999_999_999, Math.round(amount * 100) / 100));
  return {
    ...economy,
    focusCoins: safeAmount,
  };
}

export function applyDevSetLevel(economy: PlayerEconomy, level: number): PlayerEconomy {
  if (!isStrictFiniteNumber(level) || level < 1) {
    throw new Error('Invalid Player Level: expected finite number >= 1.');
  }
  const totalXP = getMinimumXpForLevel(level);
  return {
    ...economy,
    totalXP,
    level: calculatePlayerLevel(totalXP),
  };
}

export function applyDevSetTodayFocusMinutes(
  dailyStats: Record<string, DailyStatRecord>,
  minutes: number,
  nowMs: number = Date.now()
): Record<string, DailyStatRecord> {
  if (!isStrictFiniteNumber(minutes) || minutes < 0) {
    throw new Error('Invalid focus minutes: expected finite non-negative number.');
  }
  const safeNow = isStrictFiniteNumber(nowMs) ? nowMs : Date.now();
  const todayKey = getLocalDateKey(safeNow);
  const safeMinutes = Math.max(0, Math.min(1440, Math.floor(minutes)));
  const existing = dailyStats[todayKey] ?? {
    date: todayKey,
    totalFocusMinutes: 0,
    completedSessions: 0,
    abandonedSessions: 0,
    coinsEarned: 0,
    xpEarned: 0,
  };
  return {
    ...dailyStats,
    [todayKey]: {
      ...existing,
      date: todayKey,
      totalFocusMinutes: safeMinutes,
      completedSessions:
        safeMinutes > 0 ? Math.max(1, existing.completedSessions) : existing.completedSessions,
    },
  };
}

export function findFirstFreeFootprintSlot(
  gridMap: GridMap,
  footprint: BuildingFootprint
): GridCoordinate | null {
  const box = gridMap.getBoundingBox();
  for (let y = box.minY; y <= box.maxY - footprint.height + 1; y += 1) {
    for (let x = box.minX; x <= box.maxX - footprint.width + 1; x += 1) {
      if (gridMap.canPlaceBuilding({ x, y }, footprint).isValid) {
        return { x, y };
      }
    }
  }
  return null;
}

function removeExpandJobAtOrigin(
  jobs: readonly ConstructionJob[],
  origin: GridCoordinate
): ConstructionJob[] {
  return jobs.filter(
    (j) => !(j.kind === 'expand' && j.origin && j.origin.x === origin.x && j.origin.y === origin.y)
  );
}

function finalizeBuildingsAndJobs(
  civState: CivilizationState,
  gridMap: GridMap,
  buildings: BuildingInstance[],
  rawJobs: readonly ConstructionJob[],
  villagers: readonly Villager[],
  founderRole: VillagerRole | null | undefined,
  nowMs: number
): CivilizationState {
  const totalCrew = getTotalVillagerCount(villagers, founderRole);
  const scheduled = assignJobsFifo(rawJobs, totalCrew).jobs;
  const candidate: CivilizationState = {
    ...civState,
    grid: gridMap.toSnapshot(),
    buildings,
    villagers,
    founderRole: founderRole ?? null,
    jobs: scheduled,
    lastUpdated: nowMs,
  };
  const check = validateCivilizationState(candidate);
  if (!check.isValid) {
    throw new Error(`Invalid dev civilization transition: ${check.errors.join('; ')}`);
  }
  return candidate;
}

export function applyDevCompleteAllJobs(
  civState: CivilizationState,
  nowMs: number = Date.now()
): CivilizationState {
  const initialJobs = Array.isArray(civState.jobs) ? civState.jobs : [];
  if (initialJobs.length === 0) {
    return civState;
  }

  const gridMap = GridMap.fromSnapshot(civState.grid);
  const buildings = civState.buildings.map((b) => ({ ...b }));
  const era: CivilizationEra = civState.era;

  // Apply upgrades sequentially by targetLevel
  const upgradeJobs = initialJobs
    .filter((j) => j.kind === 'upgrade' && j.buildingId && typeof j.targetLevel === 'number')
    .sort((a, b) => (a.targetLevel ?? 0) - (b.targetLevel ?? 0));

  for (const job of upgradeJobs) {
    const idx = buildings.findIndex((b) => b.id === job.buildingId);
    if (idx !== -1 && typeof job.targetLevel === 'number') {
      const def = getBuildingDefinition(buildings[idx].definitionId);
      const maxLv = getEffectiveMaxLevel(def, era);
      buildings[idx] = {
        ...buildings[idx],
        level: Math.min(maxLv, Math.max(buildings[idx].level, job.targetLevel)),
      };
    }
  }

  // Apply expand jobs in dependency order (repeated passes for chained expansions)
  let pendingExpands = initialJobs.filter((j) => j.kind === 'expand' && j.origin);
  while (pendingExpands.length > 0) {
    let madeProgress = false;
    const nextPending: ConstructionJob[] = [];
    for (const job of pendingExpands) {
      if (job.origin && !gridMap.hasChunkAt(job.origin.x, job.origin.y)) {
        const res = gridMap.expandChunk(job.origin);
        if (res.success) {
          madeProgress = true;
          continue;
        }
      }
      if (job.origin && !gridMap.hasChunkAt(job.origin.x, job.origin.y)) {
        nextPending.push(job);
      }
    }
    pendingExpands = nextPending;
    if (!madeProgress) {
      break;
    }
  }

  // Place jobs simply clear from queue so existing level-1 buildings become active immediately.
  return finalizeBuildingsAndJobs(
    civState,
    gridMap,
    buildings,
    [],
    civState.villagers ?? [],
    civState.founderRole,
    nowMs
  );
}

export function applyDevUnlockLand(
  civState: CivilizationState,
  chunksToUnlock: number,
  nowMs: number = Date.now()
): CivilizationState {
  if (!isStrictFiniteNumber(chunksToUnlock) || chunksToUnlock < 1) {
    throw new Error('Invalid chunk count: expected finite number >= 1.');
  }
  const count = Math.max(1, Math.min(10, Math.floor(chunksToUnlock)));
  const gridMap = GridMap.fromSnapshot(civState.grid);
  let jobs = [...(civState.jobs ?? [])];

  for (let i = 0; i < count; i += 1) {
    const slots = gridMap.getAvailableExpansionSlots();
    if (slots.length === 0) break;
    const target = slots[0];
    const expanded = gridMap.expandChunk(target);
    if (expanded.success) {
      jobs = removeExpandJobAtOrigin(jobs, target);
    }
  }

  return finalizeBuildingsAndJobs(
    civState,
    gridMap,
    civState.buildings.map((b) => ({ ...b })),
    jobs,
    civState.villagers ?? [],
    civState.founderRole,
    nowMs
  );
}

function createUniqueBuildingId(buildings: readonly BuildingInstance[], definitionId: string, nowMs: number): string {
  let seq = buildings.length + 1;
  let candidate = `bld_dev_${definitionId}_${nowMs}_${seq}`;
  const used = new Set(buildings.map((b) => b.id));
  while (used.has(candidate)) {
    seq += 1;
    candidate = `bld_dev_${definitionId}_${nowMs}_${seq}`;
  }
  return candidate;
}

export function applyDevPlaceFreeBuilding(
  civState: CivilizationState,
  definitionId: string,
  nowMs: number = Date.now()
): CivilizationState {
  const def = getBuildingDefinition(definitionId);
  if (!def) {
    throw new Error(`Unknown building definition "${definitionId}".`);
  }

  const limitCheck = canPlaceAnotherBuildingOfCategory(def, civState.buildings);
  if (!limitCheck.allowed) {
    throw new Error(
      `Build limit reached for ${def.name} (${limitCheck.currentCount}/${limitCheck.limit ?? '∞'}).`
    );
  }

  const gridMap = GridMap.fromSnapshot(civState.grid);
  let jobs = [...(civState.jobs ?? [])];
  let slot = findFirstFreeFootprintSlot(gridMap, def.footprint);

  for (let attempt = 0; attempt < 4 && !slot; attempt += 1) {
    const expSlots = gridMap.getAvailableExpansionSlots();
    if (expSlots.length === 0) break;
    const chosen = expSlots[0];
    if (gridMap.expandChunk(chosen).success) {
      jobs = removeExpandJobAtOrigin(jobs, chosen);
      slot = findFirstFreeFootprintSlot(gridMap, def.footprint);
    }
  }

  if (!slot) {
    throw new Error(`No free grid space available for ${def.name}.`);
  }

  const buildingId = createUniqueBuildingId(civState.buildings, def.id, nowMs);
  const placed = gridMap.placeBuilding(buildingId, slot, def.footprint);
  if (!placed.success) {
    throw new Error(`Failed to place ${def.name}: ${placed.reason ?? 'unknown error'}`);
  }

  const nextBuildings: BuildingInstance[] = [
    ...civState.buildings.map((b) => ({ ...b })),
    {
      id: buildingId,
      definitionId: def.id,
      position: slot,
      level: 1,
      placedAt: nowMs,
    },
  ];

  return finalizeBuildingsAndJobs(
    civState,
    gridMap,
    nextBuildings,
    jobs,
    civState.villagers ?? [],
    civState.founderRole,
    nowMs
  );
}

export function applyDevMaxBuildings(
  civState: CivilizationState,
  nowMs: number = Date.now()
): CivilizationState {
  const gridMap = GridMap.fromSnapshot(civState.grid);
  const nextBuildings = civState.buildings.map((b) => {
    const def = getBuildingDefinition(b.definitionId);
    const maxLevel = getEffectiveMaxLevel(def, civState.era);
    return {
      ...b,
      level: maxLevel,
    };
  });
  // Clear place & upgrade jobs so building levels & under-construction invariants remain valid
  const remainingExpandJobs = (civState.jobs ?? []).filter((j) => j.kind === 'expand');

  return finalizeBuildingsAndJobs(
    civState,
    gridMap,
    nextBuildings,
    remainingExpandJobs,
    civState.villagers ?? [],
    civState.founderRole,
    nowMs
  );
}

function ensureCaveWithCapacity(
  civState: CivilizationState,
  minCapacity: number,
  nowMs: number
): CivilizationState {
  const caveDef = getBuildingDefinition(VILLAGE_CAVE_DEFINITION_ID)!;
  const maxCaveLevel = getEffectiveMaxLevel(caveDef, civState.era);
  const neededLevel = Math.min(maxCaveLevel, Math.max(1, Math.ceil(minCapacity / 2)));

  let working = civState;
  let existingCave = working.buildings.find((b) => b.definitionId === VILLAGE_CAVE_DEFINITION_ID);
  if (!existingCave) {
    working = applyDevPlaceFreeBuilding(working, VILLAGE_CAVE_DEFINITION_ID, nowMs);
    existingCave = working.buildings.find((b) => b.definitionId === VILLAGE_CAVE_DEFINITION_ID)!;
  }

  const gridMap = GridMap.fromSnapshot(working.grid);
  const targetLevel = Math.max(existingCave.level, neededLevel);
  const nextBuildings = working.buildings.map((b) =>
    b.id === existingCave!.id ? { ...b, level: targetLevel } : { ...b }
  );
  // Clear conflicting place/upgrade jobs on Cave
  const nextJobs = (working.jobs ?? []).filter((j) => {
    if (j.buildingId !== existingCave!.id) return true;
    if (j.kind === 'place') return false;
    if (j.kind === 'upgrade' && typeof j.targetLevel === 'number' && j.targetLevel <= targetLevel) {
      return false;
    }
    return true;
  });

  return finalizeBuildingsAndJobs(
    working,
    gridMap,
    nextBuildings,
    nextJobs,
    working.villagers ?? [],
    working.founderRole,
    nowMs
  );
}

export function applyDevRecruitFree(
  civState: CivilizationState,
  role: VillagerRole,
  nowMs: number = Date.now()
): CivilizationState {
  if (!isVillagerRole(role)) {
    throw new Error(`Invalid villager role "${String(role)}".`);
  }

  const existingVillagers = [...(civState.villagers ?? [])];
  const maxStoneCapacity = 10; // Lv.5 Rock Shelter * 2
  if (existingVillagers.length >= maxStoneCapacity) {
    throw new Error(`Max Rock Shelter capacity (${maxStoneCapacity}) already reached.`);
  }

  const cave = findVillageCave(civState.buildings, civState.jobs);
  const needCap = existingVillagers.length + 1;
  const prepared =
    !cave || getVillagerCapacity(cave) < needCap
      ? ensureCaveWithCapacity(civState, needCap, nowMs)
      : civState;

  const idSet = new Set(existingVillagers.map((v) => v.id));
  let seq = existingVillagers.length + 1;
  let vId = `v_dev_${nowMs}_${seq}`;
  while (idSet.has(vId)) {
    seq += 1;
    vId = `v_dev_${nowMs}_${seq}`;
  }

  const nextVillagers: Villager[] = [
    ...existingVillagers,
    {
      id: vId,
      role,
      recruitedAt: nowMs,
    },
  ];

  return finalizeBuildingsAndJobs(
    prepared,
    GridMap.fromSnapshot(prepared.grid),
    prepared.buildings.map((b) => ({ ...b })),
    prepared.jobs ?? [],
    nextVillagers,
    prepared.founderRole,
    nowMs
  );
}

export function applyDevFillAllRoles(
  civState: CivilizationState,
  nowMs: number = Date.now()
): CivilizationState {
  let working: CivilizationState = {
    ...civState,
    founderRole: civState.founderRole ?? 'crafter',
  };

  for (const role of VILLAGER_ROLES) {
    const hasRole =
      working.founderRole === role ||
      (working.villagers ?? []).some((v) => v.role === role);
    if (!hasRole) {
      working = applyDevRecruitFree(working, role, nowMs);
    }
  }

  return working;
}

export function applyDevMeetEraRequirements(params: {
  civ: CivilizationState;
  economy: PlayerEconomy;
  dailyStats: Record<string, DailyStatRecord>;
  nowMs?: number;
}): {
  civ: CivilizationState;
  economy: PlayerEconomy;
  dailyStats: Record<string, DailyStatRecord>;
} {
  const nowMs = params.nowMs ?? Date.now();
  // Strictly preserve STONE_AGE (5C-2 Era switching is deferred)
  let working = applyDevCompleteAllJobs(
    {
      ...params.civ,
      era: 'STONE_AGE',
    },
    nowMs
  );

  // 1. Ensure >= 3 land expansions (total >= 7 chunks)
  const requiredChunks =
    INITIAL_CHUNK_COUNT + STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.minLandExpansions;
  if (working.grid.chunks.length < requiredChunks) {
    working = applyDevUnlockLand(
      working,
      requiredChunks - working.grid.chunks.length,
      nowMs
    );
  }

  // 2. Ensure all required Stone Age buildings exist and meet minLevel floors
  for (const bReq of STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.buildingRequirements) {
    let currentCount = working.buildings.filter(
      (b) => b.definitionId === bReq.definitionId
    ).length;
    while (currentCount < bReq.minCount) {
      working = applyDevPlaceFreeBuilding(working, bReq.definitionId, nowMs);
      currentCount += 1;
    }
    const gridMap = GridMap.fromSnapshot(working.grid);
    const updatedBuildings = working.buildings.map((b) => {
      if (b.definitionId !== bReq.definitionId) return { ...b };
      const def = getBuildingDefinition(b.definitionId);
      const maxLv = getEffectiveMaxLevel(def, working.era);
      return {
        ...b,
        level: Math.min(maxLv, Math.max(b.level, bReq.minLevel)),
      };
    });
    working = finalizeBuildingsAndJobs(
      working,
      gridMap,
      updatedBuildings,
      working.jobs ?? [],
      working.villagers ?? [],
      working.founderRole,
      nowMs
    );
  }

  // 3. Ensure all 3 villager roles exist (Founder + recruited within Cave capacity)
  working = applyDevFillAllRoles(working, nowMs);

  // 4. Ensure Player Level >= 9 & Coins >= 500
  const minXp = getMinimumXpForLevel(STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.minPlayerLevel);
  const nextTotalXp = Math.max(params.economy.totalXP, minXp);
  const nextEconomy: PlayerEconomy = {
    ...params.economy,
    focusCoins: Math.max(
      params.economy.focusCoins,
      STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.feeCoins
    ),
    totalXP: nextTotalXp,
    level: calculatePlayerLevel(nextTotalXp),
  };

  // 5. Ensure Lifetime Focus Minutes >= 500
  let nextDailyStats = { ...params.dailyStats };
  const currentLifetime = calculateLifetimeFocusMinutes(nextDailyStats);
  if (currentLifetime < STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.minTotalFocusMinutes) {
    const deficit = STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.minTotalFocusMinutes - currentLifetime;
    const todayKey = getLocalDateKey(nowMs);
    const existing = nextDailyStats[todayKey] ?? {
      date: todayKey,
      totalFocusMinutes: 0,
      completedSessions: 0,
      abandonedSessions: 0,
      coinsEarned: 0,
      xpEarned: 0,
    };
    nextDailyStats[todayKey] = {
      ...existing,
      date: todayKey,
      totalFocusMinutes: existing.totalFocusMinutes + deficit,
      completedSessions: Math.max(1, existing.completedSessions),
    };
  }

  return {
    civ: working,
    economy: nextEconomy,
    dailyStats: nextDailyStats,
  };
}

export function buildEraEvaluationSummary(
  civ: CivilizationState,
  economy: PlayerEconomy,
  dailyStats: Record<string, DailyStatRecord>
) {
  return evaluateEraAdvance({
    era: civ.era,
    buildings: civ.buildings,
    villagers: civ.villagers,
    jobs: civ.jobs,
    founderRole: civ.founderRole,
    landExpansions: Math.max(0, civ.grid.chunks.length - INITIAL_CHUNK_COUNT),
    playerLevel: calculatePlayerLevel(economy.totalXP),
    totalFocusMinutes: calculateLifetimeFocusMinutes(dailyStats),
    coins: economy.focusCoins,
  });
}

export function applyDevCompleteAllQuests(
  questState: QuestState,
  nowMs: number = Date.now()
): QuestState {
  const rolled = rolloverQuestState(questState, nowMs);

  const daily: Record<string, QuestProgress> = {};
  for (const def of getActiveQuestDefinitions('DAILY', rolled)) {
    const prev = rolled.daily[def.id];
    daily[def.id] = {
      questId: def.id,
      period: 'DAILY',
      progress: def.target,
      target: def.target,
      completed: true,
      claimed: prev?.claimed ?? false,
      claimedAt: prev?.claimedAt ?? null,
    };
  }

  const weekly: Record<string, QuestProgress> = {};
  for (const def of getActiveQuestDefinitions('WEEKLY', rolled)) {
    const prev = rolled.weekly[def.id];
    weekly[def.id] = {
      questId: def.id,
      period: 'WEEKLY',
      progress: def.target,
      target: def.target,
      completed: true,
      claimed: prev?.claimed ?? false,
      claimedAt: prev?.claimedAt ?? null,
    };
  }

  return {
    ...rolled,
    daily,
    weekly,
  };
}

export function applyDevRolloverQuests(
  questState: QuestState,
  period: QuestPeriod,
  nowMs: number = Date.now()
): QuestState {
  const rolled = rolloverQuestState(questState, nowMs);
  const nextSalt = deriveDeterministicSalt(`${rolled.salt}:dev:${nowMs}:${period}`);

  if (period === 'DAILY') {
    const prevIds = Object.keys(rolled.daily);
    const chosen = selectQuestsForPeriod('DAILY', rolled.dailyDateKey, nextSalt, prevIds);
    const daily: Record<string, QuestProgress> = {};
    for (const def of chosen) {
      daily[def.id] = {
        questId: def.id,
        period: 'DAILY',
        progress: 0,
        target: def.target,
        completed: false,
        claimed: false,
        claimedAt: null,
      };
    }
    return {
      ...rolled,
      salt: nextSalt,
      daily,
      dailyPreviousSelection: prevIds,
    };
  }

  const prevIds = Object.keys(rolled.weekly);
  const chosen = selectQuestsForPeriod('WEEKLY', rolled.weeklyStartKey, nextSalt, prevIds);
  const weekly: Record<string, QuestProgress> = {};
  for (const def of chosen) {
    weekly[def.id] = {
      questId: def.id,
      period: 'WEEKLY',
      progress: 0,
      target: def.target,
      completed: false,
      claimed: false,
      claimedAt: null,
    };
  }
  return {
    ...rolled,
    salt: nextSalt,
    weekly,
    weeklyPreviousSelection: prevIds,
    weeklyActiveDateKeys: [],
    weeklyDailyMinutes: {},
  };
}

export function applyDevFastForwardDays(params: {
  questState: QuestState;
  dailyStats: Record<string, DailyStatRecord>;
  days?: number;
  nowMs?: number;
}): {
  questState: QuestState;
  dailyStats: Record<string, DailyStatRecord>;
} {
  if (params.days !== undefined && (!isStrictFiniteNumber(params.days) || params.days < 1)) {
    throw new Error('Invalid fast-forward days: expected finite number >= 1.');
  }
  const days = Math.max(1, Math.min(30, Math.floor(params.days ?? 1)));
  const nowMs = isStrictFiniteNumber(params.nowMs) ? params.nowMs : Date.now();
  const baseQuests = sanitizeQuestState(params.questState, nowMs);

  const shiftedDailyKey =
    addDaysToDateKey(baseQuests.dailyDateKey, -days) ?? baseQuests.dailyDateKey;
  const shiftedWeeklyKey =
    addDaysToDateKey(baseQuests.weeklyStartKey, -days) ?? baseQuests.weeklyStartKey;
  const normalizedWeeklyKey = getLocalWeekStartKeyFromDateKey(shiftedWeeklyKey);

  const shiftedLastCompleted = baseQuests.streak.lastCompletedDateKey
    ? addDaysToDateKey(baseQuests.streak.lastCompletedDateKey, -days)
    : null;

  const shiftedWeeklyMinutes: Record<string, number> = {};
  for (const [k, v] of Object.entries(baseQuests.weeklyDailyMinutes ?? {})) {
    const shifted = addDaysToDateKey(k, -days);
    if (shifted && getLocalWeekStartKeyFromDateKey(shifted) === normalizedWeeklyKey) {
      shiftedWeeklyMinutes[shifted] = v;
    }
  }

  const shiftedActiveDateKeys = baseQuests.weeklyActiveDateKeys
    .map((k) => addDaysToDateKey(k, -days))
    .filter((k): k is string => Boolean(k && getLocalWeekStartKeyFromDateKey(k) === normalizedWeeklyKey));

  const shiftedState: QuestState = {
    ...baseQuests,
    dailyDateKey: shiftedDailyKey,
    weeklyStartKey: normalizedWeeklyKey,
    weeklyActiveDateKeys: shiftedActiveDateKeys,
    weeklyDailyMinutes: shiftedWeeklyMinutes,
    streak: {
      ...baseQuests.streak,
      lastCompletedDateKey: shiftedLastCompleted,
    },
  };

  const rolledQuests = rolloverQuestState(shiftedState, nowMs);

  const shiftedStats: Record<string, DailyStatRecord> = {};
  for (const [dateKey, rec] of Object.entries(params.dailyStats)) {
    if (!isValidDateKey(dateKey)) continue;
    const movedKey = addDaysToDateKey(dateKey, -days);
    if (movedKey) {
      shiftedStats[movedKey] = {
        ...rec,
        date: movedKey,
      };
    }
  }

  return {
    questState: rolledQuests,
    dailyStats: shiftedStats,
  };
}

export function buildDevSeedDemoState(nowMs: number = Date.now()): {
  economy: PlayerEconomy;
  civ: CivilizationState;
  questState: QuestState;
  dailyStats: Record<string, DailyStatRecord>;
} {
  let civ = createInitialCivilizationState();
  civ = applyDevUnlockLand(civ, 2, nowMs);
  civ = { ...civ, founderRole: 'crafter' };
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_study_cave', nowMs);
  civ = applyDevRecruitFree(civ, 'elder', nowMs);
  civ = applyDevRecruitFree(civ, 'woodworker', nowMs);
  civ = applyDevRecruitFree(civ, 'crafter', nowMs);
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_campfire', nowMs);
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_elder_hut', nowMs);
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_foraging_post', nowMs);
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_food_cache', nowMs);

  // Add 1 active construction job so FocusSceneArea & Map both showcase live crew work
  const gridMap = GridMap.fromSnapshot(civ.grid);
  const totemDef = getBuildingDefinition('stone_age_totem')!;
  const totemSlot = findFirstFreeFootprintSlot(gridMap, totemDef.footprint);
  const demoBuildings = civ.buildings.map((b) =>
    b.definitionId === 'stone_age_foraging_post' ? { ...b, level: 2 } : { ...b }
  );
  const demoJobs: ConstructionJob[] = [];
  if (totemSlot) {
    const totemId = `bld_demo_totem_${nowMs}`;
    if (gridMap.placeBuilding(totemId, totemSlot, totemDef.footprint).success) {
      demoBuildings.push({
        id: totemId,
        definitionId: totemDef.id,
        position: totemSlot,
        level: 1,
        placedAt: nowMs,
      });
      demoJobs.push({
        id: `job_demo_place_${nowMs}`,
        kind: 'place',
        status: 'ACTIVE',
        definitionId: totemDef.id,
        buildingId: totemId,
        crewRequired: 1,
        totalSeconds: 1800,
        remainingSeconds: 1200,
        paidCoins: totemDef.baseCost,
        createdAt: nowMs,
      });
    }
  }
  const hut = demoBuildings.find((b) => b.definitionId === 'stone_age_elder_hut');
  if (hut) {
    demoJobs.push({
      id: `job_demo_upgrade_${nowMs}`,
      kind: 'upgrade',
      status: 'ACTIVE',
      definitionId: hut.definitionId,
      buildingId: hut.id,
      targetLevel: 2,
      crewRequired: 1,
      totalSeconds: 600,
      remainingSeconds: 420,
      paidCoins: 36,
      createdAt: nowMs + 1,
    });
  }

  civ = finalizeBuildingsAndJobs(
    civ,
    gridMap,
    demoBuildings,
    demoJobs,
    civ.villagers ?? [],
    civ.founderRole,
    nowMs
  );

  const totalXP = 1600;
  const economy: PlayerEconomy = {
    focusCoins: 1850,
    totalXP,
    level: calculatePlayerLevel(totalXP),
  };

  const todayKey = getLocalDateKey(nowMs);
  const dailyStats: Record<string, DailyStatRecord> = {};
  for (let offset = -13; offset <= 0; offset += 1) {
    const key = addDaysToDateKey(todayKey, offset);
    if (!key) continue;
    const mins = offset === 0 ? 65 : 25 + (Math.abs(offset) % 4) * 15;
    dailyStats[key] = {
      date: key,
      totalFocusMinutes: mins,
      completedSessions: Math.max(1, Math.floor(mins / 25)),
      abandonedSessions: 0,
      coinsEarned: mins * 2,
      xpEarned: mins * 5,
    };
  }

  const baseQuests = createInitialQuestState(nowMs);
  const dailyEntries = { ...baseQuests.daily };
  const firstDailyId = Object.keys(dailyEntries)[0];
  if (firstDailyId) {
    dailyEntries[firstDailyId] = {
      ...dailyEntries[firstDailyId],
      progress: dailyEntries[firstDailyId].target,
      completed: true,
      claimed: false,
      claimedAt: null,
    };
  }

  const questState: QuestState = {
    ...baseQuests,
    daily: dailyEntries,
    streak: {
      currentDays: 4,
      longestDays: 4,
      lastCompletedDateKey: addDaysToDateKey(todayKey, -1) ?? todayKey,
    },
  };

  return {
    economy,
    civ: sanitizeCivilizationState(civ) ?? createInitialCivilizationState(),
    questState,
    dailyStats,
  };
}

export function applyDevUnlockAllAwards(
  current: AwardState | null | undefined,
  nowMs: number = Date.now(),
  era: CivilizationEra = 'STONE_AGE'
): AwardState {
  const safeNow = isStrictFiniteNumber(nowMs) && nowMs >= 0 ? Math.floor(nowMs) : Date.now();
  const base = sanitizeAwardState(current);
  const unlocked: AwardState['unlocked'] = {};
  for (const [awardId, tiers] of Object.entries(base.unlocked)) {
    unlocked[awardId] = { ...tiers };
  }

  for (const def of STONE_AGE_AWARDS_CATALOG) {
    if (!isEraUnlocked(era, def.availableFrom)) continue;
    if (!unlocked[def.id]) {
      unlocked[def.id] = {};
    }
    for (const tierSpec of def.tiers) {
      if (!isEraUnlocked(era, tierSpec.availableFrom)) continue;
      if (!unlocked[def.id][tierSpec.tier]) {
        unlocked[def.id][tierSpec.tier] = {
          unlockedAt: safeNow,
          seen: false,
        };
      }
    }
  }

  return {
    ...base,
    unlocked,
  };
}

export interface SanitizedImportPayload {
  readonly economy: PlayerEconomy;
  readonly civ: CivilizationState;
  readonly quests: QuestState;
  readonly awards?: AwardState;
  readonly dailyStats: Record<string, DailyStatRecord>;
  readonly profiles?: FocusProfile[];
  readonly activeProfileId?: string;
  readonly settings?: UserSettings;
}

function toSafeFiniteNonNegInt(raw: unknown): number {
  return isStrictFiniteNumber(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

function toSafeFiniteNonNegNumber(raw: unknown): number {
  return isStrictFiniteNumber(raw) && raw >= 0 ? raw : 0;
}

export function sanitizeImportedBundle(
  rawInput: unknown,
  nowMs: number = Date.now()
): SanitizedImportPayload {
  const safeNow = isStrictFiniteNumber(nowMs) ? nowMs : Date.now();
  let parsed: unknown;
  if (typeof rawInput === 'string') {
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      throw new Error('Invalid JSON syntax in import bundle.');
    }
  } else {
    parsed = rawInput;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid import bundle JSON.');
  }

  const rec = parsed as Partial<DevExportBundle>;

  const rawCiv = sanitizeCivilizationState(rec.civilization) ?? createInitialCivilizationState();
  // Always keep era in STONE_AGE in dev bundles until 5C-2 unlocks Bronze Age UI/catalog
  const sanitizedCiv: CivilizationState = {
    ...rawCiv,
    era: 'STONE_AGE',
  };

  const sanitizedQuests = sanitizeQuestState(rec.quests, safeNow);

  const rawCoins = rec.economy?.focusCoins;
  const rawXp = rec.economy?.totalXP;
  const totalXP = toSafeFiniteNonNegNumber(rawXp);
  const economy: PlayerEconomy = {
    focusCoins: Math.min(999_999_999, toSafeFiniteNonNegNumber(rawCoins)),
    totalXP,
    level: calculatePlayerLevel(totalXP),
  };

  const cleanStats: Record<string, DailyStatRecord> = {};
  if (rec.dailyStats && typeof rec.dailyStats === 'object' && !Array.isArray(rec.dailyStats)) {
    for (const [k, v] of Object.entries(rec.dailyStats)) {
      if (!isValidDateKey(k) || !v || typeof v !== 'object' || Array.isArray(v)) continue;
      const statRec = v as Partial<DailyStatRecord>;
      cleanStats[k] = {
        date: k,
        totalFocusMinutes: Math.min(1440, toSafeFiniteNonNegInt(statRec.totalFocusMinutes)),
        completedSessions: toSafeFiniteNonNegInt(statRec.completedSessions),
        abandonedSessions: toSafeFiniteNonNegInt(statRec.abandonedSessions),
        coinsEarned: toSafeFiniteNonNegNumber(statRec.coinsEarned),
        xpEarned: toSafeFiniteNonNegNumber(statRec.xpEarned),
      };
    }
  }

  let cleanProfiles: FocusProfile[] | undefined;
  if (Array.isArray(rec.profiles)) {
    const seenIds = new Set<string>();
    const valid: FocusProfile[] = [];
    for (const item of rec.profiles) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Partial<FocusProfile>;
      if (typeof p.id !== 'string' || p.id.trim().length === 0 || seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      const name = typeof p.name === 'string' && p.name.trim().length > 0 ? p.name.trim() : p.id;
      const allowedDomains = Array.isArray(p.allowedDomains)
        ? p.allowedDomains.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
        : [];
      valid.push({
        id: p.id.trim(),
        name,
        allowedDomains,
        isDefault: Boolean(p.isDefault),
        createdAt: isStrictFiniteNumber(p.createdAt) ? p.createdAt : safeNow,
        updatedAt: isStrictFiniteNumber(p.updatedAt) ? p.updatedAt : safeNow,
      });
    }
    if (valid.length > 0) {
      cleanProfiles = valid;
    }
  }

  let cleanActiveProfileId: string | undefined;
  if (cleanProfiles && cleanProfiles.length > 0) {
    const wanted = typeof rec.activeProfileId === 'string' ? rec.activeProfileId.trim() : '';
    cleanActiveProfileId = cleanProfiles.some((p) => p.id === wanted)
      ? wanted
      : cleanProfiles[0].id;
  } else if (typeof rec.activeProfileId === 'string' && rec.activeProfileId.trim().length > 0) {
    cleanActiveProfileId = rec.activeProfileId.trim();
  }

  let cleanSettings: UserSettings | undefined;
  if (rec.settings && typeof rec.settings === 'object' && !Array.isArray(rec.settings)) {
    const s = rec.settings as Partial<UserSettings>;
    cleanSettings = {
      soundEnabled: false,
      notificationsEnabled:
        typeof s.notificationsEnabled === 'boolean' ? s.notificationsEnabled : true,
      ...(s.language === 'en' || s.language === 'vi' ? { language: s.language } : {}),
      ...(typeof s.chimeEnabled === 'boolean' ? { chimeEnabled: s.chimeEnabled } : {}),
      ...(typeof s.musicPlayerExpanded === 'boolean'
        ? { musicPlayerExpanded: s.musicPlayerExpanded }
        : {}),
    };
  }

  const sanitizedAwards =
    rec.awards !== undefined ? sanitizeAwardState(rec.awards) : undefined;

  return {
    economy,
    civ: sanitizedCiv,
    quests: sanitizedQuests,
    awards: sanitizedAwards,
    dailyStats: cleanStats,
    profiles: cleanProfiles,
    activeProfileId: cleanActiveProfileId,
    settings: cleanSettings,
  };
}

function buildDailyStatsSeries(
  nowMs: number,
  daysCount: number,
  minutesForOffset: (offset: number) => number
): Record<string, DailyStatRecord> {
  const todayKey = getLocalDateKey(nowMs);
  const dailyStats: Record<string, DailyStatRecord> = {};
  for (let offset = -(daysCount - 1); offset <= 0; offset += 1) {
    const key = addDaysToDateKey(todayKey, offset);
    if (!key) continue;
    const mins = Math.max(0, Math.floor(minutesForOffset(offset)));
    if (mins === 0) continue;
    dailyStats[key] = {
      date: key,
      totalFocusMinutes: mins,
      completedSessions: Math.max(1, Math.floor(mins / 25)),
      abandonedSessions: 0,
      coinsEarned: Math.round(mins * 2),
      xpEarned: Math.round(mins * 5),
    };
  }
  return dailyStats;
}

export function buildDevPresetState(
  presetId: DevPresetId,
  nowMs: number = Date.now()
): {
  economy: PlayerEconomy;
  civ: CivilizationState;
  questState: QuestState;
  dailyStats: Record<string, DailyStatRecord>;
} {
  const safeNow = isStrictFiniteNumber(nowMs) ? nowMs : Date.now();
  const todayKey = getLocalDateKey(safeNow);

  if (presetId === 'newcomer') {
    return {
      economy: { focusCoins: 0, totalXP: 0, level: 1 },
      civ: createInitialCivilizationState(),
      questState: createInitialQuestState(safeNow),
      dailyStats: {},
    };
  }

  if (presetId === 'mid_stone') {
    let civ = createInitialCivilizationState();
    civ = applyDevUnlockLand(civ, 1, safeNow);
    civ = { ...civ, founderRole: 'crafter' };
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_study_cave', safeNow);
    civ = applyDevRecruitFree(civ, 'elder', safeNow);
    civ = applyDevRecruitFree(civ, 'woodworker', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_campfire', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_elder_hut', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_foraging_post', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_foraging_post', safeNow);

    const gridMap = GridMap.fromSnapshot(civ.grid);
    const buildings = civ.buildings.map((b) =>
      b.definitionId === 'stone_age_study_cave' ? { ...b, level: 2 } : { ...b }
    );
    const foragers = buildings.filter((b) => b.definitionId === 'stone_age_foraging_post');
    const jobs: ConstructionJob[] = [];
    if (foragers[0]) {
      jobs.push({
        id: `job_preset_mid_up1_${safeNow}`,
        kind: 'upgrade',
        status: 'ACTIVE',
        definitionId: foragers[0].definitionId,
        buildingId: foragers[0].id,
        targetLevel: 2,
        crewRequired: 1,
        totalSeconds: 300,
        remainingSeconds: 180,
        paidCoins: 24,
        createdAt: safeNow,
      });
    }
    const expSlots = gridMap.getAvailableExpansionSlots();
    if (expSlots[0]) {
      jobs.push({
        id: `job_preset_mid_exp_${safeNow}`,
        kind: 'expand',
        status: 'PENDING',
        origin: expSlots[0],
        crewRequired: 2,
        totalSeconds: 3600,
        remainingSeconds: 3600,
        paidCoins: 30,
        createdAt: safeNow + 1,
      });
    }
    civ = finalizeBuildingsAndJobs(
      civ,
      gridMap,
      buildings,
      jobs,
      civ.villagers ?? [],
      civ.founderRole,
      safeNow
    );

    const totalXP = getMinimumXpForLevel(5);
    const dailyStats = buildDailyStatsSeries(safeNow, 7, (offset) =>
      offset === 0 ? 45 : 30 + (Math.abs(offset) % 3) * 15
    );
    const questState = createInitialQuestState(safeNow);
    return {
      economy: { focusCoins: 480, totalXP, level: calculatePlayerLevel(totalXP) },
      civ,
      questState,
      dailyStats,
    };
  }

  if (presetId === 'era_ready') {
    const dailyStats = buildDailyStatsSeries(safeNow, 14, (offset) =>
      offset === 0 ? 90 : 40 + (Math.abs(offset) % 3) * 15
    );
    const baseCiv = createInitialCivilizationState();
    const eraResult = applyDevMeetEraRequirements({
      civ: baseCiv,
      economy: {
        focusCoins: 750,
        totalXP: getMinimumXpForLevel(10),
        level: 10,
      },
      dailyStats,
      nowMs: safeNow,
    });
    const questState = applyDevCompleteAllQuests(createInitialQuestState(safeNow), safeNow);
    return {
      economy: eraResult.economy,
      civ: eraResult.civ,
      questState,
      dailyStats: eraResult.dailyStats,
    };
  }

  if (presetId === 'full_jobs') {
    let civ = createInitialCivilizationState();
    civ = applyDevUnlockLand(civ, 3, safeNow);
    civ = { ...civ, founderRole: 'crafter' };
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_study_cave', safeNow);
    const roles: VillagerRole[] = [
      'elder',
      'woodworker',
      'crafter',
      'elder',
      'woodworker',
      'crafter',
      'elder',
      'woodworker',
      'crafter',
    ];
    for (let i = 0; i < roles.length; i += 1) {
      civ = applyDevRecruitFree(civ, roles[i], safeNow + i);
    }
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_campfire', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_elder_hut', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_foraging_post', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_foraging_post', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_food_cache', safeNow);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_food_cache', safeNow);

    const gridMap = GridMap.fromSnapshot(civ.grid);
    const buildings = civ.buildings.map((b) => ({ ...b }));
    const jobs: ConstructionJob[] = [];

    // 1) ACTIVE place: Ancient Totem
    const totemDef = getBuildingDefinition('stone_age_totem')!;
    const totemSlot = findFirstFreeFootprintSlot(gridMap, totemDef.footprint);
    if (totemSlot) {
      const totemId = `bld_preset_totem_${safeNow}`;
      if (gridMap.placeBuilding(totemId, totemSlot, totemDef.footprint).success) {
        buildings.push({
          id: totemId,
          definitionId: totemDef.id,
          position: totemSlot,
          level: 1,
          placedAt: safeNow,
        });
        jobs.push({
          id: `job_preset_full_1_place_${safeNow}`,
          kind: 'place',
          status: 'ACTIVE',
          definitionId: totemDef.id,
          buildingId: totemId,
          crewRequired: 1,
          totalSeconds: 3600,
          remainingSeconds: 2400,
          paidCoins: totemDef.baseCost,
          createdAt: safeNow + 1,
        });
      }
    }

    // 2) ACTIVE upgrade: Foraging Post #1
    const foragers = buildings.filter((b) => b.definitionId === 'stone_age_foraging_post');
    if (foragers[0]) {
      jobs.push({
        id: `job_preset_full_2_up_${safeNow}`,
        kind: 'upgrade',
        status: 'ACTIVE',
        definitionId: foragers[0].definitionId,
        buildingId: foragers[0].id,
        targetLevel: 2,
        crewRequired: 1,
        totalSeconds: 300,
        remainingSeconds: 180,
        paidCoins: 24,
        createdAt: safeNow + 2,
      });
    }

    // 3) ACTIVE upgrade: Primitive Granary #1
    const caches = buildings.filter((b) => b.definitionId === 'stone_age_food_cache');
    if (caches[0]) {
      jobs.push({
        id: `job_preset_full_3_up_${safeNow}`,
        kind: 'upgrade',
        status: 'ACTIVE',
        definitionId: caches[0].definitionId,
        buildingId: caches[0].id,
        targetLevel: 2,
        crewRequired: 1,
        totalSeconds: 300,
        remainingSeconds: 210,
        paidCoins: 48,
        createdAt: safeNow + 3,
      });
    }

    // 4) ACTIVE expand chunk #1
    const expSlots = gridMap.getAvailableExpansionSlots();
    if (expSlots[0]) {
      jobs.push({
        id: `job_preset_full_4_exp_${safeNow}`,
        kind: 'expand',
        status: 'ACTIVE',
        origin: expSlots[0],
        crewRequired: 2,
        totalSeconds: 3600,
        remainingSeconds: 2700,
        paidCoins: 40,
        createdAt: safeNow + 4,
      });
    }

    // 5) PENDING upgrade: Foraging Post #2
    if (foragers[1]) {
      jobs.push({
        id: `job_preset_full_5_up_${safeNow}`,
        kind: 'upgrade',
        status: 'PENDING',
        definitionId: foragers[1].definitionId,
        buildingId: foragers[1].id,
        targetLevel: 2,
        crewRequired: 1,
        totalSeconds: 300,
        remainingSeconds: 300,
        paidCoins: 24,
        createdAt: safeNow + 5,
      });
    }

    // 6) PENDING expand chunk #2
    if (expSlots[1]) {
      jobs.push({
        id: `job_preset_full_6_exp_${safeNow}`,
        kind: 'expand',
        status: 'PENDING',
        origin: expSlots[1],
        crewRequired: 2,
        totalSeconds: 3600,
        remainingSeconds: 3600,
        paidCoins: 45,
        createdAt: safeNow + 6,
      });
    }

    civ = finalizeBuildingsAndJobs(
      civ,
      gridMap,
      buildings,
      jobs,
      civ.villagers ?? [],
      civ.founderRole,
      safeNow
    );

    const totalXP = getMinimumXpForLevel(8);
    const dailyStats = buildDailyStatsSeries(safeNow, 10, (offset) =>
      offset === 0 ? 50 : 35 + (Math.abs(offset) % 3) * 15
    );
    return {
      economy: { focusCoins: 1200, totalXP, level: calculatePlayerLevel(totalXP) },
      civ,
      questState: createInitialQuestState(safeNow),
      dailyStats,
    };
  }

  // 'late_stone': fully upgraded Stone Age village, 11 total crew, all max Lv.5 buildings, rich stats
  let civ = createInitialCivilizationState();
  civ = applyDevUnlockLand(civ, 4, safeNow);
  civ = { ...civ, founderRole: 'crafter' };
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_study_cave', safeNow);
  const lateRoles: VillagerRole[] = [
    'crafter',
    'crafter',
    'crafter',
    'elder',
    'elder',
    'elder',
    'woodworker',
    'woodworker',
    'woodworker',
    'crafter',
  ];
  for (let i = 0; i < lateRoles.length; i += 1) {
    civ = applyDevRecruitFree(civ, lateRoles[i], safeNow + i);
  }
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_campfire', safeNow);
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_totem', safeNow);
  civ = applyDevPlaceFreeBuilding(civ, 'stone_age_elder_hut', safeNow);
  for (let i = 0; i < 4; i += 1) {
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_foraging_post', safeNow + 20 + i);
    civ = applyDevPlaceFreeBuilding(civ, 'stone_age_food_cache', safeNow + 40 + i);
  }
  civ = applyDevMaxBuildings(civ, safeNow);

  const totalXP = getMinimumXpForLevel(15);
  const dailyStats = buildDailyStatsSeries(safeNow, 21, (offset) =>
    offset === 0 ? 120 : 45 + (Math.abs(offset) % 4) * 20
  );
  const baseQuests = applyDevCompleteAllQuests(createInitialQuestState(safeNow), safeNow);
  const questState: QuestState = {
    ...baseQuests,
    streak: {
      currentDays: 7,
      longestDays: 10,
      lastCompletedDateKey: addDaysToDateKey(todayKey, -1) ?? todayKey,
    },
  };
  return {
    economy: { focusCoins: 5000, totalXP, level: calculatePlayerLevel(totalXP) },
    civ: { ...civ, era: 'STONE_AGE' },
    questState,
    dailyStats,
  };
}
