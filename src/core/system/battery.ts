import * as Battery from 'expo-battery';

import { toBatteryPercent } from './batteryPercent';

/** Matches PipelinePorts.getBatteryLevel: 0-100, or null if unavailable. */
export async function getBatteryLevel(): Promise<number | null> {
  try {
    return toBatteryPercent(await Battery.getBatteryLevelAsync());
  } catch {
    return null;
  }
}
