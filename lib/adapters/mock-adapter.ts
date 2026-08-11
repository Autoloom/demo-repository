/*  Mock data adapter for simulating CRUD operations on a local in-memory store. */

"use client";

import { seedData } from "@/lib/seed/data";
import type { CableStore, Collection } from "@/lib/services/types";
import type { IDataAdapter, Query } from "@/lib/adapters/adapter";

const STORAGE_KEY = "cableos2:v2:store";
const LATENCY_MS = 120;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sleep() {
  return new Promise((resolve) => window.setTimeout(resolve, LATENCY_MS));
}

function getId(item: unknown): string {
  return String((item as { id?: string }).id ?? "");
}

function matches<T>(item: T, query?: Query<T>) {
  if (!query) return true;
  return Object.entries(query).every(([key, value]) => {
    if (value === undefined || value === null || value === "") return true;
    return (item as Record<string, unknown>)[key] === value;
  });
}

export class MockAdapter implements IDataAdapter {
  async read(): Promise<CableStore> {
    await sleep();
    if (typeof window === "undefined") return clone(seedData);
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const seeded = clone(seedData);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(stored) as CableStore;
  }

  async write(next: CableStore): Promise<CableStore> {
    await sleep();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return clone(next);
  }

  async reset(): Promise<CableStore> {
    const seeded = clone(seedData);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    }
    await sleep();
    return seeded;
  }

  async list<K extends Collection>(collection: K, query?: Query<CableStore[K][number]>): Promise<CableStore[K]> {
    const store = await this.read();
    const rows = store[collection] as CableStore[K][number][];
    return rows.filter((item) => matches(item, query)) as CableStore[K];
  }

  async get<K extends Collection>(collection: K, id: string): Promise<CableStore[K][number] | null> {
    const store = await this.read();
    const rows = store[collection] as CableStore[K][number][];
    return rows.find((item) => getId(item) === id) ?? null;
  }

  async create<K extends Collection>(
    collection: K,
    payload: CableStore[K][number],
  ): Promise<CableStore[K][number]> {
    const store = await this.read();
    const rows = store[collection] as CableStore[K][number][];
    rows.unshift(payload);
    await this.write(store);
    return clone(payload);
  }

  async update<K extends Collection>(
    collection: K,
    id: string,
    patch: Partial<CableStore[K][number]>,
  ): Promise<CableStore[K][number]> {
    const store = await this.read();
    const rows = store[collection] as CableStore[K][number][];
    const index = rows.findIndex((item) => getId(item) === id);
    if (index < 0) throw new Error(`Missing ${String(collection)} record ${id}`);
    rows[index] = { ...rows[index], ...patch };
    await this.write(store);
    return clone(rows[index]);
  }

  async remove<K extends Collection>(collection: K, id: string): Promise<void> {
    const store = await this.read();
    const rows = store[collection] as CableStore[K][number][];
    const nextRows = rows.filter((item) => getId(item) !== id);
    (store[collection] as CableStore[K][number][]) = nextRows;
    await this.write(store);
  }
}

export const adapter = new MockAdapter();
