import { describe, expect, it } from 'vitest';

import type { Pickup } from '../src/api.js';
import { datesByFraction, fractionNames, isOpen, lastPickupDate, nextPickup, osloTime } from '../src/schedule.js';

const pickups: Pickup[] = [
  { date: '2026-10-27', fractionId: '3200', fractionName: 'Plastemballasje' },
  { date: '2026-10-27', fractionId: '2612', fractionName: 'Glass- og metallemballasje' },
  { date: '2026-11-03', fractionId: '9999', fractionName: 'Restavfall' },
  { date: '2026-11-03', fractionId: '3000', fractionName: 'Matavfall' },
  { date: '2026-11-17', fractionId: '3000', fractionName: 'Matavfall' },
];

describe('osloTime', () => {
  it('converts UTC to Oslo summer time (UTC+2)', () => {
    expect(osloTime(new Date('2026-07-01T22:30:00Z'))).toEqual({ date: '2026-07-02', time: '00:30' });
  });

  it('converts UTC to Oslo winter time (UTC+1)', () => {
    expect(osloTime(new Date('2026-11-02T23:00:00Z'))).toEqual({ date: '2026-11-03', time: '00:00' });
    expect(osloTime(new Date('2026-11-02T22:59:00Z'))).toEqual({ date: '2026-11-02', time: '23:59' });
  });

  it('handles the switch to winter time (2026-10-25 03:00 CEST -> 02:00 CET)', () => {
    expect(osloTime(new Date('2026-10-25T00:59:00Z'))).toEqual({ date: '2026-10-25', time: '02:59' });
    expect(osloTime(new Date('2026-10-25T01:00:00Z'))).toEqual({ date: '2026-10-25', time: '02:00' });
    expect(osloTime(new Date('2026-10-25T05:00:00Z'))).toEqual({ date: '2026-10-25', time: '06:00' });
  });

  it('handles the switch to summer time (2027-03-28 02:00 CET -> 03:00 CEST)', () => {
    expect(osloTime(new Date('2027-03-28T00:59:00Z'))).toEqual({ date: '2027-03-28', time: '01:59' });
    expect(osloTime(new Date('2027-03-28T01:00:00Z'))).toEqual({ date: '2027-03-28', time: '03:00' });
  });

  it('formats midnight as 00, not 24', () => {
    expect(osloTime(new Date('2026-12-31T23:00:00Z')).time).toBe('00:00');
  });
});

describe('isOpen', () => {
  const dates = new Set(['2026-11-03']);
  const at = (date: string, time: string) => isOpen(dates, { date, time }, '06:00', '23:59');

  it('is closed before openTime on pickup day', () => {
    expect(at('2026-11-03', '05:59')).toBe(false);
  });

  it('opens at openTime', () => {
    expect(at('2026-11-03', '06:00')).toBe(true);
    expect(at('2026-11-03', '12:00')).toBe(true);
    expect(at('2026-11-03', '23:58')).toBe(true);
  });

  it('closes at closeTime', () => {
    expect(at('2026-11-03', '23:59')).toBe(false);
  });

  it('is closed on other days', () => {
    expect(at('2026-11-02', '12:00')).toBe(false);
    expect(at('2026-11-04', '06:00')).toBe(false);
  });

  it('opens at 06:00 Oslo time when the server runs in UTC', () => {
    expect(isOpen(dates, osloTime(new Date('2026-11-03T04:59:00Z')), '06:00', '23:59')).toBe(false);
    expect(isOpen(dates, osloTime(new Date('2026-11-03T05:00:00Z')), '06:00', '23:59')).toBe(true);
  });
});

describe('datesByFraction', () => {
  it('groups pickup dates per fraction', () => {
    const result = datesByFraction(pickups);
    expect(result.get('3000')).toEqual(new Set(['2026-11-03', '2026-11-17']));
    expect(result.get('3200')).toEqual(new Set(['2026-10-27']));
    expect(result.has('2400')).toBe(false);
  });
});

describe('fractionNames', () => {
  it('lists each fraction once in order of first appearance', () => {
    expect([...fractionNames(pickups)]).toEqual([
      ['3200', 'Plastemballasje'],
      ['2612', 'Glass- og metallemballasje'],
      ['9999', 'Restavfall'],
      ['3000', 'Matavfall'],
    ]);
  });
});

describe('lastPickupDate', () => {
  it('returns the latest date', () => {
    expect(lastPickupDate(pickups)).toBe('2026-11-17');
    expect(lastPickupDate([])).toBeUndefined();
  });
});

describe('nextPickup', () => {
  it('returns the earliest date from today with all its fractions', () => {
    expect(nextPickup(pickups, '2026-10-28')).toEqual({ date: '2026-11-03', fractions: ['Restavfall', 'Matavfall'] });
  });

  it('includes today', () => {
    expect(nextPickup(pickups, '2026-10-27')?.date).toBe('2026-10-27');
  });

  it('returns undefined when the plan has run out', () => {
    expect(nextPickup(pickups, '2026-11-18')).toBeUndefined();
  });
});
