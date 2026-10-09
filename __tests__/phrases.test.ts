/**
 * The 40-phrase script from docs/TEST_SCRIPT.md, automated for the parts that
 * need no device: wake-word verification and keyword rules. Transcripts are
 * written the way Whisper tends to spell them (punctuation, capitals).
 * Keep this table and the doc in sync.
 */
import { matchRules } from '@/core/intents/rules';
import type { Intent } from '@/core/intents/types';
import { verifyWakeWord } from '@/core/wake/verify';

type Expect =
  /** Wake word found and a keyword rule handles it (no Qwen). */
  | { intent: Exclude<Intent, 'unknown'>; target?: string }
  /** Wake word found, no rule: goes to Qwen (or "Sorry, I didn't understand" in fast mode). */
  | { llm: true }
  /** Only the wake word: reply "Yes?" and listen again. */
  | { empty: true; wakeWord?: string }
  /** No wake word in the first 1-2 words: discarded silently. */
  | { discard: true };

const PHRASES: [string, Expect][] = [
  // Time / date / battery
  ['Yah anong oras na ba', { intent: 'tell_time' }],
  ['Kuya, what time is it?', { intent: 'tell_time' }],
  ['Tol anong oras na', { intent: 'tell_time' }],
  ['Hoy yah, anong petsa ngayon?', { intent: 'tell_date' }],
  ['Tropa anong araw ngayon', { intent: 'tell_date' }],
  ['Bai ilang porsyento na baterya ko?', { intent: 'battery_level' }],
  ['Yah, battery', { intent: 'battery_level' }],
  // Media / volume
  ['Kuya patugtog naman', { intent: 'media_play' }],
  ['Yah play music', { intent: 'media_play' }],
  ['Tol tigil muna', { intent: 'media_pause' }],
  ['Yah pause', { intent: 'media_pause' }],
  ['Kuya sunod na kanta', { intent: 'media_next' }],
  ['Yah next', { intent: 'media_next' }],
  ['Tol hinaan mo', { intent: 'volume_down' }],
  ['Yah volume down', { intent: 'volume_down' }],
  ['Kuya lakasan mo', { intent: 'volume_up' }],
  ['Yah louder', { intent: 'volume_up' }],
  // Repeat
  ['Yah ulitin mo', { intent: 'repeat_last' }],
  ['Kuya, say that again.', { intent: 'repeat_last' }],
  // Call (confirmation happens later, in the call flow)
  ['Yah tawagan si Kuya Ben', { intent: 'call_contact', target: 'kuya ben' }],
  ['Tol, call Mama.', { intent: 'call_contact', target: 'mama' }],
  ['Yah tumawag kay Ate Rose', { intent: 'call_contact', target: 'ate rose' }],
  // SOS (5 s cancel countdown follows)
  ['Kuya tulong!', { intent: 'sos_alert' }],
  ['Yah naaksidente ako', { intent: 'sos_alert' }],
  ['Tropa, SOS!', { intent: 'sos_alert' }],
  // Wake word only
  ['Yah.', { empty: true, wakeWord: 'yah' }],
  ['Hoy yah', { empty: true, wakeWord: 'hoy yah' }],
  // Whisper spelling variants of the wake word
  ['Ya, anong oras na?', { intent: 'tell_time' }],
  ['Kuys anong oras na', { intent: 'tell_time' }],
  // Wake word but no rule: Qwen decides (never call/SOS without explicit words)
  ['Yah, paano pumunta sa Tagaytay?', { llm: true }],
  ['Kuya ang init ngayon no', { llm: true }],
  ['Yah call me back', { llm: true }],
  // No wake word, including "kuya" inside normal conversation
  ['Anong oras na ba', { discard: true }],
  ['Sabi ni Kuya Ben pupunta siya', { discard: true }],
  ['Tara na kuya', { discard: true }],
  ['Ano ba yan', { discard: true }],
  // Noise / Whisper artefacts
  ['', { discard: true }],
  ['[BLANK_AUDIO]', { discard: true }],
  ['...', { discard: true }],
  ['Thank you.', { discard: true }],
];

describe('40-phrase test script (verify + rules)', () => {
  it('has 40 phrases', () => {
    expect(PHRASES).toHaveLength(40);
  });

  it.each(PHRASES)('%j', (transcript, expected) => {
    const verdict = verifyWakeWord(transcript);

    if ('discard' in expected) {
      expect(verdict.matched).toBe(false);
      return;
    }

    expect(verdict.matched).toBe(true);
    if (!verdict.matched) return;

    if ('empty' in expected) {
      expect(verdict.isEmptyCommand).toBe(true);
      if (expected.wakeWord) expect(verdict.wakeWord).toBe(expected.wakeWord);
      return;
    }

    expect(verdict.isEmptyCommand).toBe(false);
    const parsed = matchRules(verdict.command);

    if ('llm' in expected) {
      expect(parsed).toBeNull();
      return;
    }

    expect(parsed).toMatchObject({ intent: expected.intent, source: 'rule' });
    if (expected.target !== undefined) expect(parsed?.target).toBe(expected.target);
  });
});
