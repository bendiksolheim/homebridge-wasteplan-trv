import { describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config.js';

const addressId = 'd8f27810-a9e3-4f71-9219-620f7da129cd';

describe('parseConfig', () => {
  it('applies defaults', () => {
    expect(parseConfig({ addressId })).toEqual({
      addressId,
      openTime: '06:00',
      closeTime: '23:59',
      exclude: new Set(),
    });
  });

  it('normalizes the address id', () => {
    expect(parseConfig({ addressId: ` ${addressId.toUpperCase()} ` }).addressId).toBe(addressId);
  });

  it('reads times and excluded fractions', () => {
    const config = parseConfig({ addressId, openTime: '05:30', closeTime: '09:00', exclude: ['3000', 2400] });
    expect(config.openTime).toBe('05:30');
    expect(config.closeTime).toBe('09:00');
    expect(config.exclude).toEqual(new Set(['3000', '2400']));
  });

  it.each([
    ['missing address id', {}, 'addressId'],
    ['malformed address id', { addressId: 'https://trv.no/plan/abc' }, 'addressId'],
    ['malformed time', { addressId, openTime: '6:00' }, 'HH:MM'],
    ['out of range time', { addressId, closeTime: '24:00' }, 'HH:MM'],
    ['open after close', { addressId, openTime: '18:00', closeTime: '06:00' }, 'earlier than'],
    ['open equal to close', { addressId, openTime: '06:00', closeTime: '06:00' }, 'earlier than'],
    ['exclude not a list', { addressId, exclude: '3000' }, 'list of fraction IDs'],
  ])('rejects %s', (_, raw, error) => {
    expect(() => parseConfig(raw)).toThrow(error);
  });
});
