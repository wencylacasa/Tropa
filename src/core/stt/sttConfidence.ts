/**
 * whisper.rn returns text and segment timings but NO confidence score, so we
 * estimate one from the text itself. It only needs to catch the common failure
 * modes: empty output, blank-audio markers, and Whisper's well-known
 * hallucinations on silence/noise. Tune on a real device.
 *
 * The orchestrator only uses this AFTER a wake word matched (or for the
 * follow-up clip after a bare wake word), so a low score means "ask again",
 * never "act on a guess".
 */

import { cleanText } from '../wake/fuzzyMatch';

export const CONFIDENT = 0.9;
export const SUSPICIOUS = 0.2;
export const NONE = 0;

// Typical Whisper output when it "hears" silence or noise.
const SILENCE_HALLUCINATIONS = new Set([
  'thank you',
  'thanks for watching',
  'you',
  'please subscribe',
  'salamat sa panonood',
  'salamat po sa panonood',
]);

export function estimateConfidence(text: string): number {
  const raw = text.trim();
  if (raw.length === 0) return NONE;

  // "[BLANK_AUDIO]", "(music)", "♪ ... ♪"
  if (/^[[(].*[\])]$/.test(raw) || raw.includes('♪')) return NONE;

  const cleaned = cleanText(raw);
  if (cleaned.length === 0) return NONE;

  if (SILENCE_HALLUCINATIONS.has(cleaned)) return SUSPICIOUS;

  // Looping output such as "ya ya ya ya ya ya".
  const tokens = cleaned.split(' ');
  if (tokens.length >= 5) {
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    if (Math.max(...counts.values()) / tokens.length >= 0.6) return SUSPICIOUS;
  }

  return CONFIDENT;
}
