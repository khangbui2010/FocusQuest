import { AudioStatusSnapshot, OffscreenMusicCommand } from '../types/music.ts';

export interface IOffscreenAdapter {
  hasDocument(): Promise<boolean>;
  ensureDocument(): Promise<void>;
  closeDocument(): Promise<void>;
  sendCommand<T = unknown>(command: OffscreenMusicCommand): Promise<T | null>;
}

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

export class ChromeOffscreenAdapter implements IOffscreenAdapter {
  private creatingPromise: Promise<void> | null = null;

  private getOffscreenUrl(): string {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    }
    return OFFSCREEN_DOCUMENT_PATH;
  }

  async hasDocument(): Promise<boolean> {
    if (typeof chrome === 'undefined') return false;

    const runtimeAny = chrome.runtime as unknown as {
      getContexts?: (filter: {
        contextTypes?: string[];
        documentUrls?: string[];
      }) => Promise<Array<{ contextType?: string; documentUrl?: string }>>;
    };

    if (typeof runtimeAny?.getContexts === 'function') {
      try {
        const contexts = await runtimeAny.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT'],
          documentUrls: [this.getOffscreenUrl()],
        });
        return Array.isArray(contexts) && contexts.length > 0;
      } catch {
        // Fallback below
      }
    }

    const offscreenAny = (chrome as unknown as {
      offscreen?: { hasDocument?: () => Promise<boolean> };
    }).offscreen;
    if (typeof offscreenAny?.hasDocument === 'function') {
      try {
        return await offscreenAny.hasDocument();
      } catch {
        return false;
      }
    }

    return false;
  }

  async ensureDocument(): Promise<void> {
    if (typeof chrome === 'undefined') {
      throw new Error('Chrome runtime unavailable for Offscreen Document.');
    }

    const offscreenApi = (chrome as unknown as {
      offscreen?: {
        Reason?: { AUDIO_PLAYBACK?: string };
        createDocument: (params: {
          url: string;
          reasons: string[];
          justification: string;
        }) => Promise<void>;
      };
    }).offscreen;

    if (!offscreenApi || typeof offscreenApi.createDocument !== 'function') {
      throw new Error('chrome.offscreen API is not available (requires Chrome 109+).');
    }

    if (await this.hasDocument()) {
      return;
    }

    if (this.creatingPromise) {
      await this.creatingPromise;
      return;
    }

    this.creatingPromise = (async () => {
      if (await this.hasDocument()) return;
      const reason = offscreenApi.Reason?.AUDIO_PLAYBACK ?? 'AUDIO_PLAYBACK';
      await offscreenApi.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [reason],
        justification: 'Play bundled focus music MP3s cleanly across popup close/reopen.',
      });
    })();

    try {
      await this.creatingPromise;
    } finally {
      this.creatingPromise = null;
    }
  }

  async closeDocument(): Promise<void> {
    if (typeof chrome === 'undefined') return;
    const offscreenApi = (chrome as unknown as {
      offscreen?: { closeDocument?: () => Promise<void> };
    }).offscreen;
    if (!offscreenApi || typeof offscreenApi.closeDocument !== 'function') return;

    try {
      if (await this.hasDocument()) {
        await offscreenApi.closeDocument();
      }
    } catch {
      // Ignore if already closed
    }
  }

  async sendCommand<T = unknown>(command: OffscreenMusicCommand): Promise<T | null> {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          command,
          (response?: { success?: boolean; data?: T; error?: string }) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response) {
              resolve(null);
              return;
            }
            if (response.success === false) {
              reject(new Error(response.error || 'Offscreen audio command failed.'));
              return;
            }
            resolve((response.data ?? null) as T | null);
          }
        );
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}

export type { AudioStatusSnapshot };
