import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ageInDays, readCache, writeCache, type CachedCalendar } from '../src/cache.js';

const cache: CachedCalendar = {
  fetchedAt: '2026-10-24T08:00:00.000Z',
  addressId: 'd8f27810-a9e3-4f71-9219-620f7da129cd',
  pickups: [{ date: '2026-10-27', fractionId: '3200', fractionName: 'Plastemballasje' }],
};

describe('cache', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wasteplan-trv-'));
    path = join(dir, 'wasteplan-trv.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips without leaving a temp file', async () => {
    await writeCache(path, cache);
    expect(await readCache(path)).toEqual(cache);
    expect(await readdir(dir)).toEqual(['wasteplan-trv.json']);
  });

  it('returns undefined when missing', async () => {
    expect(await readCache(path)).toBeUndefined();
  });

  it('returns undefined for corrupt JSON', async () => {
    await writeFile(path, '{"fetchedAt":');
    expect(await readCache(path)).toBeUndefined();
  });

  it('returns undefined for an unexpected shape', async () => {
    await writeFile(path, JSON.stringify({ ...cache, pickups: [{ date: '2026-10-27' }] }));
    expect(await readCache(path)).toBeUndefined();
    await writeFile(path, JSON.stringify({ ...cache, fetchedAt: 'yesterday' }));
    expect(await readCache(path)).toBeUndefined();
  });
});

describe('ageInDays', () => {
  it('measures fractional days', () => {
    expect(ageInDays(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-22T12:00:00Z'))).toBe(21.5);
  });
});
