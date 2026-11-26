export { STONE_AGE_AWARDS_CATALOG, getAwardDefinition } from './awardsCatalog.ts';
export {
  MAX_STORED_PERFECT_DAY_KEYS,
  createInitialAwardCounters,
  createInitialAwardState,
  normalizeAwardCounters,
  recordPerfectDayInCounters,
  sanitizeAwardState,
} from './awardsState.ts';
export {
  areAllActiveDailyQuestsClaimed,
  backfillAwardsFromHistory,
  buildAwardViewModels,
  computeAwardMetrics,
  countCompletedFocusSessions,
  countMaxedBuildings,
  countUnseenAwards,
  evaluateAwards,
  markAwardsAsSeen,
} from './awardsEngine.ts';
export type {
  AwardLevelSummary,
  EvaluateAwardsOptions,
  EvaluateAwardsResult,
} from './awardsEngine.ts';
