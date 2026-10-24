import { readFile, rename, writeFile } from 'node:fs/promises';

import { isPickup, type Pickup } from './api.js';

export interface CachedCalendar {
  /** ISO timestamp of the last successful fetch. */
  fetchedAt: string;
  addressId: string;
  pickups: Pickup[];
}

/** Returns the cached calendar, or undefined if it is missing or unreadable. */
export async function readCache(path: string): Promise<CachedCalendar | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (
      typeof data === 'object' &&
      data !== null &&
      'fetchedAt' in data &&
      typeof data.fetchedAt === 'string' &&
      !Number.isNaN(Date.parse(data.fetchedAt)) &&
      'addressId' in data &&
      typeof data.addressId === 'string' &&
      'pickups' in data &&
      Array.isArray(data.pickups) &&
      data.pickups.every(isPickup)
    ) {
      return { fetchedAt: data.fetchedAt, addressId: data.addressId, pickups: data.pickups };
    }
  } catch {
    // Corrupt JSON is treated as no cache.
  }
  return undefined;
}

export async function writeCache(path: string, cache: CachedCalendar): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

export function ageInDays(fetchedAt: Date, now: Date): number {
  return (now.getTime() - fetchedAt.getTime()) / (24 * 60 * 60 * 1000);
}
