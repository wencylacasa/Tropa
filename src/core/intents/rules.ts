/**
 * Keyword rules (no LLM). Return null when nothing matches so the caller can
 * fall back to the Qwen parser. Safety: call_contact and sos_alert are NOT
 * handled loosely here; they get dedicated rules in M4.
 */

import { cleanText } from '../wake/fuzzyMatch';
import type { Intent, ParsedCommand } from './types';

type Rule = {
  intent: Intent;
  patterns: RegExp[];
};

// Order matters: first match wins.
const RULES: Rule[] = [
  {
    intent: 'tell_time',
    patterns: [
      /\boras\b/, // "anong oras na ba", "ano oras na"
      /\bwhat time\b/,
      /\btime is it\b/,
      /\b(ano|anong) time\b/, // Taglish
      /\bcurrent time\b/,
      /^(the )?time$/,
    ],
  },
  {
    intent: 'tell_date',
    patterns: [
      /\bpetsa\b/, // "anong petsa ngayon"
      /\banong araw\b/, // "anong araw ngayon"
      /\bwhat date\b/,
      /\bwhat day\b/,
      /\bwhat s the date\b/, // "what's the date" after cleanText
      /\btoday s date\b/,
    ],
  },
  {
    intent: 'battery_level',
    patterns: [/\bbaterya\b/, /\bbattery\b/, /\bporsyento\b/],
  },
  {
    intent: 'repeat_last',
    patterns: [/\bulitin\b/, /\bulit\b/, /\brepeat\b/, /\bsay that again\b/],
  },
];

export function matchRules(command: string): ParsedCommand | null {
  const text = cleanText(command);
  if (text.length === 0) return null;

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { intent: rule.intent, target: null, source: 'rule' };
    }
  }
  return null;
}
