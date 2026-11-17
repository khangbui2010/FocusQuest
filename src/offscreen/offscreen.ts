import {
  AudioStatusSnapshot,
  MusicErrorCode,
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
  readonly error?: { code?: number; message?: string } | null;
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
    code?: MusicErrorCode;
  }>;
  getStatus(): AudioStatusSnapshot;
  dispose(): void;
}

const DEFAULT_POSITION_THROTTLE_MS = 5000;

function clampVolume(vol: number): number {
  if (!Number.isFinite(vol)) return 0.7;
  return Math.max(0, Math.min(1, vol));
}

function sanitizeDuration(raw: number): number | null {
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function classifyPlayError(err: unknown): MusicErrorCode {
  if (err && typeof err === 'object') {
    const name = String((err as { name?: string }).name ?? '');
    const message = String((err as { message?: string }).message ?? '').toLowerCase();
    if (
      name === 'NotAllowedError' ||
      message.includes('autoplay') ||
      message.includes('user didn') ||
      message.includes('gesture')
    ) {
      return 'autoplay_blocked';
    }
    if (name === 'NotSupportedError' || message.includes('decode') || message.includes('format')) {
      return 'decode';
    }
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('failed to load') ||
      message.includes('offline')
    ) {
      return 'network';
    }
  }
  return 'unknown';
}

export function classifyMediaError(mediaError?: { code?: number; message?: string } | null): MusicErrorCode {
  const code = mediaError?.code;
  if (code === 2) return 'network'; // MEDIA_ERR_NETWORK
  if (code === 3) return 'decode'; // MEDIA_ERR_DECODE
  if (code === 4) {
    // MEDIA_ERR_SRC_NOT_SUPPORTED often means network 404/offline or unsupported codec
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'network';
    }
    const msg = String(mediaError?.message ?? '').toLowerCase();
    if (msg.includes('network') || msg.includes('404') || msg.includes('http')) {
      return 'network';
    }
    return 'decode';
  }
  if (code === 1) return 'unknown'; // MEDIA_ERR_ABORTED
  return 'unknown';
}

export function createOffscreenAudioController(
  audio: OffscreenAudioElementLike,
  emitEvent: (event: OffscreenMusicEvent) => void,
  positionThrottleMs: number = DEFAULT_POSITION_THROTTLE_MS
): OffscreenAudioController {
  let currentTrackId: string | null = null;
  let lastEmittedPositionAt = 0;
  let isIntentionalStop = false;
  let pendingStartAtSec: number | null = null;

  const emitPosition = (force = false) => {
    if (!currentTrackId) return;
    const now = Date.now();
    if (!force && now - lastEmittedPositionAt < positionThrottleMs) return;
    lastEmittedPositionAt = now;
    emitEvent({
      target: 'background',
      action: 'MUSIC_POSITION',
      trackId: currentTrackId,
      positionSec: Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0,
      durationSec: sanitizeDuration(audio.duration),
    });
  };

  const onLoadedMetadata = () => {
    if (!currentTrackId) return;
    if (pendingStartAtSec !== null && pendingStartAtSec > 0) {
      const dur = sanitizeDuration(audio.duration);
      const targetPos = dur !== null ? Math.min(dur, pendingStartAtSec) : pendingStartAtSec;
      pendingStartAtSec = null;
      if (Math.abs((audio.currentTime || 0) - targetPos) > 0.75) {
        try {
          audio.currentTime = targetPos;
        } catch {
          // Ignore seek errors before buffer ready
        }
      }
    }
    emitPosition(true);
  };

  const onTimeUpdate = () => {
    emitPosition(false);
  };

  const onEnded = () => {
    if (!currentTrackId) return;
    pendingStartAtSec = null;
    emitPosition(true);
    emitEvent({
      target: 'background',
      action: 'MUSIC_ENDED',
      trackId: currentTrackId,
    });
  };

  const onError = () => {
    if (isIntentionalStop || !audio.src) return;
    pendingStartAtSec = null;
    const code = classifyMediaError(audio.error);
    emitEvent({
      target: 'background',
      action: 'MUSIC_ERROR',
      code,
      trackId: currentTrackId,
      message: audio.error?.message || `Audio playback failed (${code}).`,
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
        case 'MUSIC_PLAY': {
          isIntentionalStop = false;
          const { url, volume, startAtSec, trackId, muted } = command;
          const nextTrackId = trackId ?? url;
          const sameSource = audio.src === url && currentTrackId === nextTrackId;

          audio.volume = clampVolume(volume);
          if (typeof muted === 'boolean') {
            audio.muted = muted;
          }

          const safePos =
            typeof startAtSec === 'number' && Number.isFinite(startAtSec) && startAtSec > 0
              ? startAtSec
              : 0;

          currentTrackId = nextTrackId;

          if (!sameSource) {
            pendingStartAtSec = safePos > 0 ? safePos : null;
            audio.src = url;
            audio.load();
            if (safePos > 0) {
              try {
                audio.currentTime = safePos;
              } catch {
                // Will be applied in loadedmetadata handler
              }
            }
          } else {
            pendingStartAtSec = null;
            if (Math.abs((audio.currentTime || 0) - safePos) > 1.5 || !audio.paused) {
              audio.currentTime = safePos;
            }
          }

          try {
            await audio.play();
          } catch (playErr) {
            const code = classifyPlayError(playErr);
            const message = playErr instanceof Error ? playErr.message : String(playErr);
            emitEvent({
              target: 'background',
              action: 'MUSIC_ERROR',
              code,
              trackId: currentTrackId,
              message,
            });
            return { success: false, error: message, code };
          }

          return { success: true, data: getStatus() };
        }

        case 'MUSIC_PAUSE': {
          pendingStartAtSec = null;
          audio.pause();
          emitPosition(true);
          return { success: true, data: getStatus() };
        }

        case 'MUSIC_STOP': {
          isIntentionalStop = true;
          pendingStartAtSec = null;
          audio.pause();
          audio.currentTime = 0;
          audio.src = '';
          currentTrackId = null;
          lastEmittedPositionAt = 0;
          return { success: true, data: getStatus() };
        }

        case 'MUSIC_SEEK': {
          pendingStartAtSec = null;
          const duration = sanitizeDuration(audio.duration);
          const requested =
            typeof command.positionSec === 'number' && Number.isFinite(command.positionSec)
              ? Math.max(0, command.positionSec)
              : 0;
          audio.currentTime = duration !== null ? Math.min(duration, requested) : requested;
          emitPosition(true);
          return { success: true, data: getStatus() };
        }

        case 'MUSIC_SET_VOLUME': {
          audio.volume = clampVolume(command.volume);
          if (typeof command.muted === 'boolean') {
            audio.muted = command.muted;
          }
          return { success: true, data: getStatus() };
        }

        case 'MUSIC_GET_STATUS': {
          return { success: true, data: getStatus() };
        }

        default:
          return { success: false, error: 'Unsupported offscreen music command.' };
      }
    } catch (err) {
      const code = classifyPlayError(err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        code,
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
  if (typeof document === 'undefined') return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

  const domAudio = document.getElementById('lofi-audio') as HTMLAudioElement | null;
  const audioElement = domAudio ?? (typeof Audio !== 'undefined' ? new Audio() : null);
  if (!audioElement) return;
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
      (message as { target?: string }).target !== 'offscreen'
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
