import { IStorageAdapter } from '../storageInterface.ts';

export interface Migration {
  version: number;
  description: string;
  up(storage: IStorageAdapter): Promise<void>;
}
