/** Levenshtein distance + light phonetic normalisation for wake-word matching. */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Lowercase, strip accents and punctuation (keeps letters and spaces). */
export function cleanText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phonetic-ish normalisation of a single word so spelling variants collapse:
 * "yah"/"ya"/"yaa" -> "ya", "kuya"/"cuya" -> "kuya", "tropa"/"troppa" -> "tropa".
 */
export function normalizeWord(word: string): string {
  return cleanText(word)
    .replace(/\s/g, '')
    .replace(/ph/g, 'f')
    .replace(/[cq]/g, 'k')
    .replace(/(.)\1+/g, '$1')
    .replace(/h$/, '');
}

/**
 * True if `token` is the same word as `target` after normalisation, or close
 * enough. Very short words (< 3 letters) must match exactly to avoid
 * accepting everyday words such as "to" or "ay".
 */
export function isFuzzyMatch(token: string, target: string): boolean {
  const a = normalizeWord(token);
  const b = normalizeWord(target);
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;

  // 3-letter words (tol, bai) rely on the explicit variants list, not edits.
  const longest = Math.max(a.length, b.length);
  const maxDistance = longest <= 3 ? 0 : longest <= 5 ? 1 : 2;
  return levenshtein(a, b) <= maxDistance;
}
