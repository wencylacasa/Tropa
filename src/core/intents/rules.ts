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
      /\boras\b/, // "anong oras na ba", "ano oras na", "ilang oras na"
      /\bwhat time\b/,
      /\btime is it\b/,
      /\b(ano|anong|ilang) time\b/, // Taglish
      /\btime na\b/, // "time na ba"
      /\bcurrent time\b/,
      /^(the )?time$/,
    ],
  },
  {
    intent: 'tell_date',
    patterns: [
      /\bpetsa\b/, // "anong petsa ngayon"
      /\b(anong |ano |ang )?araw (na |ng |ba )?ngayon\b/, // "anong araw ngayon", "araw ngayon"
      /\bngayong araw\b/,
      /\bwhat date\b/,
      /\bwhat day\b/,
      /\bwhat s the date\b/, // "what's the date" after cleanText
      /\btoday s date\b/,
    ],
  },
  {
    intent: 'battery_level',
    patterns: [/\bbaterya\b/, /\bbattery\b/, /\bporsyento\b/, /\bpercent\b/, /\bcharge\b/],
  },
  {
    intent: 'media_next',
    patterns: [
      /\bsunod\b/, // "sunod na kanta"
      /\bsusunod\b/,
      /\bnext\b/,
      /\bskip\b/,
      /\b(ibago|palitan|bago) (ang |yung )?(kanta|song|musika|music)\b/,
    ],
  },
  {
    intent: 'media_pause',
    patterns: [
      /\b(i)?tigil\b/, // "tigil muna", "itigil mo"
      /\b(i)?hinto\b/, // "hinto", "ihinto mo"
      /\bpause\b/,
      /\bistop\b/, // Taglish "i-stop"
      /\bstop (the )?(music|song|player|kanta|musika)\b/,
    ],
  },
  {
    intent: 'media_play',
    patterns: [
      /\b(mag)?patugtog\b/, // "patugtog", "magpatugtog"
      /\bplay\b/,
      /\bresume\b/,
      /\b(i)?tuloy\b/, // "ituloy mo", "tuloy ang kanta"
      /\b(kanta|musika|music)\b$/, // bare "kanta" / "musika" -> play something
    ],
  },
  {
    intent: 'volume_down',
    patterns: [
      /\b(pa)?hina(an|in)\b/, // "hinaan", "hinain", "pahinaan mo"
      /\bhina(an)? (ang )?(volume|tunog)\b/,
      /\bibaba\b/, // "ibaba mo" (ang volume)
      /\bbawasan\b/, // "bawasan mo"
      /\bvolume down\b/,
      /\b(lower|reduce) (the )?(volume|tunog)\b/,
      /\bquieter\b/,
    ],
  },
  {
    intent: 'volume_up',
    patterns: [
      /\b(pa)?lakas(an|in)\b/, // "lakasan", "lakasin", "palakasin mo"
      // NOTE: bare "lakas"/"hina" are nouns ("lakas ng cellphone") — never match them.
      /\bitaas\b/, // "itaas mo" (ang volume)
      /\btaasan\b/,
      /\bdagdagan\b/, // "dagdagan mo"
      /\bvolume up\b/,
      /\b(raise|increase) (the )?volume\b/,
      /\blouder\b/,
    ],
  },
  {
    intent: 'sos_alert',
    patterns: [
      /\btulong\b/,
      /\bsaklolo\b/,
      /\bnaaksidente (ako|kami)\b/,
      /\baksidente\b/,
      /\bsos\b/,
      /\bemergency\b/,
    ],
  },
  {
    intent: 'repeat_last',
    patterns: [
      /\b(paki)?ulit(in)?\b/, // "ulitin", "pakiulit", "ulit"
      /\brepeat\b/,
      /\bsay that again\b/,
      /\bwhat did you say\b/,
    ],
  },
  {
    intent: 'where_am_i',
    patterns: [
      /\bnasaan (na )?(ba )?(ako|tayo|kami)\b/, // "nasaan ako", "nasaan na tayo"
      /\bkung nasaan (ako|tayo|kami)\b/,
      /\b(saan|asan) (na )?(ba )?(ako|tayo|kami)\b/, // "saan ako", "asan na tayo"
      /\bwhere am i\b/,
      /\bwhere are we\b/,
      /\bano(ng)? (lugar|street|kalye|barangay|syudad|lungsod) (ito|ba ito|natin)\b/,
      /\bwhat (street|road|place|city|barangay|location)\b/,
      /\bcurrent location\b/,
      /\blocation (ko|natin)\b/,
    ],
  },
  {
    intent: 'greet',
    patterns: [
      /\bk[au]m?usta\b/, // "kamusta", "kumusta", "musta"
      /\bmagandang (umaga|hapon|gabi|tanghali|araw)\b/,
      /\bgood (morning|afternoon|evening|day)\b/,
      /\bhello\b/,
      /\bhi\b/,
    ],
  },
  {
    intent: 'thank',
    patterns: [/\b(maraming )?salamat\b/, /\bthank(s| you)\b/],
  },
  {
    intent: 'identity',
    patterns: [
      /\bsino (ka|ikaw)\b/, // "sino ka", "sino ka ba"
      /\bwho are you\b/,
      /\b(ano|anong|what) (ang |is |ba ang )?(iyong |your )?pangalan\b/,
      /\bwhat (are you|is your name)\b/,
      /\byour name\b/,
    ],
  },
  {
    intent: 'help',
    patterns: [
      // "ano ang kaya mong gawin", "ano pwede kong itanong", "what can I ask"
      /\b(ano|anong|what)\b.{0,12}\b(kaya|pwede|puwede|magagawa|can)\b.{0,12}\b(gawin|itanong|itatanong|iutos|utos|sabihin|ask|do|say)\b/,
      /\b(ano|anong|what)\b.{0,12}\b(magagawa|magawa)\b/, // "ano ang magagawa mo"
      /\bpaano (kita|ka|itong|ito|ang tropa) gagamitin\b|\bpaano (kita|ka) gamitin\b/,
      /\bmga (utos|commands?)\b/, // "ano ang mga utos", "list of commands"
      /\bwhat can (you|i) (do|ask|say)\b/,
      /\b(list|show) (me )?(the )?commands\b/,
    ],
  },
];

/**
 * "tawagan si kuya ben", "tumawag kay ate rose", "call ben". The verb must come
 * first; whatever follows (minus fillers) is the spoken name. Resolving it to a
 * real contact and confirming is `system/callFlow.ts`'s job, not ours.
 */
const CALL_RULE = /^(?:tawagan|tawagin|tumawag|itawag|pakitawag|tawag|call|dial|phone)\s+(?:(?:mo|ka|nga|po|na|naman)\s+)*(?:(?:si|kay|ang|sa|to)\s+)?(.+)$/;

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
