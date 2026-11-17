/**
 * Storage keys constant mapping for chrome.storage.local
 */

export const STORAGE_KEYS = {
  SCHEMA_VERSION: 'fq_schema_version',
  CURRENT_SESSION: 'fq_current_session',
  PROFILES: 'fq_profiles',
  ACTIVE_PROFILE_ID: 'fq_active_profile_id',
  ECONOMY: 'fq_economy',
  DAILY_STATS: 'fq_daily_stats',
  SETTINGS: 'fq_settings',
  SESSION_MARKER: 'fq_session_active_marker',
  CIVILIZATION: 'fq_civilization',
  MUSIC_STATE: 'fq_music_state',
  MUSIC_CATALOG_CACHE: 'fq_music_catalog_cache',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
