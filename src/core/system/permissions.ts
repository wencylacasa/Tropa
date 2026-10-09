import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';

import TropaNative from '../../../modules/tropa-native/src';
import { expoContactsBackend, requestContactsPermission } from './contacts';

export type PermissionKey = 'microphone' | 'notifications' | 'contacts' | 'location' | 'battery';

/** `unavailable` = cannot be checked here (Expo Go / not Android) or not needed on this API level. */
export type PermissionStatus = 'granted' | 'denied' | 'unavailable';

const isAndroid = Platform.OS === 'android';
/** POST_NOTIFICATIONS is a runtime permission from Android 13 (API 33). */
const needsNotificationPermission = isAndroid && typeof Platform.Version === 'number' && Platform.Version >= 33;

async function checkAndroid(permission: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]) {
  return (await PermissionsAndroid.check(permission)) ? 'granted' : 'denied';
}

async function requestAndroid(permission: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]) {
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}

async function safe(fn: () => Promise<PermissionStatus>): Promise<PermissionStatus> {
  try {
    return await fn();
  } catch {
    return 'denied';
  }
}

export async function checkPermission(key: PermissionKey): Promise<PermissionStatus> {
  switch (key) {
    case 'microphone':
      return isAndroid ? safe(() => checkAndroid(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) : 'unavailable';
    case 'notifications':
      return needsNotificationPermission
        ? safe(() => checkAndroid(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS))
        : 'unavailable';
    case 'contacts':
      return safe(async () => ((await expoContactsBackend.hasPermission()) ? 'granted' : 'denied'));
    case 'location':
      return safe(async () => ((await Location.getForegroundPermissionsAsync()).granted ? 'granted' : 'denied'));
    case 'battery':
      if (!isAndroid || !TropaNative) return 'unavailable';
      return safe(async () => (TropaNative?.isBatteryOptimizationIgnored() ? 'granted' : 'denied'));
  }
}

/**
 * Asks for one permission. For `battery` this only opens the system dialog;
 * re-check when the app returns to the foreground.
 */
export async function requestPermission(key: PermissionKey): Promise<PermissionStatus> {
  switch (key) {
    case 'microphone':
      return isAndroid ? safe(() => requestAndroid(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) : 'unavailable';
    case 'notifications':
      return needsNotificationPermission
        ? safe(() => requestAndroid(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS))
        : 'unavailable';
    case 'contacts':
      return (await requestContactsPermission()) ? 'granted' : 'denied';
    case 'location':
      return safe(async () => ((await Location.requestForegroundPermissionsAsync()).granted ? 'granted' : 'denied'));
    case 'battery':
      if (!isAndroid || !TropaNative) return 'unavailable';
      return safe(async () => {
        TropaNative?.requestBatteryExemption();
        return 'denied';
      });
  }
}
