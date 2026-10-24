import { join } from 'node:path';

import type {
  API,
  Characteristic,
  CharacteristicValue,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { fetchCalendar, type Pickup } from './api.js';
import { ageInDays, readCache, writeCache } from './cache.js';
import { parseConfig, type WasteplanConfig } from './config.js';
import { datesByFraction, fractionNames, isOpen, lastPickupDate, nextPickup, osloTime } from './schedule.js';
import { PLATFORM_NAME, PLUGIN_NAME, REFRESH_INTERVAL_MS, RETRY_INTERVAL_MS, STALE_AFTER_DAYS } from './settings.js';

interface AccessoryContext {
  addressId: string;
  fractionId: string;
  fractionName: string;
}

type WasteAccessory = PlatformAccessory<AccessoryContext>;

export class WasteplanPlatform implements DynamicPlatformPlugin {
  private readonly Service: typeof Service;
  private readonly Characteristic: typeof Characteristic;
  private readonly config?: WasteplanConfig;
  private readonly cachePath: string;

  private readonly accessories = new Map<string, WasteAccessory>();
  /** Last state pushed to HomeKit per accessory UUID, so changes are logged once. */
  private readonly openState = new Map<string, boolean>();

  private pickups: Pickup[] = [];
  private pickupDates = new Map<string, Set<string>>();
  private fetchedAt?: Date;

  private tickTimer?: NodeJS.Timeout;
  private fetchTimer?: NodeJS.Timeout;

  constructor(
    private readonly log: Logging,
    rawConfig: PlatformConfig,
    private readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.cachePath = join(api.user.storagePath(), 'wasteplan-trv.json');

    try {
      this.config = parseConfig(rawConfig);
    } catch (error) {
      this.log.error(`Invalid configuration: ${message(error)}`);
      return;
    }

    api.on('didFinishLaunching', () => void this.start());
    api.on('shutdown', () => this.stop());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    const restored = accessory as WasteAccessory;
    this.accessories.set(restored.UUID, restored);
    this.configureServices(restored);
  }

  private async start(): Promise<void> {
    const config = this.config!;

    const cache = await readCache(this.cachePath);
    if (cache?.addressId === config.addressId) {
      this.log.info(`Loaded cached wasteplan from ${cache.fetchedAt}`);
      this.applyPickups(cache.pickups, new Date(cache.fetchedAt));
    } else {
      this.syncAccessories();
    }

    this.scheduleTick();
    await this.refresh();
  }

  private stop(): void {
    clearTimeout(this.tickTimer);
    clearTimeout(this.fetchTimer);
  }

  private async refresh(): Promise<void> {
    const config = this.config!;
    let delay: number;
    try {
      const pickups = await fetchCalendar(config.addressId);
      const fetchedAt = new Date();
      this.applyPickups(pickups, fetchedAt);
      await writeCache(this.cachePath, {
        fetchedAt: fetchedAt.toISOString(),
        addressId: config.addressId,
        pickups,
      }).catch((error: unknown) => this.log.warn(`Could not write cache: ${message(error)}`));
      this.logNextPickup();
      delay = REFRESH_INTERVAL_MS;
    } catch (error) {
      this.log.warn(`Could not fetch wasteplan from trv.no: ${message(error)}. Retrying in 1 hour.`);
      this.checkStaleness();
      delay = RETRY_INTERVAL_MS;
    }
    this.fetchTimer = setTimeout(() => void this.refresh(), delay);
  }

  private checkStaleness(): void {
    if (!this.fetchedAt) {
      this.log.error('No wasteplan data available yet. Sensors stay closed until trv.no can be reached.');
      return;
    }
    const age = ageInDays(this.fetchedAt, new Date());
    if (age > STALE_AFTER_DAYS) {
      this.log.error(`Wasteplan data is ${Math.floor(age)} days old. Pickup notifications may be wrong or missing.`);
    }
    const last = lastPickupDate(this.pickups);
    if (last !== undefined && last < osloTime(new Date()).date) {
      this.log.error(`Cached wasteplan ends ${last}. No more pickups are known.`);
    }
  }

  private logNextPickup(): void {
    const next = nextPickup(this.pickups, osloTime(new Date()).date);
    if (next) {
      this.log.info(`Next pickup ${next.date}: ${next.fractions.join(', ')}`);
    } else {
      this.log.warn('The wasteplan from trv.no contains no upcoming pickups.');
    }
  }

  private applyPickups(pickups: Pickup[], fetchedAt: Date): void {
    this.pickups = pickups;
    this.pickupDates = datesByFraction(pickups);
    this.fetchedAt = fetchedAt;
    this.syncAccessories();
    this.update();
  }

  /**
   * Adds sensors for new fractions and removes sensors that are excluded or
   * belong to another address. Fractions that are merely absent from the
   * current calendar window are kept.
   */
  private syncAccessories(): void {
    const config = this.config!;

    const stale = [...this.accessories.values()].filter(
      (a) => a.context.addressId !== config.addressId || config.exclude.has(a.context.fractionId),
    );
    if (stale.length > 0) {
      for (const accessory of stale) {
        this.accessories.delete(accessory.UUID);
        this.openState.delete(accessory.UUID);
        this.log.info(`Removing sensor "${accessory.displayName}"`);
      }
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }

    const added: WasteAccessory[] = [];
    for (const [fractionId, fractionName] of fractionNames(this.pickups)) {
      if (config.exclude.has(fractionId)) {
        continue;
      }
      const uuid = this.api.hap.uuid.generate(`wasteplan-trv:${config.addressId}:${fractionId}`);
      if (this.accessories.has(uuid)) {
        continue;
      }
      const accessory: WasteAccessory = new this.api.platformAccessory(fractionName, uuid);
      accessory.context = { addressId: config.addressId, fractionId, fractionName };
      this.configureServices(accessory);
      this.accessories.set(uuid, accessory);
      added.push(accessory);
      this.log.info(`Adding sensor "${fractionName}" (fraction ${fractionId})`);
    }
    if (added.length > 0) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, added);
    }
  }

  private configureServices(accessory: WasteAccessory): void {
    const { fractionId, fractionName } = accessory.context;

    accessory
      .getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, 'TRV')
      .setCharacteristic(this.Characteristic.Model, fractionName)
      .setCharacteristic(this.Characteristic.SerialNumber, fractionId);

    const sensor =
      accessory.getService(this.Service.ContactSensor) ??
      accessory.addService(this.Service.ContactSensor, fractionName);
    sensor
      .getCharacteristic(this.Characteristic.ContactSensorState)
      .onGet(() => this.contactState(this.isOpen(accessory)));
  }

  /** Re-evaluates sensors at the start of every minute. */
  private scheduleTick(): void {
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    this.tickTimer = setTimeout(() => {
      this.update();
      this.scheduleTick();
    }, msToNextMinute + 50);
  }

  private update(): void {
    for (const accessory of this.accessories.values()) {
      const open = this.isOpen(accessory);
      if (this.openState.get(accessory.UUID) === open) {
        continue;
      }
      this.openState.set(accessory.UUID, open);
      accessory
        .getService(this.Service.ContactSensor)
        ?.updateCharacteristic(this.Characteristic.ContactSensorState, this.contactState(open));
      if (open) {
        this.log.info(`Pickup today: ${accessory.displayName}`);
      } else {
        this.log.debug(`Closed: ${accessory.displayName}`);
      }
    }
  }

  private isOpen(accessory: WasteAccessory): boolean {
    const config = this.config;
    const dates = this.pickupDates.get(accessory.context.fractionId);
    if (!config || !dates) {
      return false;
    }
    return isOpen(dates, osloTime(new Date()), config.openTime, config.closeTime);
  }

  private contactState(open: boolean): CharacteristicValue {
    return open
      ? this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.Characteristic.ContactSensorState.CONTACT_DETECTED;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
