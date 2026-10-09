import TropaNative from '../../../modules/tropa-native/src';

/**
 * Adapter to request and abandon audio focus.
 * This ensures background music (like Spotify) ducks (lowers volume)
 * when Tropa is recording a voice command or speaking a reply.
 */
export const audioFocus = {
  /**
   * Requests audio focus. Returns true if granted.
   */
  request(): boolean {
    try {
      return TropaNative?.requestAudioFocus() ?? false;
    } catch {
      return false;
    }
  },

  /**
   * Abandons audio focus.
   */
  abandon(): void {
    try {
      TropaNative?.abandonAudioFocus();
    } catch {
      // Ignored
    }
  },
};
