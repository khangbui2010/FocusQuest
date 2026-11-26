import { SessionSnapshot } from './session.ts';
import { PlayerEconomy } from './economy.ts';
import { FocusProfile } from './profiles.ts';
import { CivilizationState } from '../core/civilization/civilizationState.ts';
import { SupportedLocale } from '../i18n/types.ts';
import { QuestState } from './quests.ts';
import { AwardState } from './awards.ts';

export interface DailyStatRecord {
  date: string;               // ISO date string 'YYYY-MM-DD'
  totalFocusMinutes: number;  // Valid focus minutes worked that day (all sessions, including give-up)
  completedSessions: number;  // Number of sessions finished successfully
  abandonedSessions: number;  // Number of sessions abandoned/interrupted
  coinsEarned: number;        // Coins earned that day
  xpEarned: number;           // XP earned that day
}

export interface UserSettings {
  /** @deprecated Ignored in runtime; kept for backward schema/migration compatibility. */
  soundEnabled: boolean;            // deprecated, ignored, kept for backward compatibility
  notificationsEnabled: boolean;    // Chrome Notifications
  language?: SupportedLocale;       // UI & notification language ('en' | 'vi')
  chimeEnabled?: boolean;           // Web Audio phase transition chimes (undefined means enabled)
  musicEnabled?: boolean;           // Legacy field ignored at runtime; playback state lives in MUSIC_STATE
  musicPlayerExpanded?: boolean;    // Persist MusicPlayerSheet expanded/collapsed state (default false)
}

export interface StorageSchema {
  schemaVersion: number;
  currentSession: SessionSnapshot | null;
  profiles: FocusProfile[];
  activeProfileId: string;
  economy: PlayerEconomy;
  dailyStats: Record<string, DailyStatRecord>; // Keyed by 'YYYY-MM-DD'
  settings: UserSettings;
  civilization?: CivilizationState;
  quests?: QuestState;
  awards?: AwardState;
}
