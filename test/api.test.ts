import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { calendarUrl, fetchCalendar, parseCalendar } from '../src/api.js';

const fixture: unknown = JSON.parse(readFileSync(new URL('fixtures/calendar.json', import.meta.url), 'utf8'));

describe('parseCalendar', () => {
  it('parses the real response, ignoring its errors field', () => {
    const pickups = parseCalendar(fixture);

    expect(pickups).toHaveLength(14);
    expect(pickups[0]).toEqual({ date: '2026-11-04', fractionId: '9999', fractionName: 'Restavfall' });
    expect(new Set(pickups.map((p) => p.fractionId))).toEqual(new Set(['3200', '2612', '9999', '3000', '2400']));
  });

  it('keeps dates as given', () => {
    const restavfall = parseCalendar(fixture)
      .filter((p) => p.fractionId === '9999')
      .map((p) => p.date);
    expect(restavfall).toEqual(['2026-11-04', '2026-12-02', '2026-12-30']);
  });

  it('accepts numeric fraction ids and date-only strings', () => {
    expect(parseCalendar({ calendar: [{ dato: '2026-11-03', fraksjonId: 9999, fraksjon: ' Restavfall ' }] })).toEqual([
      { date: '2026-11-03', fractionId: '9999', fractionName: 'Restavfall' },
    ]);
  });

  it.each([
    ['null body', null, 'missing "calendar"'],
    ['missing calendar', { calendar: null }, 'missing "calendar"'],
    ['empty calendar', { calendar: [] }, 'empty calendar'],
    ['bad date', { calendar: [{ dato: '27.10.2026', fraksjonId: '1', fraksjon: 'X' }] }, 'index 0'],
    ['missing fraction', { calendar: [{ dato: '2026-10-27T00:00:00', fraksjonId: '1' }] }, 'index 0'],
  ])('rejects %s', (_, body, error) => {
    expect(() => parseCalendar(body)).toThrow(error);
  });
});

describe('fetchCalendar', () => {
  it('requests the calendar for the address and parses it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(fixture));

    const pickups = await fetchCalendar('d8f27810-a9e3-4f71-9219-620f7da129cd', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://trv.no/wp-json/wasteplan/v2/calendar/d8f27810-a9e3-4f71-9219-620f7da129cd',
      expect.anything(),
    );
    expect(pickups).toHaveLength(14);
  });

  it('throws on HTTP errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('nope', { status: 503 }));
    await expect(fetchCalendar('x', fetchImpl)).rejects.toThrow('HTTP 503');
  });

  it('escapes the address id in the URL', () => {
    expect(calendarUrl('a/b')).toBe('https://trv.no/wp-json/wasteplan/v2/calendar/a%2Fb');
  });
});
