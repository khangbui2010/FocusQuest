import { Migration } from './types.ts';
import { IStorageAdapter } from '../storageInterface.ts';
import { STORAGE_KEYS } from '../storageKeys.ts';
import { FocusProfile } from '../../types/profiles.ts';
import { PlayerEconomy } from '../../types/economy.ts';
import { DailyStatRecord, UserSettings } from '../../types/storageSchema.ts';
import { SessionSnapshot } from '../../types/session.ts';

export const INITIAL_PROFILES: FocusProfile[] = [
  {
    id: 'profile-study-research',
    name: 'Study & Research',
    // Domain list remains EMPTY until explicitly reviewed and approved by PM
    allowedDomains: [],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'profile-deep-work-coding',
    name: 'Deep Work / Coding',
    // Domain list remains EMPTY until explicitly reviewed and approved by PM
    allowedDomains: [],
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export const INITIAL_ECONOMY: PlayerEconomy = {
  focusCoins: 0,
  totalXP: 0,
  level: 1,
};

export const INITIAL_SETTINGS: UserSettings = {
  soundEnabled: false,          // deprecated, ignored, kept for backward compatibility
  notificationsEnabled: true,   // Chrome Notifications
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Preserve a numeric amount exactly as stored (including decimals).
 * Corrupt values are replaced with a safe fallback instead of crashing.
 */
function sanitizeAmount(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
  return fallback;
}

/**
 * Rebuild the economy object without discarding existing Coins/XP.
 * Used only when migrating legacy storage that has no schema version yet.
 */
function sanitizeEconomy(raw: unknown): PlayerEconomy {
  if (!isRecord(raw)) {
    return { ...INITIAL_ECONOMY };
  }
  return {
    focusCoins: sanitizeAmount(raw.focusCoins),
    totalXP: sanitizeAmount(raw.totalXP),
    level:
      typeof raw.level === 'number' && Number.isFinite(raw.level) && raw.level >= 1
        ? raw.level
        : INITIAL_ECONOMY.level,
  };
}

export const v1_initialSchema: Migration = {
  version: 1,
  description: 'Initial schema setup for Focus Quest MVP v1.0',
  async up(storage: IStorageAdapter): Promise<void> {
    const existingVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
    if (existingVersion !== undefined && existingVersion >= 1) {
      return; // Already initialized or newer
    }

    // Legacy installations may already hold coins, XP, stats, or an active
    // session even though no schema version was written. Seed only what is
    // missing so a migration can never reset real user progress.
    const [
      currentSession,
      profiles,
      activeProfileId,
      economy,
      dailyStats,
      settings,
    ] = await Promise.all([
      storage.get<SessionSnapshot | null>(STORAGE_KEYS.CURRENT_SESSION),
      storage.get<FocusProfile[]>(STORAGE_KEYS.PROFILES),
      storage.get<string>(STORAGE_KEYS.ACTIVE_PROFILE_ID),
      storage.get<unknown>(STORAGE_KEYS.ECONOMY),
      storage.get<Record<string, DailyStatRecord>>(STORAGE_KEYS.DAILY_STATS),
      storage.get<UserSettings>(STORAGE_KEYS.SETTINGS),
    ]);

    await storage.setMultiple({
      [STORAGE_KEYS.SCHEMA_VERSION]: 1,
      [STORAGE_KEYS.CURRENT_SESSION]:
        currentSession === undefined ? null : currentSession,
      [STORAGE_KEYS.PROFILES]:
        Array.isArray(profiles) && profiles.length > 0 ? profiles : INITIAL_PROFILES,
      [STORAGE_KEYS.ACTIVE_PROFILE_ID]:
        typeof activeProfileId === 'string' && activeProfileId.length > 0
          ? activeProfileId
          : INITIAL_PROFILES[0].id,
      [STORAGE_KEYS.ECONOMY]: sanitizeEconomy(economy),
      [STORAGE_KEYS.DAILY_STATS]: isRecord(dailyStats) ? dailyStats : {},
      [STORAGE_KEYS.SETTINGS]: isRecord(settings) ? settings : INITIAL_SETTINGS,
    });
  },
};
