import { SessionMode, SessionSnapshot, PomodoroConfig } from './session.ts';
import { FocusProfile } from './profiles.ts';
import { PlayerEconomy } from './economy.ts';
import { DailyStatRecord, UserSettings } from './storageSchema.ts';
import { GridCoordinate } from '../core/civilization/types.ts';
import { BuildingInstance } from '../core/civilization/buildingTypes.ts';
import { CivilizationState } from '../core/civilization/civilizationState.ts';
import { SupportedLocale } from '../i18n/types.ts';
import { MusicPlayerState, MusicTrack, RepeatMode } from './music.ts';

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
  | 'EXPAND_LAND'
  | 'SET_LANGUAGE'
  | 'SET_CHIME_ENABLED'
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
  | 'MUSIC_SET_SYNC_WITH_SESSION';

export interface StartSessionPayload {
  mode: SessionMode;
  targetMinutes: number; // 0 for Stopwatch
  profileId: string;
  pomodoroConfig?: PomodoroConfig;
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

export interface ExpandLandPayload {
  origin: GridCoordinate;
}

export interface SetLanguagePayload {
  language: SupportedLocale;
}

export interface SetChimeEnabledPayload {
  enabled: boolean;
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

export interface MusicSetSyncWithSessionPayload {
  enabled: boolean;
}

export interface MusicStateResponseData {
  state: MusicPlayerState;
  catalog: readonly MusicTrack[];
}

export interface PlaceBuildingResponseData {
  building: BuildingInstance;
  civilizationState: CivilizationState;
  economy: PlayerEconomy;
}

export interface RemoveBuildingResponseData {
  removedBuildingId: string;
  civilizationState: CivilizationState;
}

export interface ExpandLandResponseData {
  newChunk: GridCoordinate;
  civilizationState: CivilizationState;
  economy: PlayerEconomy;
  cost: number;
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
  | { action: 'EXPAND_LAND'; payload: ExpandLandPayload }
  | { action: 'SET_LANGUAGE'; payload: SetLanguagePayload }
  | { action: 'SET_CHIME_ENABLED'; payload: SetChimeEnabledPayload }
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
  | { action: 'MUSIC_SET_SYNC_WITH_SESSION'; payload: MusicSetSyncWithSessionPayload };

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
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
