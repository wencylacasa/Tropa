import { guardLlmCommand, parseLlmOutput } from '@/core/intents/llmOutput';
import type { ParsedCommand } from '@/core/intents/types';

describe('parseLlmOutput', () => {
  it('parses a clean result', () => {
    const r = parseLlmOutput('{"intent":"tell_time","target":null,"reply":"Checking the time"}');
    expect(r.command).toEqual({ intent: 'tell_time', target: null, source: 'llm' });
    expect(r.reply).toBe('Checking the time');
  });

  it('extracts JSON wrapped in text or code fences', () => {
    const r = parseLlmOutput('```json\n{"intent":"battery_level","target":null,"reply":"ok"}\n```');
    expect(r.command.intent).toBe('battery_level');
  });

  it('keeps target only for call_contact', () => {
    expect(
      parseLlmOutput('{"intent":"call_contact","target":" Kuya Ben ","reply":"Calling"}').command,
    ).toEqual({ intent: 'call_contact', target: 'Kuya Ben', source: 'llm' });
    expect(
      parseLlmOutput('{"intent":"tell_time","target":"Ben","reply":"ok"}').command.target,
    ).toBeNull();
  });

  it('drops replies longer than 10 words', () => {
    const long = 'one two three four five six seven eight nine ten eleven';
    const r = parseLlmOutput(`{"intent":"tell_date","target":null,"reply":"${long}"}`);
    expect(r.command.intent).toBe('tell_date');
    expect(r.reply).toBeNull();
  });

  it.each([
    '',
    'not json',
    '{"intent":',
    '[]',
    '{"intent":"fly_to_moon","target":null,"reply":"ok"}',
    '{"intent":42}',
    '{"intent":"call_contact","target":5,"reply":"ok"}',
  ])('falls back to unknown for %j', (raw) => {
    expect(parseLlmOutput(raw).command).toEqual({ intent: 'unknown', target: null, source: 'llm' });
  });
});

describe('guardLlmCommand', () => {
  const llm = (intent: ParsedCommand['intent'], target: string | null = null): ParsedCommand => ({
    intent,
    target,
    source: 'llm',
  });

  it('passes rule commands through untouched', () => {
    const cmd: ParsedCommand = { intent: 'sos_alert', target: null, source: 'rule' };
    expect(guardLlmCommand(cmd, 'anything')).toBe(cmd);
  });

  it('allows LLM sos_alert only with an explicit SOS word', () => {
    expect(guardLlmCommand(llm('sos_alert'), 'tulong naaksidente ako').intent).toBe('sos_alert');
    expect(guardLlmCommand(llm('sos_alert'), 'ang init ngayon').intent).toBe('unknown');
  });

  it('allows LLM call_contact only when the target was heard', () => {
    expect(guardLlmCommand(llm('call_contact', 'Kuya Ben'), 'tawagan mo si kuya ben').intent).toBe(
      'call_contact',
    );
    expect(guardLlmCommand(llm('call_contact', 'Ate Rose'), 'tawagan mo si kuya ben').intent).toBe(
      'unknown',
    );
    expect(guardLlmCommand(llm('call_contact', null), 'tawagan mo si kuya ben').intent).toBe(
      'unknown',
    );
  });

  it('leaves harmless LLM intents alone', () => {
    expect(guardLlmCommand(llm('tell_time'), 'ano oras').intent).toBe('tell_time');
  });
});
