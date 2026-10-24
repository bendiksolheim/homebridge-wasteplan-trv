import type { Pickup } from './api.js';
import { TIME_ZONE } from './settings.js';

export interface LocalTime {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour */
  time: string;
}

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Wall-clock date and time in Oslo, regardless of the server's time zone. */
export function osloTime(now: Date): LocalTime {
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** Whether a sensor with the given pickup dates is open at `now`. The window is [openTime, closeTime). */
export function isOpen(pickupDates: ReadonlySet<string>, now: LocalTime, openTime: string, closeTime: string): boolean {
  return pickupDates.has(now.date) && openTime <= now.time && now.time < closeTime;
}

export function datesByFraction(pickups: readonly Pickup[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const { fractionId, date } of pickups) {
    let dates = result.get(fractionId);
    if (!dates) {
      dates = new Set();
      result.set(fractionId, dates);
    }
    dates.add(date);
  }
  return result;
}

/** Fraction ID to display name, in order of first appearance. */
export function fractionNames(pickups: readonly Pickup[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const { fractionId, fractionName } of pickups) {
    if (!result.has(fractionId)) {
      result.set(fractionId, fractionName);
    }
  }
  return result;
}

export function lastPickupDate(pickups: readonly Pickup[]): string | undefined {
  let last: string | undefined;
  for (const { date } of pickups) {
    if (last === undefined || date > last) {
      last = date;
    }
  }
  return last;
}

export function nextPickup(
  pickups: readonly Pickup[],
  today: string,
): { date: string; fractions: string[] } | undefined {
  let date: string | undefined;
  for (const pickup of pickups) {
    if (pickup.date >= today && (date === undefined || pickup.date < date)) {
      date = pickup.date;
    }
  }
  if (date === undefined) {
    return undefined;
  }
  return { date, fractions: pickups.filter((p) => p.date === date).map((p) => p.fractionName) };
}
