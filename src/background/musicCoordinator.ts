import { StorageManager } from '../storage/storageManager.ts';
import { IOffscreenAdapter, AudioStatusSnapshot } from '../chrome/offscreenAdapter.ts';
import {
  MUSIC_CATALOG,
  getTrackById,
  resolveTrackAssetUrl,
  validateMusicCatalog,
} from '../data/musicCatalog.ts';
import {
  MusicPlayerState,
  MusicTrack,
  OffscreenMusicEvent,
  RepeatMode,
} from '../types/music.ts';

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
  catalog: readonly MusicTrack[] = MUSIC_CATALOG
): MusicPlayerState {
  const firstTrack = catalog[0] ?? null;
  return {
    status: 'IDLE',
    currentTrackId: firstTrack ? firstTrack.id : null,
    positionSec: 0,
    durationSec: firstTrack?.duration ?? null,
    volume: 0.7,
    muted: false,
    shuffle: false,
    repeatMode: 'off',
    shuffledOrder: catalog.map((t) => t.id),
    syncWithSession: true,
    lastUpdatedAt: Date.now(),
    lastError: null,
  };
}

export class MusicCoordinator {
  private isInitialized = false;
  private initPromise: Promise<MusicPlayerState> | null = null;
  private queueChain: Promise<unknown> = Promise.resolve();
  private state: MusicPlayerState;

  constructor(
    private storage: StorageManager,
    private offscreen: IOffscreenAdapter,
    private catalog: readonly MusicTrack[] = MUSIC_CATALOG
  ) {
    const validation = validateMusicCatalog(this.catalog);
    if (!validation.valid) {
      console.warn('[MusicCoordinator] Catalog validation warnings:', validation.errors);
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

  private normalizeStateAgainstCatalog(raw: Partial<MusicPlayerState> | null): MusicPlayerState {
    const defaults = createDefaultMusicPlayerState(this.catalog);
    if (!raw) {
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
      : 'IDLE';

    const durationSec =
      typeof raw.durationSec === 'number' && Number.isFinite(raw.durationSec) && raw.durationSec > 0
        ? raw.durationSec
        : matchedTrack?.duration ?? null;

    const trackChanged = Boolean(raw.currentTrackId && matchedTrack?.id !== raw.currentTrackId);

    return {
      status,
      currentTrackId: matchedTrack ? matchedTrack.id : null,
      positionSec: trackChanged
        ? 0
        : clampPosition(typeof raw.positionSec === 'number' ? raw.positionSec : 0, durationSec),
      durationSec,
      volume: typeof raw.volume === 'number' ? clampVolume(raw.volume) : defaults.volume,
      muted: Boolean(raw.muted),
      shuffle: Boolean(raw.shuffle),
      repeatMode,
      shuffledOrder: normalizedOrder,
      syncWithSession: typeof raw.syncWithSession === 'boolean' ? raw.syncWithSession : true,
      lastUpdatedAt: typeof raw.lastUpdatedAt === 'number' ? raw.lastUpdatedAt : Date.now(),
      lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
    };
  }

  private async persistState(nextState: MusicPlayerState): Promise<MusicPlayerState> {
    this.state = {
      ...nextState,
      lastUpdatedAt: Date.now(),
    };
    await this.storage.setMusicState(this.state);
    return { ...this.state };
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

  private async startPlaybackInOffscreen(track: MusicTrack, positionSec: number): Promise<MusicPlayerState> {
    try {
      await this.offscreen.ensureDocument();
      const snap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
        scope: 'FQ_OFFSCREEN_MUSIC',
        action: 'LOAD_AND_PLAY',
        payload: {
          trackId: track.id,
          trackUrl: resolveTrackAssetUrl(track.file),
          positionSec,
          volume: this.state.volume,
          muted: this.state.muted,
        },
      });
      const resolvedDuration = snap?.duration ?? track.duration ?? this.state.durationSec ?? null;
      const resolvedPosition = snap?.currentTime ?? clampPosition(positionSec, resolvedDuration);
      return this.persistState({
        ...this.state,
        status: 'PLAYING',
        currentTrackId: track.id,
        positionSec: resolvedPosition,
        durationSec: resolvedDuration,
        lastError: null,
      });
    } catch (err) {
      return this.persistState({
        ...this.state,
        status: 'ERROR',
        currentTrackId: track.id,
        positionSec: clampPosition(positionSec, track.duration ?? null),
        durationSec: track.duration ?? this.state.durationSec ?? null,
        lastError: err instanceof Error ? err.message : String(err),
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
      this.state = this.normalizeStateAgainstCatalog(persisted);

      const hasOffscreen = await this.offscreen.hasDocument().catch(() => false);
      if (hasOffscreen) {
        try {
          const audioStatus = await this.offscreen.sendCommand<AudioStatusSnapshot>({
            scope: 'FQ_OFFSCREEN_MUSIC',
            action: 'GET_AUDIO_STATUS',
          });
          if (audioStatus && audioStatus.trackId && getTrackById(audioStatus.trackId, this.catalog)) {
            this.state = await this.persistState({
              ...this.state,
              currentTrackId: audioStatus.trackId,
              positionSec: audioStatus.currentTime,
              durationSec:
                audioStatus.duration ??
                getTrackById(audioStatus.trackId, this.catalog)?.duration ??
                this.state.durationSec,
              status: audioStatus.isPlaying
                ? 'PLAYING'
                : this.state.status === 'STOPPED'
                ? 'STOPPED'
                : 'PAUSED',
              lastError: null,
            });
          } else if (this.state.status === 'PLAYING') {
            this.state = await this.persistState({
              ...this.state,
              status: 'PAUSED',
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

  async getState(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      if (this.state.status === 'PLAYING' || this.state.status === 'PAUSED') {
        const hasDoc = await this.offscreen.hasDocument().catch(() => false);
        if (hasDoc) {
          try {
            const snap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
              scope: 'FQ_OFFSCREEN_MUSIC',
              action: 'GET_AUDIO_STATUS',
            });
            if (snap && snap.trackId === this.state.currentTrackId) {
              this.state = await this.persistState({
                ...this.state,
                positionSec: snap.currentTime,
                durationSec: snap.duration ?? this.state.durationSec,
                status: snap.isPlaying ? 'PLAYING' : this.state.status === 'PLAYING' ? 'PAUSED' : this.state.status,
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
      if (this.catalog.length === 0) {
        return this.persistState({
          ...this.state,
          status: 'IDLE',
          currentTrackId: null,
          positionSec: 0,
          durationSec: null,
          lastError: 'No bundled MP3 tracks declared in catalog.',
        });
      }

      const targetTrack = trackId
        ? getTrackById(trackId, this.catalog)
        : getTrackById(this.state.currentTrackId, this.catalog) ?? this.catalog[0];

      if (!targetTrack) {
        throw new Error(`Track '${trackId}' was not found in the bundled music catalog.`);
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
      if (this.state.status !== 'PLAYING') {
        return { ...this.state };
      }

      let positionSec = this.state.positionSec;
      let durationSec = this.state.durationSec;
      const hasDoc = await this.offscreen.hasDocument().catch(() => false);
      if (hasDoc) {
        try {
          const snap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
            scope: 'FQ_OFFSCREEN_MUSIC',
            action: 'PAUSE',
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
      });
    });
  }

  async resume(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      if (this.catalog.length === 0) {
        return { ...this.state };
      }

      const track =
        getTrackById(this.state.currentTrackId, this.catalog) ?? this.catalog[0];
      if (!track) return { ...this.state };

      const hasDoc = await this.offscreen.hasDocument().catch(() => false);
      if (hasDoc && this.state.status === 'PAUSED' && this.state.currentTrackId === track.id) {
        try {
          const snap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
            scope: 'FQ_OFFSCREEN_MUSIC',
            action: 'GET_AUDIO_STATUS',
          });
          if (snap && snap.trackId === track.id && snap.src) {
            const resumedSnap = await this.offscreen.sendCommand<AudioStatusSnapshot>({
              scope: 'FQ_OFFSCREEN_MUSIC',
              action: 'RESUME',
            });
            return this.persistState({
              ...this.state,
              status: 'PLAYING',
              positionSec: resumedSnap?.currentTime ?? this.state.positionSec,
              durationSec: resumedSnap?.duration ?? this.state.durationSec,
              lastError: null,
            });
          }
        } catch {
          // Fallback to LOAD_AND_PLAY at saved position
        }
      }

      return this.startPlaybackInOffscreen(track, this.state.positionSec);
    });
  }

  async stop(): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      const hasDoc = await this.offscreen.hasDocument().catch(() => false);
      if (hasDoc) {
        try {
          await this.offscreen.sendCommand({
            scope: 'FQ_OFFSCREEN_MUSIC',
            action: 'STOP',
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
        lastError: null,
      });
    });
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
            scope: 'FQ_OFFSCREEN_MUSIC',
            action: 'SEEK',
            payload: { positionSec: clamped },
          });
        } catch {
          // Keep persisted seek position even if offscreen doc wasn't mounted yet
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
            scope: 'FQ_OFFSCREEN_MUSIC',
            action: 'SET_VOLUME',
            payload: { volume: nextVolume, muted: nextMuted },
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
        ? buildShuffledOrder(this.catalog, this.state.currentTrackId, Date.now())
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

  async setSyncWithSession(enabled: boolean): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      return this.persistState({
        ...this.state,
        syncWithSession: Boolean(enabled),
      });
    });
  }

  async handleOffscreenEvent(event: OffscreenMusicEvent): Promise<MusicPlayerState> {
    await this.ensureInitialized();
    return this.runExclusive(async () => {
      switch (event.action) {
        case 'OFFSCREEN_TRACK_LOADED': {
          if (event.payload.trackId !== this.state.currentTrackId) {
            return { ...this.state };
          }
          return this.persistState({
            ...this.state,
            durationSec: event.payload.durationSec ?? this.state.durationSec,
          });
        }

        case 'OFFSCREEN_TIME_UPDATE': {
          if (event.payload.trackId !== this.state.currentTrackId) {
            return { ...this.state };
          }
          const durationSec = event.payload.durationSec ?? this.state.durationSec;
          return this.persistState({
            ...this.state,
            positionSec: clampPosition(event.payload.positionSec, durationSec),
            durationSec,
          });
        }

        case 'OFFSCREEN_TRACK_ENDED': {
          if (event.payload.trackId !== this.state.currentTrackId) {
            return { ...this.state };
          }
          const queue = this.getEffectiveQueueIds();
          if (queue.length === 0) {
            return this.persistState({ ...this.state, status: 'STOPPED', positionSec: 0 });
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
          });
        }

        case 'OFFSCREEN_AUDIO_ERROR': {
          return this.persistState({
            ...this.state,
            status: 'ERROR',
            lastError: event.payload.message,
          });
        }

        default:
          return { ...this.state };
      }
    });
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
      const current = await this.ensureInitialized();
      if (!current.syncWithSession) {
        return;
      }
      if (current.status === 'PLAYING' || current.status === 'PAUSED') {
        await this.stop();
      }
    } catch (err) {
      console.warn(
        `[MusicCoordinator] Non-fatal error syncing music stop on session end (${event.sessionId}, ${event.status}):`,
        err
      );
    }
  }
}
