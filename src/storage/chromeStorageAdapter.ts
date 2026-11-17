import { IStorageAdapter } from './storageInterface.ts';

/**
 * Chrome Storage adapter interacting directly with chrome.storage.local
 */
export class ChromeStorageAdapter implements IStorageAdapter {
  constructor(private area: 'local' | 'session' = 'local') {}

  private getStorageArea(): chrome.storage.StorageArea {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      throw new Error(
        `ChromeStorageAdapter: chrome.storage is not available in the current execution environment.`
      );
    }
    const storageArea = this.area === 'session' ? chrome.storage.session : chrome.storage.local;
    if (!storageArea) {
      throw new Error(
        `ChromeStorageAdapter: chrome.storage.${this.area} is not available in the current execution environment.`
      );
    }
    return storageArea;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const area = this.getStorageArea();
    return new Promise((resolve, reject) => {
      area.get([key], (result) => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(result[key] as T | undefined);
      });
    });
  }

  async getMultiple<T extends Record<string, unknown>>(keys: string[]): Promise<Partial<T>> {
    const area = this.getStorageArea();
    return new Promise((resolve, reject) => {
      area.get(keys, (result) => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(result as Partial<T>);
      });
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const area = this.getStorageArea();
    return new Promise((resolve, reject) => {
      area.set({ [key]: value }, () => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  async setMultiple(items: Record<string, unknown>): Promise<void> {
    const area = this.getStorageArea();
    return new Promise((resolve, reject) => {
      area.set(items, () => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  async remove(key: string): Promise<void> {
    const area = this.getStorageArea();
    return new Promise((resolve, reject) => {
      area.remove([key], () => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  async clear(): Promise<void> {
    const area = this.getStorageArea();
    return new Promise((resolve, reject) => {
      area.clear(() => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }
}
