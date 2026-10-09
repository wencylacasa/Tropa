import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class TropaNativeModule extends NativeModule {
  dialNumber(phoneNumber: string): void;
  sendSilentSms(phoneNumber: string, message: string): void;
  startForegroundService(): void;
  stopForegroundService(): void;
  requestAudioFocus(): boolean;
  abandonAudioFocus(): void;
  isBatteryOptimizationIgnored(): boolean;
  requestBatteryExemption(): void;
}

/** null in Expo Go, on web and in Jest: the module only exists in a dev/release build. */
const TropaNative = requireOptionalNativeModule<TropaNativeModule>('TropaNative');

export default TropaNative;

/** For calls that must not silently do nothing (dial, SMS). */
export function requireTropaNative(): TropaNativeModule {
  if (!TropaNative) throw new Error('TropaNative module is not available (needs a development build)');
  return TropaNative;
}
