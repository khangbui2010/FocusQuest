import type { VillagerRole } from '../ui/components/civilization/spriteRegistry.ts';
import type { CivilizationState } from '../core/civilization/civilizationState.ts';
import type { EraAdvanceEvaluation } from '../core/civilization/eraRules.ts';
import type { PlayerEconomy } from '../types/economy.ts';
import type { FocusProfile } from '../types/profiles.ts';
import type { QuestPeriod, QuestState } from '../types/quests.ts';
import type { SessionSnapshot } from '../types/session.ts';
import type { DailyStatRecord, UserSettings } from '../types/storageSchema.ts';
import type { AwardState } from '../types/awards.ts';

export type DevTimeSpeed = 1 | 10 | 60 | 600;

export const DEV_TIME_SPEED_OPTIONS: readonly DevTimeSpeed[] = [1, 10, 60, 600];

export type DevPresetId =
  | 'newcomer'
  | 'mid_stone'
  | 'era_ready'
  | 'full_jobs'
  | 'late_stone';

export const DEV_PRESET_IDS: readonly DevPresetId[] = [
  'newcomer',
  'mid_stone',
  'era_ready',
  'full_jobs',
  'late_stone',
];

export type DevActionName =
  | 'DEV_GET_SNAPSHOT'
  | 'DEV_SET_COINS'
  | 'DEV_SET_LEVEL'
  | 'DEV_SET_FOCUS_MINUTES'
  | 'DEV_SET_TIME_SPEED'
  | 'DEV_ADVANCE_ACTIVE_SESSION_MS'
  | 'DEV_SKIP_FOCUS_WAIT'
  | 'DEV_COMPLETE_ALL_JOBS'
  | 'DEV_PLACE_FREE_BUILDING'
  | 'DEV_MAX_BUILDINGS'
  | 'DEV_UNLOCK_LAND'
  | 'DEV_RECRUIT_FREE'
  | 'DEV_FILL_ALL_ROLES'
  | 'DEV_MEET_ERA_REQUIREMENTS'
  | 'DEV_COMPLETE_ALL_QUESTS'
  | 'DEV_ROLLOVER_QUESTS'
  | 'DEV_UNLOCK_ALL_AWARDS'
  | 'DEV_RESET_AWARDS'
  | 'DEV_FAST_FORWARD_DAY'
  | 'DEV_SEED_DEMO_DATA'
  | 'DEV_APPLY_PRESET'
  | 'DEV_EXPORT_STATE'
  | 'DEV_IMPORT_STATE'
  | 'DEV_RESET_ALL_DATA';

export interface DevMessage {
  readonly action: DevActionName;
  readonly payload?: unknown;
}

export interface DevSnapshotData {
  readonly economy: PlayerEconomy;
  readonly civ: CivilizationState;
  readonly eraEvaluation: EraAdvanceEvaluation;
  readonly session: SessionSnapshot | null;
  readonly questState: QuestState;
  readonly awards: AwardState;
  readonly lifetimeFocusMinutes: number;
  readonly todayFocusMinutes: number;
  readonly timeSpeed: DevTimeSpeed;
}

export interface DevExportBundle {
  readonly exportedAt: number;
  readonly schemaVersion: number;
  readonly economy: PlayerEconomy;
  readonly civilization: CivilizationState;
  readonly quests: QuestState;
  readonly awards?: AwardState;
  readonly dailyStats: Record<string, DailyStatRecord>;
  readonly profiles: FocusProfile[];
  readonly activeProfileId: string;
  readonly settings?: UserSettings;
}

export interface DevActionLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly label: string;
  readonly action: DevActionName;
  readonly status: 'ok' | 'err';
  readonly detail?: string;
}

export interface DevPayloadByAction {
  DEV_GET_SNAPSHOT: undefined;
  DEV_SET_COINS: { amount: number };
  DEV_SET_LEVEL: { level: number };
  DEV_SET_FOCUS_MINUTES: { minutes: number };
  DEV_SET_TIME_SPEED: { speed: DevTimeSpeed };
  DEV_ADVANCE_ACTIVE_SESSION_MS: { deltaMs: number };
  DEV_SKIP_FOCUS_WAIT: undefined;
  DEV_COMPLETE_ALL_JOBS: undefined;
  DEV_PLACE_FREE_BUILDING: { definitionId: string };
  DEV_MAX_BUILDINGS: undefined;
  DEV_UNLOCK_LAND: { chunks: 1 | 3 };
  DEV_RECRUIT_FREE: { role: VillagerRole };
  DEV_FILL_ALL_ROLES: undefined;
  DEV_MEET_ERA_REQUIREMENTS: undefined;
  DEV_COMPLETE_ALL_QUESTS: undefined;
  DEV_ROLLOVER_QUESTS: { period: QuestPeriod };
  DEV_UNLOCK_ALL_AWARDS: undefined;
  DEV_RESET_AWARDS: undefined;
  DEV_FAST_FORWARD_DAY: { days?: number };
  DEV_SEED_DEMO_DATA: undefined;
  DEV_APPLY_PRESET: { presetId: DevPresetId };
  DEV_EXPORT_STATE: undefined;
  DEV_IMPORT_STATE: { bundle: DevExportBundle | string };
  DEV_RESET_ALL_DATA: undefined;
}
