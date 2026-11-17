export type MusicLicenseType =
  | 'CC-BY-4.0'
  | 'CC0-1.0'
  | 'CC-BY-SA-3.0'
  | 'CC0'
  | 'CC BY'
  | 'CC BY-SA'
  | (string & {});

export type MusicErrorCode = 'autoplay_blocked' | 'network' | 'decode' | 'unknown';

export type MusicIntent = 'play' | 'pause' | 'stop';

export interface RemoteMusicTrackRaw {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly durationSec: number;
  readonly file: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly sourceUrl: string;
  readonly modified: boolean;
}

export interface RemoteMusicCatalog {
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly tracks: readonly RemoteMusicTrackRaw[];
}

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  /** Filename or HTTPS stream path from remote catalog, e.g. 'holizna-cc0-into-the-mist.mp3'. */
  readonly file: string;
  /** Full HTTPS stream URL resolved against LOFI_BASE_URL. */
  readonly streamUrl?: string;
  /** Duration in seconds from catalog or audio metadata. */
  readonly durationSec?: number;
  /** Alias preserved for UI/consumer ergonomics. */
  readonly duration?: number;
  readonly license: MusicLicenseType;
  readonly licenseUrl: string;
  readonly creator: string;
  readonly sourceUrl: string;
  /** Attribution string built from track metadata / license. */
  readonly attribution: string;
  readonly isModified: boolean;
  readonly modified?: boolean;
}

export interface CachedMusicCatalog {
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly fetchedAt: number;
  readonly sourceUrl: string;
  readonly tracks: readonly MusicTrack[];
  readonly skippedCount?: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

export type MusicPlaybackStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'STOPPED' | 'ERROR';

export interface MusicPlayerState {
  status: MusicPlaybackStatus;
  currentTrackId: string | null;
  positionSec: number;
  durationSec: number | null;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  shuffledOrder: string[];
  syncWithSession: boolean;
  musicEnabled?: boolean;
  playDuringBreak?: boolean;
  pausedBySession?: boolean;
  catalogUpdatedAt?: string | null;
  catalogSkippedCount?: number;
  lastUpdatedAt: number;
  lastError?: string | null;
  lastErrorCode?: MusicErrorCode | null;
}

export interface AudioStatusSnapshot {
  isPlaying: boolean;
  paused: boolean;
  currentTime: number;
  duration: number | null;
  trackId: string | null;
  src: string;
}

export type OffscreenMusicCommand =
  | {
      target: 'offscreen';
      action: 'MUSIC_PLAY';
      url: string;
      volume: number;
      startAtSec: number;
      trackId?: string;
      muted?: boolean;
    }
  | { target: 'offscreen'; action: 'MUSIC_PAUSE' }
  | { target: 'offscreen'; action: 'MUSIC_STOP' }
  | { target: 'offscreen'; action: 'MUSIC_SEEK'; positionSec: number }
  | { target: 'offscreen'; action: 'MUSIC_SET_VOLUME'; volume: number; muted?: boolean }
  | { target: 'offscreen'; action: 'MUSIC_GET_STATUS' };

export type OffscreenMusicEvent =
  | {
      target: 'background';
      action: 'MUSIC_POSITION';
      trackId: string;
      positionSec: number;
      durationSec?: number | null;
    }
  | {
      target: 'background';
      action: 'MUSIC_ENDED';
      trackId: string;
    }
  | {
      target: 'background';
      action: 'MUSIC_ERROR';
      code: MusicErrorCode;
      trackId?: string | null;
      message?: string;
    };
