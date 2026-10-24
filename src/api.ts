import { FETCH_TIMEOUT_MS } from './settings.js';

export interface Pickup {
  /** Pickup date in Europe/Oslo, formatted YYYY-MM-DD. */
  date: string;
  fractionId: string;
  fractionName: string;
}

export function calendarUrl(addressId: string): string {
  return `https://trv.no/wp-json/wasteplan/v2/calendar/${encodeURIComponent(addressId)}`;
}

export async function fetchCalendar(addressId: string, fetchImpl: typeof fetch = fetch): Promise<Pickup[]> {
  const response = await fetchImpl(calendarUrl(addressId), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`trv.no responded with HTTP ${response.status}`);
  }
  return parseCalendar(await response.json());
}

const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(T|$)/;

/**
 * Extracts pickups from the API response. The response's `errors` field is
 * ignored: it is non-empty even for valid addresses.
 */
export function parseCalendar(body: unknown): Pickup[] {
  if (!isRecord(body) || !Array.isArray(body.calendar)) {
    throw new Error('Unexpected response from trv.no: missing "calendar" list');
  }

  const pickups = body.calendar.map((entry: unknown, index: number): Pickup => {
    if (!isRecord(entry)) {
      throw new Error(`Unexpected calendar entry at index ${index}`);
    }
    const date = typeof entry.dato === 'string' ? DATE_PATTERN.exec(entry.dato)?.[1] : undefined;
    const fractionId =
      typeof entry.fraksjonId === 'string' || typeof entry.fraksjonId === 'number'
        ? String(entry.fraksjonId)
        : undefined;
    const fractionName = typeof entry.fraksjon === 'string' ? entry.fraksjon.trim() : undefined;
    if (!date || !fractionId || !fractionName) {
      throw new Error(`Unexpected calendar entry at index ${index}: ${JSON.stringify(entry)}`);
    }
    return { date, fractionId, fractionName };
  });

  if (pickups.length === 0) {
    throw new Error('trv.no returned an empty calendar. Is the addressId correct?');
  }
  return pickups;
}

export function isPickup(value: unknown): value is Pickup {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.fractionId === 'string' &&
    typeof value.fractionName === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
