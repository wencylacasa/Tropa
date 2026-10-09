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
    intent: 'media_next',
    patterns: [/\bsunod\b/, /\bnext\b/, /\bskip\b/, /\bsunod na kanta\b/],
  },
  {
    intent: 'media_pause',
    patterns: [
      /\btigil\b/, // "tigil muna"
      /\bhinto\b/,
      /\bpause\b/,
      /\bstop (the )?(music|song|player)\b/,
    ],
  },
  {
    intent: 'media_play',
    patterns: [/\bpatugtog\b/, /\bplay\b/, /\bresume\b/, /\btuloy (ang )?(musika|kanta|music)\b/],
  },
  {
    intent: 'volume_down',
    patterns: [
      /\bhinaan\b/, // "hinaan mo"
      /\bhina(an)? (ang )?(volume|tunog)\b/,
      /\bvolume down\b/,
      /\b(lower|reduce) (the )?volume\b/,
      /\bquieter\b/,
    ],
  },
  {
    intent: 'volume_up',
    patterns: [
      /\blakasan\b/, // "lakasan mo"
      /\bvolume up\b/,
      /\b(raise|increase) (the )?volume\b/,
      /\blouder\b/,
    ],
  },
  {
    intent: 'sos_alert',
    patterns: [/\btulong\b/, /\bnaaksidente (ako|kami)\b/, /\bsos\b/, /\bemergency\b/],
  },
  {
    intent: 'repeat_last',
    patterns: [/\bulitin\b/, /\bulit\b/, /\brepeat\b/, /\bsay that again\b/],
  },
];

/**
 * "tawagan si kuya ben", "tumawag kay ate rose", "call ben". The verb must come
 * first; whatever follows (minus fillers) is the spoken name. Resolving it to a
 * real contact and confirming is `system/callFlow.ts`'s job, not ours.
 */
const CALL_RULE = /^(?:tawagan|tumawag|tawag|call|dial)\s+(?:(?:mo|ka|nga|po|na)\s+)*(?:(?:si|kay|ang|sa|to)\s+)?(.+)$/;

function matchCall(text: string): ParsedCommand | null {
  const found = CALL_RULE.exec(text);
  const target = found?.[1]?.trim() ?? '';
  // "call me back" is not a request to dial someone called "me".
  if (!target || /^(me|us)\b/.test(target)) return null;
  return { intent: 'call_contact', target, source: 'rule' };
}

export function matchRules(command: string): ParsedCommand | null {
  const text = cleanText(command);
  if (text.length === 0) return null;

  const call = matchCall(text);
  if (call) return call;

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { intent: rule.intent, target: null, source: 'rule' };
    }
  }
  return null;
}
