export type MusicLicenseType = 'CC0' | 'CC BY' | 'CC BY-SA';

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  /** Relative asset path packaged with the extension, e.g. 'assets/music/track.mp3'. */
  readonly file: string;
  /** Duration in seconds (optional if determined at runtime from audio metadata). */
  readonly duration?: number;
  readonly license: MusicLicenseType;
  readonly licenseUrl: string;
  readonly creator: string;
  readonly sourceUrl: string;
  /** Required full attribution string for CC BY / CC BY-SA tracks. */
  readonly attribution: string;
  readonly isModified: boolean;
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
  lastUpdatedAt: number;
  lastError?: string | null;
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
      scope: 'FQ_OFFSCREEN_MUSIC';
      action: 'LOAD_AND_PLAY';
      payload: {
        trackId: string;
        trackUrl: string;
        positionSec: number;
        volume: number;
        muted: boolean;
      };
    }
  | { scope: 'FQ_OFFSCREEN_MUSIC'; action: 'PAUSE' }
  | { scope: 'FQ_OFFSCREEN_MUSIC'; action: 'RESUME' }
  | { scope: 'FQ_OFFSCREEN_MUSIC'; action: 'STOP' }
  | { scope: 'FQ_OFFSCREEN_MUSIC'; action: 'SEEK'; payload: { positionSec: number } }
  | { scope: 'FQ_OFFSCREEN_MUSIC'; action: 'SET_VOLUME'; payload: { volume: number; muted: boolean } }
  | { scope: 'FQ_OFFSCREEN_MUSIC'; action: 'GET_AUDIO_STATUS' };

export type OffscreenMusicEvent =
  | {
      scope: 'FQ_MUSIC_EVENT';
      action: 'OFFSCREEN_TRACK_LOADED';
      payload: { trackId: string; durationSec: number | null };
    }
  | {
      scope: 'FQ_MUSIC_EVENT';
      action: 'OFFSCREEN_TIME_UPDATE';
      payload: { trackId: string; positionSec: number; durationSec: number | null };
    }
  | {
      scope: 'FQ_MUSIC_EVENT';
      action: 'OFFSCREEN_TRACK_ENDED';
      payload: { trackId: string };
    }
  | {
      scope: 'FQ_MUSIC_EVENT';
      action: 'OFFSCREEN_AUDIO_ERROR';
      payload: { trackId: string | null; message: string };
    };
