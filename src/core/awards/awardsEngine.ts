import {
  AwardCounters,
  AwardDefinition,
  AwardEvaluationContext,
  AwardState,
  AwardTierUnlock,
  AwardTierView,
  AwardUnlockEvent,
  AwardViewModel,
} from '../../types/awards.ts';
import { getBuildingDefinition } from '../civilization/buildingCatalog.ts';
import { isEraUnlocked } from '../civilization/buildingTypes.ts';
import { isBuildingDefinitionUpgradeable } from '../civilization/buildingUpgrade.ts';
import { INITIAL_CHUNK_COUNT } from '../civilization/constants.ts';
import { evaluateEraAdvance, getEffectiveMaxLevel } from '../civilization/eraRules.ts';
import { getTotalVillagerCount, isBuildingUnderConstruction } from '../civilization/jobs.ts';
import { getVillagerRoleCounts } from '../civilization/villagerBuffs.ts';
import { calculatePlayerLevel } from '../economy/levelSystem.ts';
import { getActiveQuestDefinitions } from '../quests/questEngine.ts';
import { QuestState } from '../../types/quests.ts';
import {
  calculateFocusStreak,
  calculateLifetimeFocusMinutes,
} from '../stats/statsAggregator.ts';
import { STONE_AGE_AWARDS_CATALOG } from './awardsCatalog.ts';
import {
  recordPerfectDayInCounters,
  sanitizeAwardState,
} from './awardsState.ts';

export interface EvaluateAwardsOptions {
  readonly catalog?: readonly AwardDefinition[];
  readonly markNewAsSeen?: boolean;
  readonly metricOverrides?: Readonly<Record<string, number>>;
}

export interface AwardLevelSummary {
  readonly level: number;
  readonly nextThreshold: number | null;
}

export interface EvaluateAwardsResult {
  readonly nextState: AwardState;
  readonly newlyUnlocked: readonly AwardUnlockEvent[];
  readonly mutated: boolean;
  readonly viewModels: readonly AwardViewModel[];
  readonly levels: Readonly<Record<string, AwardLevelSummary>>;
  readonly unseenCount: number;
}

export function countCompletedFocusSessions(
  dailyStats: AwardEvaluationContext['dailyStats'] | null | undefined
): number {
  if (!dailyStats || typeof dailyStats !== 'object') {
    return 0;
  }
  let total = 0;
  for (const record of Object.values(dailyStats)) {
    if (
      record &&
      typeof record.completedSessions === 'number' &&
      Number.isFinite(record.completedSessions)
    ) {
      total += Math.max(0, Math.floor(record.completedSessions));
    }
  }
  return total;
}

export function countMaxedBuildings(
  civilization: AwardEvaluationContext['civilization'] | null | undefined
): number {
  if (!civilization || !Array.isArray(civilization.buildings)) {
    return 0;
  }
  const era = civilization.era;
  const jobs = civilization.jobs;
  let count = 0;
  for (const building of civilization.buildings) {
    if (!building || typeof building !== 'object') continue;
    if (isBuildingUnderConstruction(building.id, jobs)) continue;
    const def = getBuildingDefinition(building.definitionId);
    if (!def || !isBuildingDefinitionUpgradeable(def)) continue;
    const maxLevel = getEffectiveMaxLevel(def, era);
    if (
      typeof building.level === 'number' &&
      Number.isFinite(building.level) &&
      building.level >= maxLevel
    ) {
      count += 1;
    }
  }
  return count;
}

export function areAllActiveDailyQuestsClaimed(
  questState: QuestState | null | undefined
): boolean {
  if (!questState || !questState.daily) {
    return false;
  }
  const activeDaily = getActiveQuestDefinitions('DAILY', questState);
  if (activeDaily.length === 0) {
    return false;
  }
  return activeDaily.every((def) => Boolean(questState.daily[def.id]?.claimed));
}

export function computeAwardMetrics(
  context: AwardEvaluationContext,
  counters: AwardCounters,
  metricOverrides?: Readonly<Record<string, number>>
): Record<string, number> {
  const lifetimeMinutes = Math.floor(calculateLifetimeFocusMinutes(context.dailyStats));
  const completedSessions = countCompletedFocusSessions(context.dailyStats);
  const streakSummary = calculateFocusStreak(context.dailyStats, context.todayDateKey);
  const bestStreak = Math.max(streakSummary.longest, counters.maxFocusStreakDays);

  const playerLevel = calculatePlayerLevel(context.economy.totalXP);
  const landExpansions = Math.max(
    0,
    (context.civilization.grid?.chunks?.length ?? INITIAL_CHUNK_COUNT) - INITIAL_CHUNK_COUNT
  );
  const totalVillagers = getTotalVillagerCount(
    context.civilization.villagers,
    context.civilization.founderRole
  );
  const roleCounts = getVillagerRoleCounts(
    context.civilization.villagers,
    context.civilization.founderRole
  );
  const allThreeRoles =
    roleCounts.elder >= 1 && roleCounts.crafter >= 1 && roleCounts.woodworker >= 1 ? 1 : 0;

  const eraEval = evaluateEraAdvance({
    era: context.civilization.era,
    buildings: context.civilization.buildings,
    villagers: context.civilization.villagers,
    jobs: context.civilization.jobs,
    founderRole: context.civilization.founderRole,
    landExpansions,
    playerLevel,
    totalFocusMinutes: lifetimeMinutes,
    coins: context.economy.focusCoins,
  });

  const metrics: Record<string, number> = {
    focus_hours: lifetimeMinutes,
    focus_sessions: completedSessions,
    long_haul: counters.longestSessionMinutes,
    focus_streak: bestStreak,
    quest_keeper: counters.totalQuestsClaimed,
    perfect_day: counters.perfectDaysCount,
    player_level: playerLevel,
    builder: counters.totalBuildingsBuilt,
    master_builder: countMaxedBuildings(context.civilization),
    land_clearer: landExpansions,
    tribe: totalVillagers,
    tribe_complete: allThreeRoles,
    era_ready: eraEval.eligible ? 1 : 0,
  };

  if (metricOverrides) {
    for (const [k, v] of Object.entries(metricOverrides)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        metrics[k] = v;
      }
    }
  }

  return metrics;
}

export function countUnseenAwards(state: AwardState): number {
  let count = 0;
  for (const tierMap of Object.values(state.unlocked ?? {})) {
    if (!tierMap || typeof tierMap !== 'object') continue;
    for (const entry of Object.values(tierMap)) {
      if (entry && !entry.seen) {
        count += 1;
      }
    }
  }
  return count;
}

export function buildAwardViewModels(
  state: AwardState,
  context: AwardEvaluationContext,
  options?: {
    readonly catalog?: readonly AwardDefinition[];
    readonly metricOverrides?: Readonly<Record<string, number>>;
  }
): readonly AwardViewModel[] {
  const catalog = options?.catalog ?? STONE_AGE_AWARDS_CATALOG;
  const era = context.civilization.era;
  const metrics = computeAwardMetrics(context, state.counters, options?.metricOverrides);

  const sortedDefs = [...catalog]
    .filter((def) => isEraUnlocked(era, def.availableFrom))
    .sort((a, b) => a.order - b.order);

  return sortedDefs.map((def): AwardViewModel => {
    const unlockedMap = state.unlocked[def.id] ?? {};
    const availableTiers = def.tiers
      .filter((t) => isEraUnlocked(era, t.availableFrom))
      .sort((a, b) => a.tier - b.tier);

    const tierViews: AwardTierView[] = availableTiers.map((tierSpec) => {
      const unlockEntry = unlockedMap[tierSpec.tier];
      return {
        tier: tierSpec.tier,
        threshold: tierSpec.threshold,
        availableFrom: tierSpec.availableFrom,
        unlocked: Boolean(unlockEntry),
        unlockedAt: unlockEntry ? unlockEntry.unlockedAt : null,
        seen: unlockEntry ? unlockEntry.seen : true,
      };
    });

    let highestTierUnlocked = 0;
    let hasUnseen = false;
    let nextTier: AwardTierView | null = null;

    for (const tv of tierViews) {
      if (tv.unlocked) {
        if (tv.tier > highestTierUnlocked) {
          highestTierUnlocked = tv.tier;
        }
        if (!tv.seen) {
          hasUnseen = true;
        }
      } else if (!nextTier) {
        nextTier = tv;
      }
    }

    const totalAvailableTiers = tierViews.length;
    const isSingleLevel = totalAvailableTiers === 1;
    const isMaxed = totalAvailableTiers > 0 && highestTierUnlocked >= totalAvailableTiers;
    const rawMetric = metrics[def.id] ?? 0;

    return {
      id: def.id,
      category: def.category,
      order: def.order,
      titleKey: def.titleKey,
      descriptionKey: def.descriptionKey,
      icon: def.icon,
      unit: def.unit,
      currentMetric: Math.max(0, Math.floor(rawMetric)),
      level: highestTierUnlocked,
      highestTierUnlocked,
      totalAvailableTiers,
      isSingleLevel,
      nextThreshold: nextTier ? nextTier.threshold : null,
      nextTier,
      tiers: tierViews,
      hasUnseen,
      isMaxed,
    };
  });
}

export function evaluateAwards(
  currentState: AwardState | null | undefined,
  context: AwardEvaluationContext,
  options?: EvaluateAwardsOptions
): EvaluateAwardsResult {
  const sanitized = sanitizeAwardState(currentState);
  const catalog = options?.catalog ?? STONE_AGE_AWARDS_CATALOG;
  const markNewAsSeen = Boolean(options?.markNewAsSeen);
  const safeNowMs =
    typeof context.nowMs === 'number' && Number.isFinite(context.nowMs) && context.nowMs >= 0
      ? Math.floor(context.nowMs)
      : 0;

  let counters = sanitized.counters;
  let countersChanged = false;

  const streakLongest = calculateFocusStreak(context.dailyStats, context.todayDateKey).longest;
  if (streakLongest > counters.maxFocusStreakDays) {
    counters = {
      ...counters,
      maxFocusStreakDays: streakLongest,
    };
    countersChanged = true;
  }

  const metrics = computeAwardMetrics(context, counters, options?.metricOverrides);
  const era = context.civilization.era;

  const nextUnlocked: Record<string, Record<number, AwardTierUnlock>> = {};
  for (const [awardId, tierMap] of Object.entries(sanitized.unlocked)) {
    nextUnlocked[awardId] = { ...tierMap };
  }

  const newlyUnlocked: AwardUnlockEvent[] = [];
  let unlockedChanged = false;

  const orderedDefs = [...catalog]
    .filter((def) => isEraUnlocked(era, def.availableFrom))
    .sort((a, b) => a.order - b.order);

  for (const def of orderedDefs) {
    const metricValue = metrics[def.id] ?? 0;
    const availableTiers = def.tiers
      .filter((t) => isEraUnlocked(era, t.availableFrom))
      .sort((a, b) => a.tier - b.tier);

    for (const tierSpec of availableTiers) {
      const existingMap = nextUnlocked[def.id];
      const alreadyUnlocked = Boolean(existingMap && existingMap[tierSpec.tier]);
      if (alreadyUnlocked) {
        // One-way permanent unlock invariant: never re-lock or overwrite unlockedAt/seen
        continue;
      }

      if (metricValue >= tierSpec.threshold) {
        if (!nextUnlocked[def.id]) {
          nextUnlocked[def.id] = {};
        }
        nextUnlocked[def.id][tierSpec.tier] = {
          unlockedAt: safeNowMs,
          seen: markNewAsSeen,
        };
        newlyUnlocked.push({
          awardId: def.id,
          tier: tierSpec.tier,
          level: tierSpec.tier,
          isSingleLevel: availableTiers.length === 1,
          unlockedAt: safeNowMs,
        });
        unlockedChanged = true;
      }
    }
  }

  const mutated = countersChanged || unlockedChanged;
  const nextState: AwardState = mutated
    ? {
        version: sanitized.version,
        unlocked: nextUnlocked,
        counters,
      }
    : sanitized;

  const viewModels = buildAwardViewModels(nextState, context, {
    catalog,
    metricOverrides: options?.metricOverrides,
  });

  const levels: Record<string, AwardLevelSummary> = {};
  for (const vm of viewModels) {
    levels[vm.id] = {
      level: vm.level,
      nextThreshold: vm.nextThreshold,
    };
  }

  return {
    nextState,
    newlyUnlocked,
    mutated,
    viewModels,
    levels,
    unseenCount: countUnseenAwards(nextState),
  };
}

export function backfillAwardsFromHistory(
  currentState: AwardState | null | undefined,
  context: AwardEvaluationContext,
  options?: Omit<EvaluateAwardsOptions, 'markNewAsSeen'>
): EvaluateAwardsResult {
  const sanitized = sanitizeAwardState(currentState);
  let counters = sanitized.counters;

  // Backfill totalBuildingsBuilt from existing completed non-under-construction buildings if counter is below actual count
  const completedBuildingCount = context.civilization.buildings.filter(
    (b) => !isBuildingUnderConstruction(b.id, context.civilization.jobs)
  ).length;
  if (completedBuildingCount > counters.totalBuildingsBuilt) {
    counters = {
      ...counters,
      totalBuildingsBuilt: completedBuildingCount,
    };
  }

  // Backfill totalQuestsClaimed at least from currently claimed daily + weekly entries
  const claimedDaily = Object.values(context.quests.daily ?? {}).filter((q) => q?.claimed).length;
  const claimedWeekly = Object.values(context.quests.weekly ?? {}).filter((q) => q?.claimed).length;
  const minClaimed = claimedDaily + claimedWeekly;
  if (minClaimed > counters.totalQuestsClaimed) {
    counters = {
      ...counters,
      totalQuestsClaimed: minClaimed,
    };
  }

  if (areAllActiveDailyQuestsClaimed(context.quests)) {
    counters = recordPerfectDayInCounters(counters, context.quests.dailyDateKey);
  }

  const hydratedState: AwardState = {
    ...sanitized,
    counters,
  };

  return evaluateAwards(hydratedState, context, {
    ...options,
    markNewAsSeen: true,
  });
}

export function markAwardsAsSeen(
  currentState: AwardState | null | undefined,
  awardIds?: readonly string[]
): { nextState: AwardState; mutated: boolean } {
  const sanitized = sanitizeAwardState(currentState);
  const filterSet =
    Array.isArray(awardIds) && awardIds.length > 0 ? new Set(awardIds) : null;

  let mutated = false;
  const nextUnlocked: Record<string, Record<number, AwardTierUnlock>> = {};

  for (const [awardId, tierMap] of Object.entries(sanitized.unlocked)) {
    const shouldMark = !filterSet || filterSet.has(awardId);
    const nextTierMap: Record<number, AwardTierUnlock> = {};

    for (const [tierKeyStr, entry] of Object.entries(tierMap)) {
      const tierNum = Number(tierKeyStr);
      if (shouldMark && !entry.seen) {
        nextTierMap[tierNum] = {
          unlockedAt: entry.unlockedAt,
          seen: true,
        };
        mutated = true;
      } else {
        nextTierMap[tierNum] = entry;
      }
    }
    nextUnlocked[awardId] = nextTierMap;
  }

  if (!mutated) {
    return { nextState: sanitized, mutated: false };
  }

  return {
    nextState: {
      ...sanitized,
      unlocked: nextUnlocked,
    },
    mutated: true,
  };
}
