import { SessionMode, SessionSnapshot, PomodoroConfig } from './session.ts';
import { FocusProfile } from './profiles.ts';
import { PlayerEconomy } from './economy.ts';
import { DailyStatRecord, UserSettings } from './storageSchema.ts';
import { GridCoordinate } from '../core/civilization/types.ts';
import { BuildingInstance } from '../core/civilization/buildingTypes.ts';
import { CivilizationState } from '../core/civilization/civilizationState.ts';
import { SupportedLocale } from '../i18n/types.ts';
import { MusicPlayerState, MusicTrack, RepeatMode } from './music.ts';
import { QuestPeriod, QuestResetCountdown, QuestState } from './quests.ts';
import { ErrorParams } from './errors.ts';
import { Villager } from '../core/civilization/villager.ts';
import { ConstructionJob } from '../core/civilization/jobs.ts';
import { VillagerRole } from '../ui/components/civilization/spriteRegistry.ts';

export type MessageAction =
  | 'START_SESSION'
  | 'PAUSE_SESSION'
  | 'RESUME_SESSION'
  | 'GIVE_UP_SESSION'
  | 'FINISH_STOPWATCH'
  | 'ADVANCE_POMODORO_STAGE'
  | 'SKIP_POMODORO_BREAK'
  | 'GET_SESSION_STATE'
  | 'GET_PROFILES'
  | 'GET_ACTIVE_PROFILE'
  | 'SWITCH_PROFILE'
  | 'CREATE_PROFILE'
  | 'RENAME_PROFILE'
  | 'DELETE_PROFILE'
  | 'ADD_DOMAIN'
  | 'REMOVE_DOMAIN'
  | 'GET_ECONOMY'
  | 'GET_DAILY_STATS'
  | 'HEARTBEAT'
  | 'RESET_SESSION'
  | 'GET_CIVILIZATION_STATE'
  | 'PLACE_BUILDING'
  | 'REMOVE_BUILDING'
  | 'UPGRADE_BUILDING'
  | 'EXPAND_LAND'
  | 'RECRUIT_VILLAGER'
  | 'CANCEL_CONSTRUCTION_JOB'
  | 'SELECT_FOUNDER'
  | 'GET_QUEST_STATE'
  | 'CLAIM_QUEST_REWARD'
  | 'SET_LANGUAGE'
  | 'SET_CHIME_ENABLED'
  | 'SET_MUSIC_PLAYER_EXPANDED'
  | 'MUSIC_GET_STATE'
  | 'MUSIC_PLAY'
  | 'MUSIC_PAUSE'
  | 'MUSIC_RESUME'
  | 'MUSIC_STOP'
  | 'MUSIC_NEXT'
  | 'MUSIC_PREVIOUS'
  | 'MUSIC_SEEK'
  | 'MUSIC_SET_VOLUME'
  | 'MUSIC_SET_SHUFFLE'
  | 'MUSIC_SET_REPEAT'
  | 'MUSIC_REFRESH_CATALOG';

export interface StartSessionPayload {
  mode: SessionMode;
  targetMinutes: number; // 0 for Stopwatch
  profileId: string;
  pomodoroConfig?: PomodoroConfig;
  assignedJobIds?: readonly string[];
  autoContinueJobs?: boolean;
}

export interface SwitchProfilePayload {
  profileId: string;
}

export interface CreateProfilePayload {
  name: string;
  initialDomains?: string[];
}

export interface RenameProfilePayload {
  profileId: string;
  newName: string;
}

export interface DeleteProfilePayload {
  profileId: string;
  replacementActiveProfileId?: string;
}

export interface DomainModificationPayload {
  profileId: string;
  domainPattern: string;
}

export interface PlaceBuildingPayload {
  buildingDefinitionId: string;
  position: GridCoordinate;
}

export interface RemoveBuildingPayload {
  buildingInstanceId: string;
}

export interface UpgradeBuildingPayload {
  buildingId: string;
  expectedLevel: number;
}

export interface ExpandLandPayload {
  origin: GridCoordinate;
}

export interface RecruitVillagerPayload {
  role: VillagerRole;
}

export interface CancelConstructionJobPayload {
  jobId: string;
}

export interface SelectFounderPayload {
  role: VillagerRole;
}

export interface ClaimQuestRewardPayload {
  period: QuestPeriod;
  questId: string;
}

export interface SetLanguagePayload {
  language: SupportedLocale;
}

export interface SetChimeEnabledPayload {
  enabled: boolean;
}

export interface SetMusicPlayerExpandedPayload {
  expanded: boolean;
}

export interface MusicPlayPayload {
  trackId?: string;
}

export interface MusicSeekPayload {
  positionSec: number;
}

export interface MusicSetVolumePayload {
  volume: number;
  muted?: boolean;
}

export interface MusicSetShufflePayload {
  enabled: boolean;
}

export interface MusicSetRepeatPayload {
  mode: RepeatMode;
}

export interface MusicStateResponseData {
  state: MusicPlayerState;
  catalog: readonly MusicTrack[];
}

export interface PlaceBuildingResponseData {
  building: BuildingInstance;
  civilizationState: CivilizationState;
  economy: PlayerEconomy;
  job?: ConstructionJob;
}

export interface RemoveBuildingResponseData {
  removedBuildingId: string;
  civilizationState: CivilizationState;
  economy?: PlayerEconomy;
  refundedCoins?: number;
}

export interface UpgradeBuildingResponseData {
  civilizationState: CivilizationState;
  economy: PlayerEconomy;
  building: BuildingInstance;
  newLevel: number;
  cost: number;
  job?: ConstructionJob;
}

export interface ExpandLandResponseData {
  newChunk: GridCoordinate;
  civilizationState: CivilizationState;
  economy: PlayerEconomy;
  cost: number;
  job?: ConstructionJob;
}

export interface RecruitVillagerResponseData {
  villager: Villager;
  civilizationState: CivilizationState;
  economy: PlayerEconomy;
  cost: number;
}

export interface CancelConstructionJobResponseData {
  cancelledJobIds: readonly string[];
  refundedCoins: number;
  civilizationState: CivilizationState;
  economy: PlayerEconomy;
}

export interface SelectFounderResponseData {
  founderRole: VillagerRole;
  civilizationState: CivilizationState;
}

export interface GetQuestStateResponseData {
  questState: QuestState;
  resetCountdown: QuestResetCountdown;
  unclaimedCount: number;
}

export interface ClaimQuestRewardResponseData {
  questState: QuestState;
  economy: PlayerEconomy;
  claimedCoins: number;
  claimedXp: number;
}

export type ExtensionMessage =
  | { action: 'START_SESSION'; payload: StartSessionPayload }
  | { action: 'PAUSE_SESSION' }
  | { action: 'RESUME_SESSION' }
  | { action: 'GIVE_UP_SESSION' }
  | { action: 'FINISH_STOPWATCH' }
  | { action: 'ADVANCE_POMODORO_STAGE' }
  | { action: 'SKIP_POMODORO_BREAK' }
  | { action: 'GET_SESSION_STATE' }
  | { action: 'GET_PROFILES' }
  | { action: 'GET_ACTIVE_PROFILE' }
  | { action: 'SWITCH_PROFILE'; payload: SwitchProfilePayload }
  | { action: 'CREATE_PROFILE'; payload: CreateProfilePayload }
  | { action: 'RENAME_PROFILE'; payload: RenameProfilePayload }
  | { action: 'DELETE_PROFILE'; payload: DeleteProfilePayload }
  | { action: 'ADD_DOMAIN'; payload: DomainModificationPayload }
  | { action: 'REMOVE_DOMAIN'; payload: DomainModificationPayload }
  | { action: 'GET_ECONOMY' }
  | { action: 'GET_DAILY_STATS' }
  | { action: 'HEARTBEAT' }
  | { action: 'RESET_SESSION' }
  | { action: 'GET_CIVILIZATION_STATE' }
  | { action: 'PLACE_BUILDING'; payload: PlaceBuildingPayload }
  | { action: 'REMOVE_BUILDING'; payload: RemoveBuildingPayload }
  | { action: 'UPGRADE_BUILDING'; payload: UpgradeBuildingPayload }
  | { action: 'EXPAND_LAND'; payload: ExpandLandPayload }
  | { action: 'RECRUIT_VILLAGER'; payload: RecruitVillagerPayload }
  | { action: 'CANCEL_CONSTRUCTION_JOB'; payload: CancelConstructionJobPayload }
  | { action: 'SELECT_FOUNDER'; payload: SelectFounderPayload }
  | { action: 'GET_QUEST_STATE' }
  | { action: 'CLAIM_QUEST_REWARD'; payload: ClaimQuestRewardPayload }
  | { action: 'SET_LANGUAGE'; payload: SetLanguagePayload }
  | { action: 'SET_CHIME_ENABLED'; payload: SetChimeEnabledPayload }
  | { action: 'SET_MUSIC_PLAYER_EXPANDED'; payload: SetMusicPlayerExpandedPayload }
  | { action: 'MUSIC_GET_STATE' }
  | { action: 'MUSIC_PLAY'; payload?: MusicPlayPayload }
  | { action: 'MUSIC_PAUSE' }
  | { action: 'MUSIC_RESUME' }
  | { action: 'MUSIC_STOP' }
  | { action: 'MUSIC_NEXT' }
  | { action: 'MUSIC_PREVIOUS' }
  | { action: 'MUSIC_SEEK'; payload: MusicSeekPayload }
  | { action: 'MUSIC_SET_VOLUME'; payload: MusicSetVolumePayload }
  | { action: 'MUSIC_SET_SHUFFLE'; payload: MusicSetShufflePayload }
  | { action: 'MUSIC_SET_REPEAT'; payload: MusicSetRepeatPayload }
  | { action: 'MUSIC_REFRESH_CATALOG' };

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  errorParams?: ErrorParams;
}

export interface FullSessionStateResponse {
  currentSession: SessionSnapshot | null;
  activeProfile: FocusProfile | null;
  economy: PlayerEconomy;
  todayStats: DailyStatRecord | null;
  isBlockingActive: boolean;
  lifetimeFocusMinutes?: number;
  settings?: UserSettings;
}
