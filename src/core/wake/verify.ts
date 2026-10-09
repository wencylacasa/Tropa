/**
 * Wake-word verification of a Whisper transcript.
 * Looks at the first 1-2 words only, so "kuya" inside normal conversation
 * does not trigger. No match -> caller discards the clip silently.
 */

import { isFuzzyMatch } from './fuzzyMatch';
import { DEFAULT_WAKE_WORDS, type WakeWord } from './wakeWords';

export type VerifyResult =
  | { matched: false }
  | {
      matched: true;
      /** Canonical wake word that matched, e.g. "hoy yah". */
      wakeWord: string;
      /** Transcript with the wake word removed (may be empty). */
      command: string;
      /** True when only the wake word was said -> reply "Yes?" and listen again. */
      isEmptyCommand: boolean;
    };

const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function stripEdges(token: string): string {
  return token.replace(EDGE_PUNCT, '');
}

function phraseMatches(tokens: string[], phrase: string): boolean {
  const parts = phrase.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || tokens.length < parts.length) return false;
  return parts.every((part, i) => isFuzzyMatch(tokens[i], part));
}

export function verifyWakeWord(
  transcript: string,
  wakeWords: WakeWord[] = DEFAULT_WAKE_WORDS,
): VerifyResult {
  const rawTokens = transcript.trim().split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return { matched: false };

  const head = rawTokens.slice(0, 2).map(stripEdges);

  // Prefer the longest phrase so "hoy yah" wins over a single-word match.
  const candidates = wakeWords
    .flatMap((w) =>
      [w.word, ...w.variants].map((phrase) => ({
        canonical: w.word,
        phrase,
        length: phrase.split(/\s+/).filter(Boolean).length,
      })),
    )
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    if (phraseMatches(head, candidate.phrase)) {
      const command = rawTokens
        .slice(candidate.length)
        .join(' ')
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .trim();
      return {
        matched: true,
        wakeWord: candidate.canonical,
        command,
        isEmptyCommand: command.length === 0,
      };
    }
  }

  return { matched: false };
}
