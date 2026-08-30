/*  Data adapter interface for handling CRUD operations on different data sources. */

import type { CableStore, Collection } from "@/lib/services/types";

export type Query<T> = Partial<T> & Record<string, unknown>;

export interface IDataAdapter {
  list<K extends Collection>(collection: K, query?: Query<CableStore[K][number]>): Promise<CableStore[K]>;
  get<K extends Collection>(collection: K, id: string): Promise<CableStore[K][number] | null>;
  create<K extends Collection>(
    collection: K,
    payload: CableStore[K][number],
  ): Promise<CableStore[K][number]>;
  update<K extends Collection>(
    collection: K,
    id: string,
    patch: Partial<CableStore[K][number]>,
  ): Promise<CableStore[K][number]>;
  remove<K extends Collection>(collection: K, id: string): Promise<void>;
  read(): Promise<CableStore>;
  write(next: CableStore): Promise<CableStore>;
  reset(): Promise<CableStore>;
}
