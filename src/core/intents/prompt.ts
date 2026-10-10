/**
 * System prompt + few-shot examples for the Qwen intent parser.
 * Input is Tagalog/Taglish/English speech transcribed by Whisper (the wake
 * word is already stripped). Output is a JSON object. Examples are built
 * with JSON.stringify so they are always valid JSON.
 */

import type { Intent } from './types';

export const SYSTEM_PROMPT = [
  'You turn short voice commands from a motorcycle rider into JSON.',
  'The command may be Tagalog, Taglish or English, and may contain transcription errors.',
  'Reply with one JSON object only: {"intent":...,"target":...}.',
  'Intents: tell_time, tell_date, battery_level, media_play, media_pause, media_next,',
  'volume_up, volume_down, repeat_last, call_contact, sos_alert,',
  'where_am_i, greet, thank, identity, help, unknown.',
  'target is the contact name for call_contact, otherwise null.',
  'Never guess. If the command is unclear or not one of the intents, use unknown.',
  'Use sos_alert only if the rider clearly asks for help or reports an accident.',
  'Use call_contact only if a contact name was clearly spoken.',
].join('\n');

export type FewShot = {
  input: string;
  intent: Intent;
  target: string | null;
};

export const FEW_SHOTS: readonly FewShot[] = [
  { input: 'anong oras na', intent: 'tell_time', target: null },
  { input: 'ilang oras na po ba', intent: 'tell_time', target: null },
  { input: 'what time is it', intent: 'tell_time', target: null },
  { input: 'anong petsa ngayon', intent: 'tell_date', target: null },
  { input: 'anong araw na ngayon', intent: 'tell_date', target: null },
  { input: "what's today's date", intent: 'tell_date', target: null },
  { input: 'ilang porsyento na baterya', intent: 'battery_level', target: null },
  { input: 'gaano pa karami battery ko', intent: 'battery_level', target: null },
  { input: 'patugtog ng musika', intent: 'media_play', target: null },
  { input: 'paki play yung kanta', intent: 'media_play', target: null },
  { input: 'tigil muna yung music', intent: 'media_pause', target: null },
  { input: 'pause mo muna', intent: 'media_pause', target: null },
  { input: 'sunod na kanta', intent: 'media_next', target: null },
  { input: 'next song please', intent: 'media_next', target: null },
  { input: 'lakasan mo yung volume', intent: 'volume_up', target: null },
  { input: 'masyadong mahina, taasan mo', intent: 'volume_up', target: null },
  { input: 'hinaan mo naman', intent: 'volume_down', target: null },
  { input: 'ang lakas, bawasan mo', intent: 'volume_down', target: null },
  { input: 'ano yun ulitin mo', intent: 'repeat_last', target: null },
  { input: 'say that again', intent: 'repeat_last', target: null },
  { input: 'tawagan mo si kuya ben', intent: 'call_contact', target: 'Kuya Ben' },
  { input: 'paki tawag si ate rose', intent: 'call_contact', target: 'Ate Rose' },
  { input: 'call mama', intent: 'call_contact', target: 'Mama' },
  { input: 'tulong naaksidente ako', intent: 'sos_alert', target: null },
  { input: 'sos emergency', intent: 'sos_alert', target: null },
  { input: 'saklolo tulungan niyo ako', intent: 'sos_alert', target: null },
  { input: 'nasaan ako', intent: 'where_am_i', target: null },
  { input: 'where am i', intent: 'where_am_i', target: null },
  { input: 'kumusta ka', intent: 'greet', target: null },
  { input: 'good morning', intent: 'greet', target: null },
  { input: 'salamat ha', intent: 'thank', target: null },
  { input: 'sino ka ba', intent: 'identity', target: null },
  { input: 'ano ang kaya mong gawin', intent: 'help', target: null },
  { input: 'what can i ask you', intent: 'help', target: null },
  { input: 'kumain ka na ba', intent: 'unknown', target: null },
  { input: 'ang init ngayon grabe', intent: 'unknown', target: null },
  { input: 'tawagan mo siya', intent: 'unknown', target: null },
];

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function userTurn(text: string): string {
  return `${text} /no_think`;
}

function answer(shot: Pick<FewShot, 'intent' | 'target'>): string {
  return JSON.stringify({ intent: shot.intent, target: shot.target });
}

/** Chat messages for llama.rn: system, few-shot turns, then the real command. */
export function buildMessages(transcript: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const shot of FEW_SHOTS) {
    messages.push({ role: 'user', content: userTurn(shot.input) });
    messages.push({ role: 'assistant', content: answer(shot) });
  }
  messages.push({ role: 'user', content: userTurn(transcript.trim()) });
  return messages;
}

/**
 * Freeform fallback prompt: used only when no rule and no intent JSON matched.
 * Much smaller than the parser prompt (no grammar), so it stays within n_ctx.
 */
const CHAT_PROMPT = [
  'You are Tropa, a friendly voice assistant on a motorcycle helmet.',
  'The rider may speak Tagalog, Taglish or English; there may be transcription errors.',
  'Reply in the same language they used, in one to three short spoken sentences.',
  'You may answer general questions, explain words, or name short lists; keep it brief.',
  'If they ask what you can do, mention: time, date, battery, music, volume, calls, SOS.',
  'Be warm and brief. Never mention that you are an AI model.',
].join('\n');

/**
 * Chat messages for the freeform reply path (no grammar, no few-shots).
 * `lastExchange` gives one turn of context so follow-ups ("at saka?",
 * "eh bakit?") make sense.
 */
export function buildChatMessages(
  transcript: string,
  lastExchange?: { command: string; reply: string } | null,
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: CHAT_PROMPT }];
  if (lastExchange) {
    messages.push({ role: 'user', content: userTurn(lastExchange.command) });
    messages.push({ role: 'assistant', content: lastExchange.reply });
  }
  messages.push({ role: 'user', content: userTurn(transcript.trim()) });
  return messages;
}
