import { CivilizationEra } from '../core/civilization/buildingTypes.ts';
import { CivilizationState } from '../core/civilization/civilizationState.ts';
import { PlayerEconomy } from './economy.ts';
import { QuestState } from './quests.ts';
import { DailyStatRecord } from './storageSchema.ts';

export const CURRENT_AWARDS_STATE_VERSION = 1;

export type AwardCategory = 'focus' | 'quests' | 'civilization';

export type StoneAgeAwardId =
  | 'focus_hours'
  | 'focus_sessions'
  | 'long_haul'
  | 'focus_streak'
  | 'quest_keeper'
  | 'perfect_day'
  | 'player_level'
  | 'builder'
  | 'master_builder'
  | 'land_clearer'
  | 'tribe'
  | 'tribe_complete'
  | 'era_ready';

export type AwardId = StoneAgeAwardId | (string & {});

export type AwardUnit =
  | 'minutes'
  | 'sessions'
  | 'days'
  | 'quests'
  | 'levels'
  | 'buildings'
  | 'chunks'
  | 'villagers'
  | 'boolean';

export type AwardIconSpec =
  | {
      readonly kind: 'tile';
      readonly pack: 'tiny-town' | 'tiny-dungeon';
      readonly tileIndex: number;
    }
  | {
      readonly kind: 'clock';
      readonly clockIndex: 0 | 1 | 2;
    };

export interface AwardRewardPlaceholder {
  readonly coins?: number;
  readonly xp?: number;
}

export interface AwardTierSpec {
  readonly tier: number;
  readonly threshold: number;
  readonly availableFrom: CivilizationEra;
  readonly rewardPlaceholder?: AwardRewardPlaceholder;
}

export interface AwardDefinition {
  readonly id: AwardId;
  readonly category: AwardCategory;
  readonly order: number;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly icon: AwardIconSpec;
  readonly unit: AwardUnit;
  readonly availableFrom: CivilizationEra;
  readonly tiers: readonly AwardTierSpec[];
}

export interface AwardTierUnlock {
  readonly unlockedAt: number;
  readonly seen: boolean;
}

export interface AwardCounters {
  readonly longestSessionMinutes: number;
  readonly maxFocusStreakDays: number;
  readonly totalQuestsClaimed: number;
  readonly perfectDaysCount: number;
  readonly perfectDayDateKeys: readonly string[];
  readonly totalBuildingsBuilt: number;
}

export interface AwardState {
  readonly version: number;
  readonly unlocked: Record<string, Record<number, AwardTierUnlock>>;
  readonly counters: AwardCounters;
}

export interface AwardEvaluationContext {
  readonly economy: PlayerEconomy;
  readonly dailyStats: Record<string, DailyStatRecord>;
  readonly quests: QuestState;
  readonly civilization: CivilizationState;
  readonly todayDateKey: string;
  readonly nowMs: number;
}

export interface AwardTierView {
  readonly tier: number;
  readonly threshold: number;
  readonly availableFrom: CivilizationEra;
  readonly unlocked: boolean;
  readonly unlockedAt: number | null;
  readonly seen: boolean;
}

export interface AwardViewModel {
  readonly id: string;
  readonly category: AwardCategory;
  readonly order: number;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly icon: AwardIconSpec;
  readonly unit: AwardUnit;
  readonly currentMetric: number;
  readonly level: number;
  readonly highestTierUnlocked: number;
  readonly totalAvailableTiers: number;
  readonly isSingleLevel: boolean;
  readonly nextThreshold: number | null;
  readonly nextTier: AwardTierView | null;
  readonly tiers: readonly AwardTierView[];
  readonly hasUnseen: boolean;
  readonly isMaxed: boolean;
}

export interface AwardUnlockEvent {
  readonly awardId: string;
  readonly tier: number;
  readonly level: number;
  readonly isSingleLevel: boolean;
  readonly unlockedAt: number;
}

export interface GetAwardsStateResponseData {
  readonly awardState: AwardState;
  readonly awards: readonly AwardViewModel[];
  readonly unseenCount: number;
  readonly era: CivilizationEra;
}

export interface MarkAwardsSeenPayload {
  readonly awardIds?: readonly string[];
}

export interface MarkAwardsSeenResponseData {
  readonly awardState: AwardState;
  readonly awards: readonly AwardViewModel[];
  readonly unseenCount: number;
}
