import { NativeModule, requireOptionalNativeModule } from 'expo';

export type TropaNativeEvents = {
  /** Base64 PCM16 little-endian, 16 kHz mono, one fixed-size chunk. */
  onAudioData: (event: { data: string }) => void;
  onMicError: (event: { message: string }) => void;
  /** The user tapped "Stop mic" in the foreground notification (mic is already off). */
  onStopRequested: () => void;
};

declare class TropaNativeModule extends NativeModule<TropaNativeEvents> {
  dialNumber(phoneNumber: string): void;
  sendSilentSms(phoneNumber: string, message: string): void;
  startForegroundService(): void;
  stopForegroundService(): void;
  requestAudioFocus(): boolean;
  abandonAudioFocus(): void;
  isBatteryOptimizationIgnored(): boolean;
  requestBatteryExemption(): void;
  startMic(chunkSamples: number): void;
  stopMic(): void;
  beep(durationMs: number): Promise<void>;
  /** Headset-style media keys delivered to the active player. */
  mediaPlayPause(): void;
  mediaNext(): void;
  /** One volume step on the music stream (system panel shown). */
  volumeUp(): void;
  volumeDown(): void;
}

/** null in Expo Go, on web and in Jest: the module only exists in a dev/release build. */
const TropaNative = requireOptionalNativeModule<TropaNativeModule>('TropaNative');

export default TropaNative;

/** For calls that must not silently do nothing (dial, SMS, mic). */
export function requireTropaNative(): TropaNativeModule {
  if (!TropaNative) throw new Error('TropaNative module is not available (needs a development build)');
  return TropaNative;
}
