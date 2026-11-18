import { IStorageAdapter } from './storageInterface.ts';
import { STORAGE_KEYS } from './storageKeys.ts';
import { StorageMutex } from './storageMutex.ts';
import { SessionSnapshot } from '../types/session.ts';
import { FocusProfile } from '../types/profiles.ts';
import { PlayerEconomy } from '../types/economy.ts';
import { DailyStatRecord, UserSettings } from '../types/storageSchema.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
  validateCivilizationState,
  sanitizeCivilizationState,
} from '../core/civilization/civilizationState.ts';
import { GridMap } from '../core/civilization/gridMap.ts';
import { calculatePlayerLevel } from '../core/economy/levelSystem.ts';
import { CachedMusicCatalog, MusicPlayerState } from '../types/music.ts';
import { QuestState } from '../types/quests.ts';
import { sanitizeQuestState } from '../core/quests/questEngine.ts';

export class StorageManager {
  private mutex = new StorageMutex();

  constructor(
    private adapter: IStorageAdapter,
    private sessionAdapter?: IStorageAdapter
  ) {}

  // --- Session Lifecycle Marker ---

  async setSessionLifecycleMarker(sessionId: string): Promise<void> {
    const targetAdapter = this.sessionAdapter ?? this.adapter;
    await targetAdapter.set(STORAGE_KEYS.SESSION_MARKER, sessionId);
  }

  async getSessionLifecycleMarker(): Promise<string | null> {
    const targetAdapter = this.sessionAdapter ?? this.adapter;
    const marker = await targetAdapter.get<string>(STORAGE_KEYS.SESSION_MARKER);
    return marker ?? null;
  }

  async clearSessionLifecycleMarker(): Promise<void> {
    const targetAdapter = this.sessionAdapter ?? this.adapter;
    await targetAdapter.remove(STORAGE_KEYS.SESSION_MARKER);
  }

  /**
   * Run a read-modify-write operation atomically under mutex lock
   */
  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    return this.mutex.runExclusive(task);
  }

  // --- Session Storage ---

  async getCurrentSession(): Promise<SessionSnapshot | null> {
    const session = await this.adapter.get<SessionSnapshot>(STORAGE_KEYS.CURRENT_SESSION);
    return session ?? null;
  }

  async setCurrentSession(session: SessionSnapshot | null): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.CURRENT_SESSION, session);
  }

  async updateCurrentSession(
    updater: (current: SessionSnapshot | null) => SessionSnapshot | null
  ): Promise<SessionSnapshot | null> {
    return this.mutex.runExclusive(async () => {
      const current = await this.getCurrentSession();
      const updated = updater(current);
      await this.setCurrentSession(updated);
      return updated;
    });
  }

  // --- Economy Storage ---

  async getEconomy(): Promise<PlayerEconomy> {
    const economy = await this.adapter.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY);
    if (!economy) {
      return { focusCoins: 0, totalXP: 0, level: 1 };
    }
    return {
      ...economy,
      level: economy.level ?? calculatePlayerLevel(economy.totalXP ?? 0),
    };
  }

  async setEconomy(economy: PlayerEconomy): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.ECONOMY, economy);
  }

  async updateEconomy(
    updater: (current: PlayerEconomy) => PlayerEconomy
  ): Promise<PlayerEconomy> {
    return this.mutex.runExclusive(async () => {
      const current = await this.getEconomy();
      const updated = updater(current);
      await this.setEconomy(updated);
      return updated;
    });
  }

  // --- Profiles Storage ---

  async getProfiles(): Promise<FocusProfile[]> {
    const profiles = await this.adapter.get<FocusProfile[]>(STORAGE_KEYS.PROFILES);
    return profiles ?? [];
  }

  async setProfiles(profiles: FocusProfile[]): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.PROFILES, profiles);
  }

  async getActiveProfileId(): Promise<string> {
    const id = await this.adapter.get<string>(STORAGE_KEYS.ACTIVE_PROFILE_ID);
    return id ?? '';
  }

  async setActiveProfileId(profileId: string): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.ACTIVE_PROFILE_ID, profileId);
  }

  // --- Daily Stats Storage ---

  async getDailyStats(): Promise<Record<string, DailyStatRecord>> {
    const stats = await this.adapter.get<Record<string, DailyStatRecord>>(STORAGE_KEYS.DAILY_STATS);
    return stats ?? {};
  }

  async setDailyStats(stats: Record<string, DailyStatRecord>): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.DAILY_STATS, stats);
  }

  async recordDailyFocus(
    date: string,
    delta: {
      focusMinutes: number;
      isCompleted: boolean;
      isAbandoned: boolean;
      coins: number;
      xp: number;
    }
  ): Promise<DailyStatRecord> {
    return this.mutex.runExclusive(async () => {
      const allStats = await this.getDailyStats();
      const existing = allStats[date] ?? {
        date,
        totalFocusMinutes: 0,
        completedSessions: 0,
        abandonedSessions: 0,
        coinsEarned: 0,
        xpEarned: 0,
      };

      const updated: DailyStatRecord = {
        date,
        totalFocusMinutes: Math.max(0, existing.totalFocusMinutes + delta.focusMinutes),
        completedSessions: existing.completedSessions + (delta.isCompleted ? 1 : 0),
        abandonedSessions: existing.abandonedSessions + (delta.isAbandoned ? 1 : 0),
        coinsEarned: Math.max(0, existing.coinsEarned + delta.coins),
        xpEarned: Math.max(0, existing.xpEarned + delta.xp),
      };

      allStats[date] = updated;
      await this.setDailyStats(allStats);
      return updated;
    });
  }

  /**
   * Internal implementation that performs the batch commit without re-acquiring the mutex.
   * Used when already executing within an outer runExclusive transaction block.
   */
  async commitSessionOutcomeInternal(params: {
    session: SessionSnapshot;
    economyDelta?: { coins: number; xp: number };
    dailyStatDelta?: {
      date: string;
      focusMinutes: number;
      isCompleted: boolean;
      isAbandoned: boolean;
      coins: number;
      xp: number;
    };
  }): Promise<{
    session: SessionSnapshot;
    economy: PlayerEconomy;
    dailyStats: Record<string, DailyStatRecord>;
  }> {
    const items: Record<string, unknown> = {
      [STORAGE_KEYS.CURRENT_SESSION]: params.session,
    };

    let finalEconomy: PlayerEconomy;
    if (params.economyDelta && (params.economyDelta.coins !== 0 || params.economyDelta.xp !== 0)) {
      const currentEconomy = await this.getEconomy();
      const newTotalXP = Math.max(0, currentEconomy.totalXP + params.economyDelta.xp);
      finalEconomy = {
        ...currentEconomy,
        focusCoins: Math.max(0, currentEconomy.focusCoins + params.economyDelta.coins),
        totalXP: newTotalXP,
        level: calculatePlayerLevel(newTotalXP),
      };
      items[STORAGE_KEYS.ECONOMY] = finalEconomy;
    } else {
      finalEconomy = await this.getEconomy();
    }

    let finalDailyStats: Record<string, DailyStatRecord>;
    if (params.dailyStatDelta) {
      const allStats = await this.getDailyStats();
      const { date, focusMinutes, isCompleted, isAbandoned, coins, xp } = params.dailyStatDelta;
      const existing = allStats[date] ?? {
        date,
        totalFocusMinutes: 0,
        completedSessions: 0,
        abandonedSessions: 0,
        coinsEarned: 0,
        xpEarned: 0,
      };

      allStats[date] = {
        date,
        totalFocusMinutes: Math.max(0, existing.totalFocusMinutes + focusMinutes),
        completedSessions: existing.completedSessions + (isCompleted ? 1 : 0),
        abandonedSessions: existing.abandonedSessions + (isAbandoned ? 1 : 0),
        coinsEarned: Math.max(0, existing.coinsEarned + coins),
        xpEarned: Math.max(0, existing.xpEarned + xp),
      };
      items[STORAGE_KEYS.DAILY_STATS] = allStats;
      finalDailyStats = allStats;
    } else {
      finalDailyStats = await this.getDailyStats();
    }

    await this.adapter.setMultiple(items);

    return {
      session: params.session,
      economy: finalEconomy,
      dailyStats: finalDailyStats,
    };
  }

  /**
   * Atomically commits session state changes together with optional economy and daily stats updates
   * in a single batch write (setMultiple) under mutex lock.
   */
  async commitSessionOutcome(
    params: Parameters<typeof this.commitSessionOutcomeInternal>[0]
  ): Promise<{
    session: SessionSnapshot;
    economy: PlayerEconomy;
    dailyStats: Record<string, DailyStatRecord>;
  }> {
    return this.mutex.runExclusive(() => this.commitSessionOutcomeInternal(params));
  }

  // --- Settings Storage ---

  async getSettings(): Promise<UserSettings> {
    const settings = await this.adapter.get<UserSettings>(STORAGE_KEYS.SETTINGS);
    return settings ?? { soundEnabled: false, notificationsEnabled: true }; // soundEnabled deprecated/ignored; chimeEnabled undefined means enabled
  }

  async setSettings(settings: UserSettings): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.SETTINGS, settings);
  }

  async updateSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
    return this.mutex.runExclusive(async () => {
      const current = await this.getSettings();
      const updated: UserSettings = {
        ...current,
        ...partial,
      };
      await this.adapter.set(STORAGE_KEYS.SETTINGS, updated);
      return updated;
    });
  }

  // --- Internal Storage Accessors (No Mutex, No Recovery, for use inside critical sections) ---

  private async getEconomyInternal(): Promise<PlayerEconomy> {
    const economy = await this.adapter.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY);
    if (!economy) {
      return { focusCoins: 0, totalXP: 0, level: 1 };
    }
    return {
      ...economy,
      level: economy.level ?? calculatePlayerLevel(economy.totalXP ?? 0),
    };
  }

  private async getCivilizationStateInternal(): Promise<CivilizationState | null> {
    const raw = await this.adapter.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);
    return raw ?? null;
  }

  private async getDailyStatsInternal(): Promise<Record<string, DailyStatRecord>> {
    const stats = await this.adapter.get<Record<string, DailyStatRecord>>(STORAGE_KEYS.DAILY_STATS);
    return stats ?? {};
  }

  // --- Civilization Storage ---

  async getCivilizationState(): Promise<CivilizationState> {
    const raw = await this.adapter.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);
    return raw ?? createInitialCivilizationState();
  }

  /**
   * @deprecated Reserved for storage migrations and test harness seeding only.
   * Runtime code must use executeCivilizationTransaction.
   */
  async setCivilizationState(state: CivilizationState): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.CIVILIZATION, state);
  }

  /**
   * Updates civilization state atomically under mutex lock.
   * Receives an updater callback executed strictly against the fresh, locked state.
   * Delegates to executeCivilizationTransaction to guarantee validation and rollback safety.
   */
  async updateCivilizationState(
    updater: (current: CivilizationState) => CivilizationState
  ): Promise<CivilizationState> {
    const tx = await this.executeCivilizationTransaction(({ civilization }) => {
      const updated = updater(civilization);
      return {
        result: updated,
        nextCivilization: updated,
        deductCoins: 0,
      };
    });
    return tx.civilization;
  }

  /**
   * Generalized atomic transaction for Civilization mutations:
   * Acquires StorageMutex lock BEFORE reading any state, guaranteeing
   * that state inspection, validation, candidate calculation, and commit
   * happen in a single, strictly serialized critical section.
   *
   * Includes comprehensive invariant checking, IEEE-754 exact subtraction,
   * synchronous onCommitted hook under lock, and transparent rollback compensation.
   */
  async executeCivilizationTransaction<T>(
    operation: (
      ctx: CivilizationTransactionContext
    ) => Promise<CivilizationTransactionOutcome<T>> | CivilizationTransactionOutcome<T>
  ): Promise<{ result: T; civilization: CivilizationState; economy: PlayerEconomy }> {
    return this.mutex.runExclusive(async () => {
      // 1. Read fresh states INSIDE the critical section via internal accessors (no mutex re-acquisition)
      const [currentEconomy, rawCiv, dailyStats] = await Promise.all([
        this.getEconomyInternal(),
        this.getCivilizationStateInternal(),
        this.getDailyStatsInternal(),
      ]);

      // 1.1 Invariant: Validate economy loaded from storage
      if (
        typeof currentEconomy !== 'object' ||
        currentEconomy === null ||
        typeof currentEconomy.focusCoins !== 'number' ||
        !Number.isFinite(currentEconomy.focusCoins) ||
        currentEconomy.focusCoins < 0 ||
        typeof currentEconomy.totalXP !== 'number' ||
        !Number.isFinite(currentEconomy.totalXP) ||
        typeof currentEconomy.level !== 'number' ||
        !Number.isInteger(currentEconomy.level) ||
        currentEconomy.level < 1
      ) {
        throw new Error('Corrupt economy state: invalid balance, XP, or player level');
      }

      // 1.2 Detect if raw data in storage was corrupted and requires in-place healing
      const isStorageCorrupted = Boolean(rawCiv && !sanitizeCivilizationState(rawCiv));
      const currentCivilization =
        sanitizeCivilizationState(rawCiv) ?? createInitialCivilizationState();
      const gridMap = GridMap.fromSnapshot(currentCivilization.grid);

      // 2. Execute mutation logic against the fresh, locked snapshot
      const outcome = await operation({
        economy: currentEconomy,
        civilization: currentCivilization,
        dailyStats,
        gridMap,
      });

      if (typeof outcome !== 'object' || outcome === null) {
        throw new Error('Civilization transaction operation must return an outcome object');
      }

      // 3. Compute final economy with rigorous input validation & IEEE-754 precision
      let finalEconomy = currentEconomy;
      if (outcome.deductCoins !== undefined && outcome.deductCoins !== null) {
        if (typeof outcome.deductCoins !== 'number' || !Number.isFinite(outcome.deductCoins)) {
          throw new Error(
            `Invalid deductCoins: expected finite number, received ${String(outcome.deductCoins)}`
          );
        }
        if (outcome.deductCoins < 0) {
          throw new Error(
            `Invalid deductCoins: cannot be negative, received ${outcome.deductCoins}`
          );
        }
        if (outcome.deductCoins > 0) {
          if (currentEconomy.focusCoins < outcome.deductCoins) {
            throw new Error(
              `Insufficient coins: requires ${outcome.deductCoins}, has ${currentEconomy.focusCoins}`
            );
          }
          const exactDeductedBalance = currentEconomy.focusCoins - outcome.deductCoins;
          if (exactDeductedBalance < 0 || !Number.isFinite(exactDeductedBalance)) {
            throw new Error(
              `Economy balance invariant violated: balance would become ${exactDeductedBalance}`
            );
          }
          finalEconomy = {
            ...currentEconomy,
            focusCoins: exactDeductedBalance,
          };
        }
      }

      // 4. Validate final civilization state if modified
      const finalCivilization = outcome.nextCivilization ?? currentCivilization;
      if (outcome.nextCivilization) {
        const validation = validateCivilizationState(finalCivilization);
        if (!validation.isValid) {
          throw new Error(`Civilization state validation failed: ${validation.errors.join('; ')}`);
        }
      }

      // 5. Atomic commit of all modified states with rollback compensation
      const itemsToSet: Record<string, unknown> = {};
      let hasChanges = false;

      // Commit civilization if mutated OR if storage held corrupt data that was healed in-place
      if (outcome.nextCivilization || isStorageCorrupted) {
        itemsToSet[STORAGE_KEYS.CIVILIZATION] = finalCivilization;
        hasChanges = true;
      }
      if (outcome.deductCoins && outcome.deductCoins > 0) {
        itemsToSet[STORAGE_KEYS.ECONOMY] = finalEconomy;
        hasChanges = true;
      }

      if (hasChanges) {
        try {
          await this.adapter.setMultiple(itemsToSet);
        } catch (writeError) {
          // Rollback compensation: attempt to restore previous exact state on adapter write failure
          let rollbackError: unknown = null;
          try {
            await this.adapter.setMultiple({
              [STORAGE_KEYS.ECONOMY]: currentEconomy,
              [STORAGE_KEYS.CIVILIZATION]: currentCivilization,
            });
          } catch (rbErr) {
            rollbackError = rbErr;
          }

          if (rollbackError) {
            const rbMsg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            const wMsg = writeError instanceof Error ? writeError.message : String(writeError);
            throw new Error(
              `Transaction write failed: "${wMsg}". Critical: Rollback compensation also failed: "${rbMsg}". Storage may be in an inconsistent state.`
            );
          }

          throw writeError;
        }
      }

      // 6. Synchronous post-commit hook: runs strictly BEFORE mutex lock is released
      try {
        outcome.onCommitted?.(finalCivilization, finalEconomy);
      } catch (hookError) {
        console.error('Civilization transaction onCommitted hook error:', hookError);
      }

      return {
        result: outcome.result,
        civilization: finalCivilization,
        economy: finalEconomy,
      };
    });
  }

  // --- Music Player State Storage (metadata & prefs only; never stores binary MP3 blobs) ---

  async getMusicState(): Promise<MusicPlayerState | null> {
    const state = await this.adapter.get<MusicPlayerState>(STORAGE_KEYS.MUSIC_STATE);
    return state ?? null;
  }

  async setMusicState(state: MusicPlayerState): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.MUSIC_STATE, state);
  }

  async getMusicCatalogCache(): Promise<CachedMusicCatalog | null> {
    const cache = await this.adapter.get<CachedMusicCatalog>(STORAGE_KEYS.MUSIC_CATALOG_CACHE);
    return cache ?? null;
  }

  async setMusicCatalogCache(cache: CachedMusicCatalog): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.MUSIC_CATALOG_CACHE, cache);
  }

  async clearMusicCatalogCache(): Promise<void> {
    await this.adapter.remove(STORAGE_KEYS.MUSIC_CATALOG_CACHE);
  }

  // --- Quests Storage (Schema v3) ---

  async getQuests(nowMs: number = Date.now()): Promise<QuestState> {
    const raw = await this.adapter.get<unknown>(STORAGE_KEYS.QUESTS);
    return sanitizeQuestState(raw, nowMs);
  }

  async setQuests(state: QuestState): Promise<void> {
    await this.adapter.set(STORAGE_KEYS.QUESTS, state);
  }

  async updateQuests(
    updater: (current: QuestState) => QuestState,
    nowMs: number = Date.now()
  ): Promise<QuestState> {
    return this.mutex.runExclusive(async () => {
      const current = await this.getQuests(nowMs);
      const updated = sanitizeQuestState(updater(current), nowMs);
      await this.setQuests(updated);
      return updated;
    });
  }
}

export interface CivilizationTransactionContext {
  readonly economy: PlayerEconomy;
  readonly civilization: CivilizationState;
  readonly dailyStats: Record<string, DailyStatRecord>;
  readonly gridMap: GridMap;
}

export interface CivilizationTransactionOutcome<T> {
  readonly result: T;
  readonly nextCivilization?: CivilizationState;
  readonly deductCoins?: number;
  readonly onCommitted?: (committedCivilization: CivilizationState, committedEconomy: PlayerEconomy) => void;
}
