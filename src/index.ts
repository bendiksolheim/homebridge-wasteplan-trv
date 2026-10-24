import type { API } from 'homebridge';

import { WasteplanPlatform } from './platform.js';
import { PLATFORM_NAME } from './settings.js';

export default (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, WasteplanPlatform);
};
