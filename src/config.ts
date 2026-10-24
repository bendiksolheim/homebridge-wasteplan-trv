import { DEFAULT_CLOSE_TIME, DEFAULT_OPEN_TIME } from './settings.js';

export interface WasteplanConfig {
  addressId: string;
  openTime: string;
  closeTime: string;
  exclude: ReadonlySet<string>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates the raw platform config. Throws an Error with a user-facing message on invalid input. */
export function parseConfig(raw: Record<string, unknown>): WasteplanConfig {
  const addressId = typeof raw.addressId === 'string' ? raw.addressId.trim().toLowerCase() : '';
  if (!UUID_PATTERN.test(addressId)) {
    throw new Error('"addressId" must be the UUID from your plan URL on https://trv.no/plan/');
  }

  const openTime = parseTime(raw.openTime, 'openTime', DEFAULT_OPEN_TIME);
  const closeTime = parseTime(raw.closeTime, 'closeTime', DEFAULT_CLOSE_TIME);
  if (openTime >= closeTime) {
    throw new Error(`"openTime" (${openTime}) must be earlier than "closeTime" (${closeTime})`);
  }

  if (raw.exclude !== undefined && !Array.isArray(raw.exclude)) {
    throw new Error('"exclude" must be a list of fraction IDs');
  }
  const exclude = new Set((raw.exclude ?? []).map((id: unknown) => String(id).trim()));

  return { addressId, openTime, closeTime, exclude };
}

function parseTime(value: unknown, key: string, fallback: string): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new Error(`"${key}" must be a time in HH:MM format, got ${JSON.stringify(value)}`);
  }
  return value;
}
