/**
 * Default wake words plus spellings Whisper (language "tl") tends to produce.
 * The user can edit the list in Settings; variants are matched fuzzily too.
 */

export type WakeWord = {
  /** Canonical word or phrase, lowercase. */
  word: string;
  /** Extra spellings to accept exactly (after normalisation). */
  variants: string[];
};

export const DEFAULT_WAKE_WORDS: WakeWord[] = [
  { word: 'yah', variants: ['ya', 'yah', 'yaa', 'yeah', 'yaah'] },
  { word: 'kuya', variants: ['kuya', 'kuys', 'kuyah', 'kuyaa'] },
  { word: 'tol', variants: ['tol', 'tols', 'toll', 'tul', 'tolo'] },
  { word: 'bai', variants: ['bai', 'bay', 'bye', 'baii'] },
  { word: 'tropa', variants: ['tropa', 'tropah', 'troppa', 'trupa'] },
  { word: 'hoy yah', variants: ['hoy ya', 'hoy yah', 'hoi ya', 'hoi yah', 'oy ya', 'oy yah'] },
];
