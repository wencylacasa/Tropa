/**
 * Fuzzy contact-name matching for "call <name>". Handles Filipino titles
 * ("Kuya Ben", "Ate Rose", "Ben") and Whisper spelling errors. Never guesses:
 * a tie between different contacts returns `ambiguous`, no match returns `none`.
 */

import { cleanText, isFuzzyMatch } from '../wake/fuzzyMatch';

export type Contact = { id: string; name: string };

export type ContactMatch =
  | { status: 'match'; contact: Contact }
  | { status: 'ambiguous'; contacts: Contact[] }
  | { status: 'none' };

/** Words that may be spoken or stored but do not identify a person on their own. */
const TITLES = new Set([
  'kuya', 'ate', 'tito', 'tita', 'lolo', 'lola', 'mama', 'papa', 'nanay', 'tatay',
  'si', 'kay', 'ni', 'ang', 'po', 'sir', 'maam', 'mam',
]);

const FILLERS = new Set(['si', 'kay', 'ni', 'ang', 'po']);

function tokens(text: string): string[] {
  return cleanText(text).split(' ').filter(Boolean);
}

function scoreContact(spokenAll: string[], contact: Contact): number | null {
  const contactTokens = tokens(contact.name);
  if (contactTokens.length === 0) return null;

  const spoken = spokenAll.filter((w) => !FILLERS.has(w));
  if (spoken.length === 0) return null;

  // Only titles spoken ("Mama", "Kuya"): match only a contact stored with exactly that name.
  if (spoken.every((w) => TITLES.has(w))) {
    const same = spoken.length === contactTokens.length && spoken.every((w, i) => w === contactTokens[i]);
    return same ? 100 : null;
  }

  let nameHits = 0;
  let titleHits = 0;
  let nameWords = 0;

  for (const word of spoken) {
    const isTitle = TITLES.has(word);
    if (!isTitle) nameWords += 1;
    const hit = contactTokens.some((c) => (isTitle ? c === word : isFuzzyMatch(word, c)));
    if (hit) {
      if (isTitle) titleHits += 1;
      else nameHits += 1;
    }
  }

  // Every identifying word must be matched, otherwise this is not the person.
  if (nameWords === 0 || nameHits < nameWords) return null;
  return nameHits * 10 + titleHits;
}

export function matchContact(spokenName: string, contacts: readonly Contact[]): ContactMatch {
  const spoken = tokens(spokenName);
  if (spoken.length === 0) return { status: 'none' };

  const scored: { contact: Contact; score: number }[] = [];
  for (const contact of contacts) {
    const score = scoreContact(spoken, contact);
    if (score !== null) scored.push({ contact, score });
  }
  if (scored.length === 0) return { status: 'none' };

  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best).map((s) => s.contact);
  if (top.length === 1) return { status: 'match', contact: top[0] };
  return { status: 'ambiguous', contacts: top };
}
