/**
 * Safe parsing + validation of the Qwen JSON output, and the never-guess
 * guard for call_contact / sos_alert. Pure logic, no native deps.
 *
 * Expected model output (enforced by the GBNF grammar, but never trusted):
 *   {"intent":"tell_time","target":null}
 * Extra fields (e.g. a stray "reply") are ignored. Any failure resolves to
 * the `unknown` intent.
 */

import { cleanText, isFuzzyMatch } from '../wake/fuzzyMatch';
import type { Intent, ParsedCommand } from './types';

export const INTENTS: readonly Intent[] = [
  'tell_time',
  'tell_date',
  'battery_level',
  'media_play',
  'media_pause',
  'media_next',
  'volume_up',
  'volume_down',
  'repeat_last',
  'call_contact',
  'sos_alert',
  'where_am_i',
  'greet',
  'thank',
  'identity',
  'help',
  'unknown',
];

const UNKNOWN: ParsedCommand = { intent: 'unknown', target: null, source: 'llm' };

function isIntent(value: unknown): value is Intent {
  return typeof value === 'string' && (INTENTS as readonly string[]).includes(value);
}

/** Parse raw model text into a validated command. Never throws. */
export function parseLlmOutput(raw: string): ParsedCommand {
  if (typeof raw !== 'string') return UNKNOWN;

  // Models sometimes wrap JSON in text or code fences; take the outermost braces.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return UNKNOWN;

  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return UNKNOWN;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return UNKNOWN;

  const obj = data as Record<string, unknown>;
  if (!isIntent(obj.intent)) return UNKNOWN;

  let target: string | null = null;
  if (typeof obj.target === 'string' && obj.target.trim().length > 0) {
    target = obj.target.trim();
  } else if (obj.target !== null && obj.target !== undefined && obj.target !== '') {
    return UNKNOWN; // wrong type
  }

  // target only makes sense for call_contact.
  if (obj.intent !== 'call_contact') target = null;

  return { intent: obj.intent, target, source: 'llm' };
}

/** Words that must be present in the transcript before the LLM may raise an SOS. */
const SOS_WORDS = new Set([
  'tulong',
  'saklolo',
  'sos',
  'emergency',
  'naaksidente',
  'aksidente',
  'accident',
  'help',
]);

/**
 * Never-guess guard. The LLM may not trigger SOS or a call on its own say-so:
 * - sos_alert needs an explicit SOS word in the transcript.
 * - call_contact needs a target that (fuzzily) appears in the transcript.
 * Anything else is downgraded to `unknown`. Non-LLM commands pass through.
 */
export function guardLlmCommand(command: ParsedCommand, transcript: string): ParsedCommand {
  if (command.source !== 'llm') return command;

  const unknown: ParsedCommand = { intent: 'unknown', target: null, source: 'llm' };
  const tokens = cleanText(transcript).split(' ').filter(Boolean);

  if (command.intent === 'sos_alert') {
    return tokens.some((t) => SOS_WORDS.has(t)) ? command : unknown;
  }

  if (command.intent === 'call_contact') {
    if (!command.target) return unknown;
    const targetTokens = cleanText(command.target).split(' ').filter(Boolean);
    if (targetTokens.length === 0) return unknown;
    const allHeard = targetTokens.every((tt) => tokens.some((t) => isFuzzyMatch(t, tt)));
    return allHeard ? command : unknown;
  }

  return command;
}
