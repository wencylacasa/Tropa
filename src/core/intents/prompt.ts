/**
 * System prompt + few-shot examples for the Qwen intent parser.
 * Input is Tagalog/Taglish/English speech transcribed by Whisper (the wake
 * word is already stripped). Output is a JSON object with an English reply
 * of at most 10 words. Examples are built with JSON.stringify so they are
 * always valid JSON.
 */

import type { Intent } from './types';

export const SYSTEM_PROMPT = [
  'You turn short voice commands from a motorcycle rider into JSON.',
  'The command may be Tagalog, Taglish or English, and may contain transcription errors.',
  'Reply with one JSON object only: {"intent":...,"target":...,"reply":...}.',
  'Intents: tell_time, tell_date, battery_level, media_play, media_pause, media_next,',
  'volume_up, volume_down, repeat_last, call_contact, sos_alert, unknown.',
  'target is the contact name for call_contact, otherwise null.',
  'reply is a short English sentence, 10 words maximum.',
  'Never guess. If the command is unclear or not one of the intents, use unknown.',
  'Use sos_alert only if the rider clearly asks for help or reports an accident.',
  'Use call_contact only if a contact name was clearly spoken.',
].join('\n');

export type FewShot = {
  input: string;
  intent: Intent;
  target: string | null;
  reply: string;
};

export const FEW_SHOTS: readonly FewShot[] = [
  { input: 'anong oras na', intent: 'tell_time', target: null, reply: 'Checking the time' },
  { input: 'ilang oras na po ba', intent: 'tell_time', target: null, reply: 'Checking the time' },
  { input: 'what time is it', intent: 'tell_time', target: null, reply: 'Checking the time' },
  { input: 'anong petsa ngayon', intent: 'tell_date', target: null, reply: 'Checking the date' },
  { input: 'anong araw na ngayon', intent: 'tell_date', target: null, reply: 'Checking the date' },
  { input: "what's today's date", intent: 'tell_date', target: null, reply: 'Checking the date' },
  { input: 'ilang porsyento na baterya', intent: 'battery_level', target: null, reply: 'Checking the battery' },
  { input: 'gaano pa karami battery ko', intent: 'battery_level', target: null, reply: 'Checking the battery' },
  { input: 'patugtog ng musika', intent: 'media_play', target: null, reply: 'Playing music' },
  { input: 'paki play yung kanta', intent: 'media_play', target: null, reply: 'Playing music' },
  { input: 'tigil muna yung music', intent: 'media_pause', target: null, reply: 'Pausing music' },
  { input: 'pause mo muna', intent: 'media_pause', target: null, reply: 'Pausing music' },
  { input: 'sunod na kanta', intent: 'media_next', target: null, reply: 'Next song' },
  { input: 'next song please', intent: 'media_next', target: null, reply: 'Next song' },
  { input: 'lakasan mo yung volume', intent: 'volume_up', target: null, reply: 'Volume up' },
  { input: 'masyadong mahina, taasan mo', intent: 'volume_up', target: null, reply: 'Volume up' },
  { input: 'hinaan mo naman', intent: 'volume_down', target: null, reply: 'Volume down' },
  { input: 'ang lakas, bawasan mo', intent: 'volume_down', target: null, reply: 'Volume down' },
  { input: 'ano yun ulitin mo', intent: 'repeat_last', target: null, reply: 'Repeating' },
  { input: 'say that again', intent: 'repeat_last', target: null, reply: 'Repeating' },
  { input: 'tawagan mo si kuya ben', intent: 'call_contact', target: 'Kuya Ben', reply: 'Calling Kuya Ben' },
  { input: 'paki tawag si ate rose', intent: 'call_contact', target: 'Ate Rose', reply: 'Calling Ate Rose' },
  { input: 'call mama', intent: 'call_contact', target: 'Mama', reply: 'Calling Mama' },
  { input: 'tulong naaksidente ako', intent: 'sos_alert', target: null, reply: 'Sending SOS' },
  { input: 'sos emergency', intent: 'sos_alert', target: null, reply: 'Sending SOS' },
  { input: 'saklolo tulungan niyo ako', intent: 'sos_alert', target: null, reply: 'Sending SOS' },
  { input: 'kumain ka na ba', intent: 'unknown', target: null, reply: "Sorry, I didn't understand" },
  { input: 'ang init ngayon grabe', intent: 'unknown', target: null, reply: "Sorry, I didn't understand" },
  { input: 'tawagan mo siya', intent: 'unknown', target: null, reply: "Sorry, I didn't understand" },
];

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function userTurn(text: string): string {
  return `${text} /no_think`;
}

function answer(shot: Pick<FewShot, 'intent' | 'target' | 'reply'>): string {
  return JSON.stringify({ intent: shot.intent, target: shot.target, reply: shot.reply });
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
