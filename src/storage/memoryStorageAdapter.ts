import { IStorageAdapter } from './storageInterface.ts';

/**
 * In-memory storage adapter for unit testing and non-browser environments.
 */
export class MemoryStorageAdapter implements IStorageAdapter {
  private data: Map<string, unknown> = new Map();

  async get<T>(key: string): Promise<T | undefined> {
    const val = this.data.get(key);
    if (val === undefined) return undefined;
    // Deep clone to simulate serialization boundary of chrome.storage.local
    return JSON.parse(JSON.stringify(val)) as T;
  }

  async getMultiple<T extends Record<string, unknown>>(keys: string[]): Promise<Partial<T>> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (this.data.has(key)) {
        result[key] = JSON.parse(JSON.stringify(this.data.get(key)));
      }
    }
    return result as Partial<T>;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.parse(JSON.stringify(value)));
  }

  async setMultiple(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.data.set(key, JSON.parse(JSON.stringify(value)));
    }
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}
