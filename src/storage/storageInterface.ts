/**
 * Abstract storage interface enabling dependency injection and testing
 * without requiring real browser chrome APIs.
 */

export interface IStorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  getMultiple<T extends Record<string, unknown>>(keys: string[]): Promise<Partial<T>>;
  set<T>(key: string, value: T): Promise<void>;
  setMultiple(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}
