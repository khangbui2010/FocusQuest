import {
  AudioStatusSnapshot,
  OffscreenMusicCommand,
  OffscreenMusicEvent,
} from '../types/music.ts';

export interface OffscreenAudioElementLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  volume: number;
  muted: boolean;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface OffscreenAudioController {
  handleCommand(command: OffscreenMusicCommand): Promise<{
    success: boolean;
    data?: AudioStatusSnapshot;
    error?: string;
  }>;
  getStatus(): AudioStatusSnapshot;
  dispose(): void;
}

function clampVolume(vol: number): number {
  if (!Number.isFinite(vol)) return 0.7;
  return Math.max(0, Math.min(1, vol));
}

function sanitizeDuration(raw: number): number | null {
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function createOffscreenAudioController(
  audio: OffscreenAudioElementLike,
  emitEvent: (event: OffscreenMusicEvent) => void,
  timeUpdateThrottleMs: number = 2500
): OffscreenAudioController {
  let currentTrackId: string | null = null;
  let lastEmittedTimeAt = 0;
  let isIntentionalStop = false;

  const emitTimeUpdate = (force = false) => {
    if (!currentTrackId) return;
    const now = Date.now();
    if (!force && now - lastEmittedTimeAt < timeUpdateThrottleMs) return;
    lastEmittedTimeAt = now;
    emitEvent({
      scope: 'FQ_MUSIC_EVENT',
      action: 'OFFSCREEN_TIME_UPDATE',
      payload: {
        trackId: currentTrackId,
        positionSec: Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0,
        durationSec: sanitizeDuration(audio.duration),
      },
    });
  };

  const onLoadedMetadata = () => {
    if (!currentTrackId) return;
    emitEvent({
      scope: 'FQ_MUSIC_EVENT',
      action: 'OFFSCREEN_TRACK_LOADED',
      payload: {
        trackId: currentTrackId,
        durationSec: sanitizeDuration(audio.duration),
      },
    });
  };

  const onTimeUpdate = () => {
    emitTimeUpdate(false);
  };

  const onEnded = () => {
    if (!currentTrackId) return;
    emitEvent({
      scope: 'FQ_MUSIC_EVENT',
      action: 'OFFSCREEN_TRACK_ENDED',
      payload: { trackId: currentTrackId },
    });
  };

  const onError = () => {
    if (isIntentionalStop || !audio.src) return;
    emitEvent({
      scope: 'FQ_MUSIC_EVENT',
      action: 'OFFSCREEN_AUDIO_ERROR',
      payload: {
        trackId: currentTrackId,
        message: 'Failed to decode or play bundled MP3 track.',
      },
    });
  };

  audio.addEventListener('loadedmetadata', onLoadedMetadata);
  audio.addEventListener('timeupdate', onTimeUpdate);
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);

  const getStatus = (): AudioStatusSnapshot => ({
    isPlaying: Boolean(audio.src) && !audio.paused,
    paused: audio.paused,
    currentTime: Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0,
    duration: sanitizeDuration(audio.duration),
    trackId: currentTrackId,
    src: audio.src || '',
  });

  const handleCommand = async (command: OffscreenMusicCommand) => {
    try {
      switch (command.action) {
        case 'LOAD_AND_PLAY': {
          isIntentionalStop = false;
          const { trackId, trackUrl, positionSec, volume, muted } = command.payload;
          const needsReload = currentTrackId !== trackId || audio.src !== trackUrl;
          currentTrackId = trackId;
          audio.volume = clampVolume(volume);
          audio.muted = Boolean(muted);
          if (needsReload) {
            audio.src = trackUrl;
            audio.load();
          }
          const safePos =
            typeof positionSec === 'number' && Number.isFinite(positionSec) && positionSec > 0
              ? positionSec
              : 0;
          audio.currentTime = safePos;
          await audio.play();
          return { success: true, data: getStatus() };
        }

        case 'PAUSE': {
          audio.pause();
          emitTimeUpdate(true);
          return { success: true, data: getStatus() };
        }

        case 'RESUME': {
          isIntentionalStop = false;
          if (!audio.src) {
            return { success: false, error: 'No track loaded in Offscreen audio engine.' };
          }
          await audio.play();
          return { success: true, data: getStatus() };
        }

        case 'STOP': {
          isIntentionalStop = true;
          audio.pause();
          audio.currentTime = 0;
          audio.src = '';
          currentTrackId = null;
          return { success: true, data: getStatus() };
        }

        case 'SEEK': {
          const duration = sanitizeDuration(audio.duration);
          const requested =
            typeof command.payload.positionSec === 'number' &&
            Number.isFinite(command.payload.positionSec)
              ? Math.max(0, command.payload.positionSec)
              : 0;
          audio.currentTime = duration !== null ? Math.min(duration, requested) : requested;
          emitTimeUpdate(true);
          return { success: true, data: getStatus() };
        }

        case 'SET_VOLUME': {
          audio.volume = clampVolume(command.payload.volume);
          audio.muted = Boolean(command.payload.muted);
          return { success: true, data: getStatus() };
        }

        case 'GET_AUDIO_STATUS': {
          return { success: true, data: getStatus() };
        }

        default:
          return { success: false, error: 'Unsupported offscreen music command.' };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  return {
    handleCommand,
    getStatus,
    dispose() {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    },
  };
}

function initOffscreenRuntime(): void {
  if (typeof document === 'undefined' || typeof Audio === 'undefined') return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

  const audioElement = new Audio();
  audioElement.preload = 'metadata';

  const emitEvent = (event: OffscreenMusicEvent) => {
    try {
      chrome.runtime.sendMessage(event, () => {
        // Consume lastError silently if background SW is temporarily restarting
        void chrome.runtime.lastError;
      });
    } catch {
      // Ignore messaging failure when runtime is unavailable
    }
  };

  const controller = createOffscreenAudioController(
    audioElement as unknown as OffscreenAudioElementLike,
    emitEvent
  );

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (
      !message ||
      typeof message !== 'object' ||
      (message as { scope?: string }).scope !== 'FQ_OFFSCREEN_MUSIC'
    ) {
      return false;
    }

    controller
      .handleCommand(message as OffscreenMusicCommand)
      .then((res) => sendResponse(res))
      .catch((err) =>
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })
      );

    return true;
  });
}

initOffscreenRuntime();
