import { parseCommand } from '@/core/intents/dispatcher';
import { INTENT_GRAMMAR } from '@/core/intents/grammar';
import { INTENTS, parseLlmOutput } from '@/core/intents/llmOutput';
import { FEW_SHOTS, buildMessages } from '@/core/intents/prompt';

describe('prompt few-shots', () => {
  it('has at least 25 examples covering all 12 intents', () => {
    expect(FEW_SHOTS.length).toBeGreaterThanOrEqual(25);
    const covered = new Set(FEW_SHOTS.map((s) => s.intent));
    for (const intent of INTENTS) expect(covered.has(intent)).toBe(true);
  });

  it('every example answer is valid', () => {
    for (const shot of FEW_SHOTS) {
      const json = JSON.stringify({ intent: shot.intent, target: shot.target });
      const parsed = parseLlmOutput(json);
      expect(parsed.intent).toBe(shot.intent);
      expect(parsed.target).toBe(shot.target);
    }
  });

  it('buildMessages ends with the real command and /no_think', () => {
    const msgs = buildMessages('  anong oras na  ');
    expect(msgs[0].role).toBe('system');
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'anong oras na /no_think' });
    expect(msgs.length).toBe(2 + FEW_SHOTS.length * 2);
  });
});

describe('INTENT_GRAMMAR', () => {
  it('mentions every intent and both fields', () => {
    for (const intent of INTENTS) expect(INTENT_GRAMMAR).toContain(`\\"${intent}\\"`);
    for (const field of ['intent', 'target']) expect(INTENT_GRAMMAR).toContain(`\\"${field}\\"`);
    expect(INTENT_GRAMMAR.startsWith('root ::=')).toBe(true);
  });
});

describe('parseCommand (rules first, LLM fallback)', () => {
  it('does not call the LLM when a rule matches', async () => {
    const llm = jest.fn();
    const r = await parseCommand('anong oras na ba', llm);
    expect(r).toEqual({ intent: 'tell_time', target: null, source: 'rule' });
    expect(llm).not.toHaveBeenCalled();
  });

  it('uses the LLM when no rule matches', async () => {
    const llm = jest.fn().mockResolvedValue('{"intent":"call_contact","target":"Kuya Ben"}');
    // "pakitawagan" does not start with a call verb, so no rule matches and the LLM runs.
    const r = await parseCommand('pakitawagan mo si kuya ben', llm);
    expect(r).toEqual({ intent: 'call_contact', target: 'Kuya Ben', source: 'llm' });
  });

  it('resolves a plain call request by rule without calling the LLM', async () => {
    const llm = jest.fn();
    const r = await parseCommand('tawagan mo si kuya ben', llm);
    expect(r).toEqual({ intent: 'call_contact', target: 'kuya ben', source: 'rule' });
    expect(llm).not.toHaveBeenCalled();
  });

  it('downgrades an unsafe LLM sos_alert', async () => {
    const llm = jest.fn().mockResolvedValue('{"intent":"sos_alert","target":null}');
    const r = await parseCommand('kumain ka na ba', llm);
    expect(r.intent).toBe('unknown');
  });

  it('returns unknown when the LLM throws or emits garbage', async () => {
    const boom = jest.fn().mockRejectedValue(new Error('oom'));
    expect((await parseCommand('kumain ka na ba', boom)).intent).toBe('unknown');
    const junk = jest.fn().mockResolvedValue('blah');
    expect((await parseCommand('kumain ka na ba', junk)).intent).toBe('unknown');
  });

  it('returns unknown without an LLM or with an empty transcript', async () => {
    expect(await parseCommand('kumain ka na ba')).toEqual({
      intent: 'unknown',
      target: null,
      source: 'none',
    });
    const llm = jest.fn();
    expect((await parseCommand('   ', llm)).source).toBe('none');
    expect(llm).not.toHaveBeenCalled();
  });
});
