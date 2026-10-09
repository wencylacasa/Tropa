/**
 * Yes/no listener for confirmations (calls, SOS cancel). Accepts Tagalog and
 * English. Ambiguous input (both yes and no words, or neither) is "unknown";
 * callers must treat "unknown" as NOT confirmed.
 */

import { cleanText } from '../wake/fuzzyMatch';

export type YesNo = 'yes' | 'no' | 'unknown';

const YES_WORDS = new Set(['oo', 'opo', 'sige', 'ok', 'okay', 'yes', 'yeah', 'yep', 'go', 'tuloy']);
const NO_WORDS = new Set(['hindi', 'huwag', 'wag', 'no', 'cancel', 'stop', 'ayoko', 'hwag']);

export function parseYesNo(text: string): YesNo {
  const tokens = cleanText(text).split(' ').filter(Boolean);
  const hasYes = tokens.some((t) => YES_WORDS.has(t));
  const hasNo = tokens.some((t) => NO_WORDS.has(t));
  if (hasYes && !hasNo) return 'yes';
  if (hasNo && !hasYes) return 'no';
  return 'unknown';
}
