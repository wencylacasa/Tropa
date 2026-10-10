import TropaNative from '../../../modules/tropa-native/src';

export type MediaControl = {
  playPause(): void;
  next(): void;
  volumeUp(): void;
  volumeDown(): void;
};

/**
 * Media transport keys + music-stream volume through the local native module.
 * Null in Expo Go / web / Jest, where no native module exists.
 */
export function createMediaControl(): MediaControl | null {
  // Method checks, not just module presence: an OTA-updated bundle can run on
  // an older build that lacks the new Kotlin functions.
  if (
    !TropaNative ||
    typeof TropaNative.mediaPlayPause !== 'function' ||
    typeof TropaNative.mediaNext !== 'function' ||
    typeof TropaNative.volumeUp !== 'function' ||
    typeof TropaNative.volumeDown !== 'function'
  ) {
    return null;
  }
  const native = TropaNative;
  return {
    playPause: () => native.mediaPlayPause(),
    next: () => native.mediaNext(),
    volumeUp: () => native.volumeUp(),
    volumeDown: () => native.volumeDown(),
  };
}
