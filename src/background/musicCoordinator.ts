import { StorageManager } from '../storage/storageManager.ts';
import { IOffscreenAdapter, AudioStatusSnapshot } from '../chrome/offscreenAdapter.ts';
import {
  FetchLike,
  LOFI_BASE_URL,
  LOFI_CATALOG_CACHE_TTL_MS,
  LOFI_CATALOG_URL,
  fetchRemoteMusicCatalog,
  getTrackById,
  isCatalogCacheFresh,
  resolveTrackStreamUrl,
  validateMusicCatalog,
} from '../data/musicCatalog.ts';
import {
  MusicErrorCode,
  MusicIntent,
  MusicPlayerState,
  MusicTrack,
  OffscreenMusicEvent,
  RepeatMode,
} from '../types/music.ts';
import { SessionSnapshot } from '../types/session.ts';

export interface MusicCoordinatorOptions {
  readonly initialCatalog?: readonly MusicTrack[];
  readonly catalogUrl?: string;
  readonly baseUrl?: string;
  readonly cacheTtlMs?: number;
  readonly fetchFn?: FetchLike;
  readonly nowFn?: () => number;
}

/**
 * Pure intent derivation helper mapping Focus Session state
 * to the authoritative target music lifecycle intent ('keep' | 'stop').
 * - Active session states (RUNNING focus/short break/long break, PAUSED): 'keep'
 *   (session pause, resume, and breaks never alter user playback; never auto-plays).
 * - Terminal or absent/idle session (null, IDLE, COMPLETED, ABANDONED, INTERRUPTED): 'stop'.
 */
export function deriveMusicIntent(snapshot: SessionSnapshot | null): MusicIntent {
  if (!snapshot) {
    return 'stop';
  }

  if (snapshot.status === 'RUNNING' || snapshot.status === 'PAUSED') {
    return 'keep';
  }

  return 'stop';
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.max(0, Math.min(1, value));
}

function clampPosition(positionSec: number, durationSec: number | null): number {
  if (!Number.isFinite(positionSec) || positionSec < 0) return 0;
  if (durationSec !== null && Number.isFinite(durationSec) && durationSec > 0) {
    return Math.min(durationSec, positionSec);
  }
  return positionSec;
}

function getTrackDurationSec(track: MusicTrack | null | undefined): number | null {
  if (!track) return null;
  const dur = track.durationSec ?? track.duration;
  return typeof dur === 'number' && Number.isFinite(dur) && dur > 0 ? dur : null;
}

function extractMusicErrorCode(err: unknown): MusicErrorCode {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (
      code === 'autoplay_blocked' ||
      code === 'network' ||
      code === 'decode' ||
      code === 'unknown'
    ) {
      return code;
    }
  }
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('autoplay') || msg.includes('notallowed') || msg.includes('gesture')) {
    return 'autoplay_blocked';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('http')) {
    return 'network';
  }
  if (msg.includes('decode') || msg.includes('format')) {
    return 'decode';
  }
  return 'unknown';
}

/**
 * Deterministic order builder for shuffle mode (avoids raw Math.random while producing
 * a varied queue order that rotates cleanly around the current track).
 */
export function buildShuffledOrder(
  catalog: readonly MusicTrack[],
  anchorTrackId: string | null,
  seed: number
): string[] {
  const ids = catalog.map((t) => t.id);
  if (ids.length <= 1) return ids;

  const remaining = anchorTrackId ? ids.filter((id) => id !== anchorTrackId) : [...ids];
  let state = Math.abs(Math.floor(seed)) || 1337;
  for (let i = remaining.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = remaining[i];
    remaining[i] = remaining[j];
    remaining[j] = tmp;
  }

  return anchorTrackId && ids.includes(anchorTrackId)
    ? [anchorTrackId, ...remaining]
    : remaining;
}

export function createDefaultMusicPlayerState(
  catalog: readonly MusicTrack[] = []
): MusicPlayerState {
  const firstTrack = catalog[0] ?? null;
  return {
    status: 'IDLE',
    currentTrackId: firstTrack ? firstTrack.id : null,
    positionSec: 0,
    durationSec: getTrackDurationSec(firstTrack),
    volume: 0.7,
    muted: false,
    shuffle: false,
    repeatMode: 'off',
    shuffledOrder: catalog.map((t) => t.id),
    musicEnabled: false,
    catalogUpdatedAt: null,
    catalogSkippedCount: 0,
    lastUpdatedAt: Date.now(),
    lastError: null,
    lastErrorCode: null,
  };
}

export class MusicCoordinator {
  private isInitialized = false;
  private initPromise: Promise<MusicPlayerState> | null = null;
  private queueChain: Promise<unknown> = Promise.resolve();
  private state: MusicPlayerState;
  private catalog: readonly MusicTrack[] = [];
  private hasPinnedCatalog = false;
  private catalogUrl: string = LOFI_CATALOG_URL;
  private baseUrl: string = LOFI_BASE_URL;
  private cacheTtlMs: number = LOFI_CATALOG_CACHE_TTL_MS;
  private fetchFn?: FetchLike;
  private nowFn: () => number = () => Date.now();

  constructor(
    private storage: StorageManager,
    private offscreen: IOffscreenAdapter,
    catalogOrOptions?: readonly MusicTrack[] | MusicCoordinatorOptions,
    options?: MusicCoordinatorOptions
  ) {
    const resolvedOptions: MusicCoordinatorOptions | undefined = Array.isArray(catalogOrOptions)
      ? options
      : (catalogOrOptions as MusicCoordinatorOptions | undefined);
    if (Array.isArray(catalogOrOptions)) {
      this.hasPinnedCatalog = true;
      this.catalog = catalogOrOptions;
    } else if (resolvedOptions?.initialCatalog) {
      this.hasPinnedCatalog = true;
      this.catalog = resolvedOptions.initialCatalog;
    }

    if (resolvedOptions?.catalogUrl) this.catalogUrl = resolvedOptions.catalogUrl;
    if (resolvedOptions?.baseUrl) this.baseUrl = resolvedOptions.baseUrl;
    if (typeof resolvedOptions?.cacheTtlMs === 'number') {
      this.cacheTtlMs = resolvedOptions.cacheTtlMs;
    }
    if (resolvedOptions?.fetchFn) this.fetchFn = resolvedOptions.fetchFn;
    if (resolvedOptions?.nowFn) this.nowFn = resolvedOptions.nowFn;

    if (this.catalog.length > 0) {
      const validation = validateMusicCatalog(this.catalog);
      if (!validation.valid) {
        console.warn('[MusicCoordinator] Catalog validation warnings:', validation.errors);
      }
    }
    this.state = createDefaultMusicPlayerState(this.catalog);
  }

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queueChain.then(task, task);
    this.queueChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  getCatalog(): readonly MusicTrack[] {
    return this.catalog;
  }

  private normalizeStateAgainstCatalog(
    raw: Partial<MusicPlayerState> | null,
    preserveEmptyTrackId: boolean = false
  ): MusicPlayerState {
    const defaults = createDefaultMusicPlayerState(this.catalog);
    if (!raw || typeof raw !== 'object') {
      return defaults;
    }

    const catalogIds = new Set(this.catalog.map((t) => t.id));
    const matchedTrack =
      raw.currentTrackId && catalogIds.has(raw.currentTrackId)
        ? getTrackById(raw.currentTrackId, this.catalog)
        : this.catalog[0] ?? null;

    const validOrder = Array.isArray(raw.shuffledOrder)
      ? raw.shuffledOrder.filter((id) => catalogIds.has(id))
      : [];
    const missingIds = this.catalog.map((t) => t.id).filter((id) => !validOrder.includes(id));
    const normalizedOrder =
      validOrder.length > 0 ? [...validOrder, ...missingIds] : this.catalog.map((t) => t.id);

    const repeatMode: RepeatMode =
      raw.repeatMode === 'all' || raw.repeatMode === 'one' || raw.repeatMode === 'off'
        ? raw.repeatMode
        : 'off';

    const status = matchedTrack
      ? raw.status === 'PLAYING' ||
        raw.status === 'PAUSED' ||
        raw.status === 'STOPPED' ||
        raw.status === 'ERROR' ||
        raw.status === 'IDLE'
        ? raw.status
        : 'IDLE'
      : preserveEmptyTrackId && raw.status === 'ERROR'
      ? 'ERROR'
      : 'IDLE';

    const durationSec =
      typeof raw.durationSec === 'number' && Number.isFinite(raw.durationSec) && raw.durationSec > 0
        ? raw.durationSec
        : getTrackDurationSec(matchedTrack);

    const trackChanged = Boolean(
      this.catalog.length > 0 && raw.currentTrackId && matchedTrack?.id !== raw.currentTrackId
    );

    return {
      status,
      currentTrackId: matchedTrack
        ? matchedTrack.id
        : preserveEmptyTrackId
        ? raw.currentTrackId ?? null
        : null,
      positionSec: trackChanged
        ? 0
        : clampPosition(typeof raw.positionSec === 'number' ? raw.positionSec : 0, durationSec),
      durationSec,
      volume: typeof raw.volume === 'number' ? clampVolume(raw.volume) : defaults.volume,
      muted: Boolean(raw.muted),
      shuffle: Boolean(raw.shuffle),
      repeatMode,
      shuffledOrder: normalizedOrder,
      musicEnabled: status === 'PLAYING',
      catalogUpdatedAt:
        typeof raw.catalogUpdatedAt === 'string'
          ? raw.catalogUpdatedAt
          : defaults.catalogUpdatedAt ?? null,
      catalogSkippedCount:
        typeof raw.catalogSkippedCount === 'number'
          ? raw.catalogSkippedCount
          : defaults.catalogSkippedCount ?? 0,
      lastUpdatedAt: typeof raw.lastUpdatedAt === 'number' ? raw.lastUpdatedAt : this.nowFn(),
      lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
      lastErrorCode: raw.lastErrorCode ?? null,
    };
  }

  private async persistState(nextState: MusicPlayerState): Promise<MusicPlayerState> {
    this.state = {
      ...nextState,
      lastUpdatedAt: this.nowFn(),
    };
    await this.storage.setMusicState(this.state);
    return { ...this.state };
  }

  private async ensureCatalogLoaded(forceRefresh: boolean = false): Promise<{
    catalog: readonly MusicTrack[];
    fetched: boolean;
    error?: string;
  }> {
    if (this.hasPinnedCatalog && !forceRefresh) {
      return { catalog: this.catalog, fetched: false };
    }

    const now = this.nowFn();
    const rawCached = await this.storage.getMusicCatalogCache().catch(() => null);
    const cached =
      rawCached &&
      typeof rawCached === 'object' &&
      rawCached.schemaVersion === 1 &&
      Array.isArray(rawCached.tracks) &&
      rawCached.tracks.length > 0
        ? rawCached
        : null;

    if (!forceRefresh && cached && isCatalogCacheFresh(cached, now, this.cacheTtlMs)) {
      this.catalog = cached.tracks;
      if (!this.state.catalogUpdatedAt && cached.updatedAt) {
        this.state = {
          ...this.state,
          catalogUpdatedAt: cached.updatedAt,
          catalogSkippedCount: cached.skippedCount ?? this.state.catalogSkippedCount ?? 0,
        };
      }
      return { catalog: this.catalog, fetched: false };
    }

    const fetchImpl: FetchLike | undefined =
      this.fetchFn ?? (typeof fetch === 'function' ? (input, init) => fetch(input, init) : undefined);

    if (!fetchImpl) {
      if (cached?.tracks?.length) {
        this.catalog = cached.tracks;
      }
      return { catalog: this.catalog, fetched: false, error: 'Fetch API is unavailable.' };
    }

    try {
      const fresh = await fetchRemoteMusicCatalog(fetchImpl, this.catalogUrl, this.baseUrl);
      const stamped = { ...fresh, fetchedAt: now };
      await this.storage.setMusicCatalogCache(stamped).catch(() => undefined);
      this.catalog = stamped.tracks;
      this.state = this.normalizeStateAgainstCatalog(
        {
          ...this.state,
          catalogUpdatedAt: stamped.updatedAt,
          catalogSkippedCount: stamped.skippedCount ?? 0,
        }
      );
      return { catalog: this.catalog, fetched: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
        this.catalog = cached.tracks;
      }
      return { catalog: this.catalog, fetched: false, error: message };
    }
  }

  private getEffectiveQueueIds(): string[] {
    if (this.catalog.length === 0) return [];
    if (!this.state.shuffle) {
      return this.catalog.map((t) => t.id);
    }
    const catalogIds = new Set(this.catalog.map((t) => t.id));
    const filtered = this.state.shuffledOrder.filter((id) => catalogIds.has(id));
    const missing = this.catalog.map((t) => t.id).filter((id) => !filtered.includes(id));
    return [...filtered, ...missing];
  }

  private async startPlaybackInOffscreen(
    track: MusicTrack,
    positionSec: number
  ): Promise<MusicPlayerState> {
    try {
      const streamUrl = resolveTrackStreamUrl(track, this.baseUrl);
      await this.offscreen.ensureDocument();
      const snap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
        target: 'offscreen',
        action: 'MUSIC_PLAY',
        url: streamUrl,
        volume: this.state.volume,
        startAtSec: positionSec,
        trackId: track.id,
        muted: this.state.muted,
      });
      const resolvedDuration =
        snap?.duration ?? getTrackDurationSec(track) ?? this.state.durationSec ?? null;
      const resolvedPosition = snap?.currentTime ?? clampPosition(positionSec, resolvedDuration);
      return this.persistState({
        ...this.state,
        status: 'PLAYING',
        currentTrackId: track.id,
        positionSec: resolvedPosition,
        durationSec: resolvedDuration,
        musicEnabled: true,
        lastError: null,
        lastErrorCode: null,
      });
    } catch (err) {
      const code = extractMusicErrorCode(err);
      const trackDuration = getTrackDurationSec(track);
      return this.persistState({
        ...this.state,
        status: 'ERROR',
        currentTrackId: track.id,
        positionSec: clampPosition(positionSec, trackDuration),
        durationSec: trackDuration ?? this.state.durationSec ?? null,
        musicEnabled: false,
        lastError: err instanceof Error ? err.message : String(err),
        lastErrorCode: code,
      });
    }
  }

  /**
   * Rehydrate persisted music state on Service Worker startup / wake.
   * Synchronizes with live Offscreen Document if already running, or recovers
   * cleanly if SW restarted independently.
   */
  async ensureInitialized(): Promise<MusicPlayerState> {
    if (this.isInitialized) {
      return { ...this.state };
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.runExclusive(async () => {
      const persisted = await this.storage.getMusicState();

      const catalogResult = await this.ensureCatalogLoaded(false);
      this.state = this.normalizeStateAgainstCatalog(persisted, persisted === null);

      if (catalogResult.error && this.catalog.length === 0) {
        this.state = await this.persistState({
          ...this.state,
          status: 'ERROR',
          currentTrackId: null,
          positionSec: 0,
          durationSec: null,
          musicEnabled: false,
          lastError:
            'Unable to load online Lofi catalog. Check your internet connection and retry.',
          lastErrorCode: 'network',
        });
      } else if (
        !catalogResult.error &&
        this.catalog.length > 0 &&
        this.state.status === 'ERROR' &&
        this.state.lastErrorCode === 'network'
      ) {
        this.state = await this.persistState({
          ...this.state,
          status: 'IDLE',
          lastError: null,
          lastErrorCode: null,
        });
      }

      const hasOffscreen = await this.offscreen.hasDocument().catch(() => false);
      if (hasOffscreen) {
        try {
          const audioStatus = await this.offscreen.sendCommand<AudioStatusSnapshot>({
            target: 'offscreen',
            action: 'MUSIC_GET_STATUS',
          });
          if (
            audioStatus &&
            audioStatus.trackId &&
            getTrackById(audioStatus.trackId, this.catalog)
          ) {
            this.state = await this.persistState({
              ...this.state,
              currentTrackId: audioStatus.trackId,
              positionSec: audioStatus.currentTime,
              durationSec:
                audioStatus.duration ??
                getTrackDurationSec(getTrackById(audioStatus.trackId, this.catalog)) ??
                this.state.durationSec,
              status: audioStatus.isPlaying
                ? 'PLAYING'
                : this.state.status === 'STOPPED'
                ? 'STOPPED'
                : 'PAUSED',
              musicEnabled: audioStatus.isPlaying,
              lastError: null,
              lastErrorCode: null,
            });
          } else if (this.state.status === 'PLAYING') {
            this.state = await this.persistState({
              ...this.state,
              status: 'PAUSED',
              musicEnabled: false,
            });
          }
        } catch {
          // Preserve persisted metadata & position if offscreen query fails
        }
      } else if (this.state.status === 'PLAYING') {
        // Offscreen document was reclaimed while SW slept: resume playback at saved position
        const activeTrack = getTrackById(this.state.currentTrackId, this.catalog);
        if (activeTrack) {
          this.state = await this.startPlaybackInOffscreen(activeTrack, this.state.positionSec);
        } else {
          this.state = await this.persistState({
            ...this.state,
            status: 'IDLE',
            positionSec: 0,
            musicEnabled: false,
          });
        }
      }

      this.isInitialized = true;
      return { ...this.state };
    });

    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async refreshCatalog(force: boolean = true): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      const prevTrackId = this.state.currentTrackId;
      const wasPlaying = this.state.status === 'PLAYING';
      const wasPaused = this.state.status === 'PAUSED';
      const prevCatalogLen = this.catalog.length;
      const result = await this.ensureCatalogLoaded(force);

      if (result.error && result.catalog.length === 0) {
        return this.persistState({
          ...this.state,
          status: 'ERROR',
          currentTrackId: null,
          positionSec: 0,
          durationSec: null,
          musicEnabled: false,
          lastError:
            'Unable to load online Lofi catalog. Check your internet connection and retry.',
          lastErrorCode: 'network',
        });
      }

      if (result.fetched || this.catalog.length !== prevCatalogLen) {
        const normalized = this.normalizeStateAgainstCatalog(this.state);
        const clearedState: MusicPlayerState = {
          ...normalized,
          status:
            normalized.status === 'ERROR' && this.state.lastErrorCode === 'network'
              ? 'IDLE'
              : normalized.status,
          lastError:
            normalized.status === 'ERROR' && this.state.lastErrorCode === 'network'
              ? null
              : normalized.lastError,
          lastErrorCode:
            normalized.status === 'ERROR' && this.state.lastErrorCode === 'network'
              ? null
              : normalized.lastErrorCode,
        };

        const currentTrackDisappeared = Boolean(
          prevTrackId && !this.catalog.some((t) => t.id === prevTrackId)
        );

        if (currentTrackDisappeared) {
          const fallbackTrack = this.catalog[0] ?? null;
          if (!fallbackTrack) {
            return this.stopInternal();
          }
          if (wasPlaying) {
            this.state = {
              ...clearedState,
              currentTrackId: fallbackTrack.id,
              positionSec: 0,
              durationSec: getTrackDurationSec(fallbackTrack),
            };
            return this.startPlaybackInOffscreen(fallbackTrack, 0);
          }
          if (wasPaused) {
            const hasDoc = await this.offscreen.hasDocument().catch(() => false);
            if (hasDoc) {
              await this.offscreen.closeDocument().catch(() => undefined);
            }
          }
        }

        return this.persistState(clearedState);
      }
      return { ...this.state };
    });
  }

  async getState(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      if (!this.hasPinnedCatalog) {
        const result = await this.ensureCatalogLoaded(false);
        if (result.error && result.catalog.length === 0) {
          this.state = await this.persistState({
            ...this.state,
            status: 'ERROR',
            currentTrackId: null,
            positionSec: 0,
            durationSec: null,
            musicEnabled: false,
            lastError:
              'Unable to load online Lofi catalog. Check your internet connection and retry.',
            lastErrorCode: 'network',
          });
        } else if (result.fetched) {
          const normalized = this.normalizeStateAgainstCatalog(this.state);
          this.state = await this.persistState({
            ...normalized,
            status:
              normalized.status === 'ERROR' && this.state.lastErrorCode === 'network'
                ? 'IDLE'
                : normalized.status,
            lastError: null,
            lastErrorCode: null,
          });
        }
      }

      if (this.state.status === 'PLAYING' || this.state.status === 'PAUSED') {
        const hasDoc = await this.offscreen.hasDocument().catch(() => false);
        if (hasDoc) {
          try {
            const snap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
              target: 'offscreen',
              action: 'MUSIC_GET_STATUS',
            });
            if (snap && snap.trackId === this.state.currentTrackId) {
              this.state = await this.persistState({
                ...this.state,
                positionSec: snap.currentTime,
                durationSec: snap.duration ?? this.state.durationSec,
                status: snap.isPlaying
                  ? 'PLAYING'
                  : this.state.status === 'PLAYING'
                  ? 'PAUSED'
                  : this.state.status,
              });
            }
          } catch {
            // Keep persisted state
          }
        }
      }
      return { ...this.state };
    });
  }

  async playTrack(trackId?: string): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      if (!this.hasPinnedCatalog && this.catalog.length === 0) {
        await this.ensureCatalogLoaded(true);
      }

      if (this.catalog.length === 0) {
        return this.persistState({
          ...this.state,
          status: 'ERROR',
          currentTrackId: null,
          positionSec: 0,
          durationSec: null,
          musicEnabled: false,
          lastError: 'Unable to load online Lofi catalog. Check your internet connection and retry.',
          lastErrorCode: 'network',
        });
      }

      const targetTrack = trackId
        ? getTrackById(trackId, this.catalog)
        : getTrackById(this.state.currentTrackId, this.catalog) ?? this.catalog[0];

      if (!targetTrack) {
        throw new Error(`Track '${trackId}' was not found in the Lofi music catalog.`);
      }

      const resumeSameTrack =
        !trackId || trackId === this.state.currentTrackId
          ? this.state.status === 'PAUSED'
            ? this.state.positionSec
            : 0
          : 0;

      return this.startPlaybackInOffscreen(targetTrack, resumeSameTrack);
    });
  }

  async pause(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      if (this.state.status !== 'PLAYING' && !this.state.musicEnabled) {
        return { ...this.state };
      }

      let positionSec = this.state.positionSec;
      let durationSec = this.state.durationSec;
      const hasDoc = await this.offscreen.hasDocument().catch(() => false);
      if (hasDoc && this.state.status === 'PLAYING') {
        try {
          const snap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
            target: 'offscreen',
            action: 'MUSIC_PAUSE',
          });
          if (snap) {
            positionSec = snap.currentTime;
            durationSec = snap.duration ?? durationSec;
          }
        } catch {
          // Keep current positionSec
        }
      }

      return this.persistState({
        ...this.state,
        status: 'PAUSED',
        positionSec,
        durationSec,
        musicEnabled: false,
      });
    });
  }

  async resume(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      if (!this.hasPinnedCatalog && this.catalog.length === 0) {
        await this.ensureCatalogLoaded(false);
      }
      if (this.catalog.length === 0) {
        return { ...this.state };
      }

      const track =
        getTrackById(this.state.currentTrackId, this.catalog) ?? this.catalog[0];
      if (!track) return { ...this.state };

      const startPos = this.state.positionSec;
      const hasDoc = await this.offscreen.hasDocument().catch(() => false);
      if (hasDoc && this.state.status === 'PAUSED' && this.state.currentTrackId === track.id) {
        try {
          const snap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
            target: 'offscreen',
            action: 'MUSIC_GET_STATUS',
          });
          if (snap && snap.trackId === track.id && snap.src) {
            const resumedSnap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
              target: 'offscreen',
              action: 'MUSIC_PLAY',
              url: resolveTrackStreamUrl(track, this.baseUrl),
              volume: this.state.volume,
              startAtSec: snap.currentTime ?? startPos,
              trackId: track.id,
              muted: this.state.muted,
            });
            return this.persistState({
              ...this.state,
              status: 'PLAYING',
              positionSec: resumedSnap?.currentTime ?? startPos,
              durationSec: resumedSnap?.duration ?? this.state.durationSec,
              musicEnabled: true,
              lastError: null,
              lastErrorCode: null,
            });
          }
        } catch {
          // Fallback to recreating/starting playback at saved position
        }
      }

      // If Chrome closed the offscreen document after 30s idle pause, this seamlessly
      // recreates the document and resumes streaming from the saved positionSec.
      return this.startPlaybackInOffscreen(track, startPos);
    });
  }

  private async stopInternal(): Promise<MusicPlayerState> {
    const hasDoc = await this.offscreen.hasDocument().catch(() => false);
    if (hasDoc) {
      try {
        await this.offscreen.sendCommand({
          target: 'offscreen',
          action: 'MUSIC_STOP',
        });
      } catch {
        // Ignore stop errors
      }
      await this.offscreen.closeDocument().catch(() => undefined);
    }

    return this.persistState({
      ...this.state,
      status: 'STOPPED',
      positionSec: 0,
      musicEnabled: false,
      lastError: null,
      lastErrorCode: null,
    });
  }

  async stop(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(() => this.stopInternal());
  }

  async next(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      const queue = this.getEffectiveQueueIds();
      if (queue.length === 0) return { ...this.state };

      const idx = this.state.currentTrackId ? queue.indexOf(this.state.currentTrackId) : -1;
      const nextIdx = idx >= 0 ? (idx + 1) % queue.length : 0;
      const nextTrack = getTrackById(queue[nextIdx], this.catalog);
      if (!nextTrack) return { ...this.state };

      return this.startPlaybackInOffscreen(nextTrack, 0);
    });
  }

  async previous(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      const queue = this.getEffectiveQueueIds();
      if (queue.length === 0) return { ...this.state };

      const idx = this.state.currentTrackId ? queue.indexOf(this.state.currentTrackId) : 0;
      const prevIdx = idx > 0 ? idx - 1 : queue.length - 1;
      const prevTrack = getTrackById(queue[prevIdx], this.catalog);
      if (!prevTrack) return { ...this.state };

      return this.startPlaybackInOffscreen(prevTrack, 0);
    });
  }

  async seek(positionSec: number): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      const clamped = clampPosition(positionSec, this.state.durationSec);
      const hasDoc = await this.offscreen.hasDocument().catch(() => false);
      if (hasDoc) {
        try {
          await this.offscreen.sendCommand({
            target: 'offscreen',
            action: 'MUSIC_SEEK',
            positionSec: clamped,
          });
        } catch {
          // Keep persisted seek position even if offscreen doc was closed after 30s pause
        }
      }

      return this.persistState({
        ...this.state,
        positionSec: clamped,
      });
    });
  }

  async setVolume(volume: number, muted?: boolean): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      const nextVolume = clampVolume(volume);
      const nextMuted = typeof muted === 'boolean' ? muted : this.state.muted;

      const hasDoc = await this.offscreen.hasDocument().catch(() => false);
      if (hasDoc) {
        try {
          await this.offscreen.sendCommand({
            target: 'offscreen',
            action: 'MUSIC_SET_VOLUME',
            volume: nextVolume,
            muted: nextMuted,
          });
        } catch {
          // Non-fatal
        }
      }

      return this.persistState({
        ...this.state,
        volume: nextVolume,
        muted: nextMuted,
      });
    });
  }

  async setShuffle(enabled: boolean): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      const shuffledOrder = enabled
        ? buildShuffledOrder(this.catalog, this.state.currentTrackId, this.nowFn())
        : this.catalog.map((t) => t.id);

      return this.persistState({
        ...this.state,
        shuffle: Boolean(enabled),
        shuffledOrder,
      });
    });
  }

  async setRepeatMode(mode: RepeatMode): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      const validMode: RepeatMode =
        mode === 'all' || mode === 'one' || mode === 'off' ? mode : 'off';
      return this.persistState({
        ...this.state,
        repeatMode: validMode,
      });
    });
  }

  async handleOffscreenEvent(event: OffscreenMusicEvent): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      switch (event.action) {
        case 'MUSIC_POSITION': {
          if (event.trackId !== this.state.currentTrackId) {
            return { ...this.state };
          }
          const durationSec =
            typeof event.durationSec === 'number' && Number.isFinite(event.durationSec) && event.durationSec > 0
              ? event.durationSec
              : this.state.durationSec;
          return this.persistState({
            ...this.state,
            positionSec: clampPosition(event.positionSec, durationSec),
            durationSec,
          });
        }

        case 'MUSIC_ENDED': {
          if (event.trackId !== this.state.currentTrackId) {
            return { ...this.state };
          }
          const queue = this.getEffectiveQueueIds();
          if (queue.length === 0) {
            return this.persistState({
              ...this.state,
              status: 'STOPPED',
              positionSec: 0,
              musicEnabled: false,
            });
          }

          if (this.state.repeatMode === 'one') {
            const currentTrack = getTrackById(this.state.currentTrackId, this.catalog);
            if (currentTrack) {
              return this.startPlaybackInOffscreen(currentTrack, 0);
            }
          }

          const currentIdx = this.state.currentTrackId
            ? queue.indexOf(this.state.currentTrackId)
            : -1;
          const isLastTrack = currentIdx === -1 || currentIdx >= queue.length - 1;

          if (isLastTrack && this.state.repeatMode === 'off') {
            await this.offscreen.closeDocument().catch(() => undefined);
            return this.persistState({
              ...this.state,
              status: 'STOPPED',
              positionSec: 0,
              musicEnabled: false,
            });
          }

          const nextIdx = (currentIdx + 1) % queue.length;
          const nextTrack = getTrackById(queue[nextIdx], this.catalog);
          if (nextTrack) {
            return this.startPlaybackInOffscreen(nextTrack, 0);
          }

          return this.persistState({
            ...this.state,
            status: 'STOPPED',
            positionSec: 0,
            musicEnabled: false,
          });
        }

        case 'MUSIC_ERROR': {
          return this.persistState({
            ...this.state,
            status: 'ERROR',
            musicEnabled: false,
            lastErrorCode: event.code,
            lastError: event.message || `Audio playback failed (${event.code}).`,
          });
        }

        default:
          return { ...this.state };
      }
    });
  }

  private async syncInternal(
    sessionOverride?: SessionSnapshot | null,
    reason?: string
  ): Promise<MusicPlayerState> {
    const storedSession =
      sessionOverride !== undefined
        ? sessionOverride
        : await this.storage.getCurrentSession();

    const intent = deriveMusicIntent(storedSession);

    if (intent === 'stop') {
      const hasDoc = await this.offscreen.hasDocument().catch(() => false);
      if (
        this.state.status === 'PLAYING' ||
        this.state.status === 'PAUSED' ||
        this.state.musicEnabled ||
        hasDoc
      ) {
        return this.stopInternal();
      }
      return { ...this.state };
    }

    // intent === 'keep': Active focus session (RUNNING focus/break or PAUSED).
    // Session Pause, Resume, Short Break, and Long Break never alter user playback,
    // and starting a session never auto-plays music.
    if (this.state.status !== 'PLAYING') {
      return { ...this.state };
    }

    if (!this.hasPinnedCatalog && this.catalog.length === 0) {
      await this.ensureCatalogLoaded(false);
    }
    const track =
      getTrackById(this.state.currentTrackId, this.catalog) ?? this.catalog[0] ?? null;
    if (!track) {
      return { ...this.state };
    }

    const hasDoc = await this.offscreen.hasDocument().catch(() => false);
    if (hasDoc) {
      return { ...this.state };
    }

    // Only recover offscreen playback on explicit startup/wake recovery when user was playing
    if (
      reason === 'BROWSER_STARTUP' ||
      reason === 'BROWSER_STARTUP_ACTIVE' ||
      reason === 'BROWSER_UPDATED' ||
      reason === 'EXTENSION_RE_ENABLED' ||
      reason === 'EXTENSION_RELOADED' ||
      reason === 'EXTENSION_UPDATED' ||
      reason === 'RECOVERY' ||
      reason === 'SERVICE_WORKER_WAKE'
    ) {
      return this.startPlaybackInOffscreen(track, this.state.positionSec);
    }

    return { ...this.state };
  }

  /**
   * Synchronize music playback against the authoritative Focus Session state.
   * Uses non-mutex storage reads so it is safe to call from SessionCoordinator hooks.
   */
  async sync(sessionOverride?: SessionSnapshot | null, reason?: string): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(() => this.syncInternal(sessionOverride, reason));
  }

  /**
   * Synchronize Music playback when a Focus Session reaches a terminal outcome.
   * Always safe & error-isolated so SessionCoordinator / notifications cannot fail.
   */
  async handleFocusSessionEnded(event: {
    sessionId: string;
    status: 'COMPLETED' | 'ABANDONED' | 'INTERRUPTED';
  }): Promise<void> {
    try {
      const currentSession = await this.storage.getCurrentSession();
      const terminalSnapshot: SessionSnapshot = currentSession
        ? { ...currentSession, status: event.status }
        : {
            id: event.sessionId,
            mode: 'COUNTDOWN',
            profileId: '',
            status: event.status,
            targetMinutes: 0,
            lockedMultiplier: 1,
            startedAt: 0,
            currentPauseStartedAt: null,
            pauseCount: 0,
            totalPauseMs: 0,
            pauseHistory: [],
            lastHeartbeatAt: 0,
            completedAt: this.nowFn(),
            rewardProcessed: true,
          };
      await this.sync(terminalSnapshot, 'SESSION_ENDED');
    } catch (err) {
      console.warn(
        `[MusicCoordinator] Non-fatal error syncing music on session end (${event.sessionId}, ${event.status}):`,
        err
      );
    }
  }
}
