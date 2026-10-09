import { Orchestrator, DEFAULT_CONFIG } from '@/core/pipeline/orchestrator';
import type { Clip, PipelinePorts, Transcript } from '@/core/pipeline/states';
import type { ParsedCommand } from '@/core/intents/types';

const GOOD_CLIP: Clip = { data: null, durationMs: 1800, speechProbability: 0.9 };
const SHORT_CLIP: Clip = { data: null, durationMs: 200, speechProbability: 0.9 };
const QUIET_CLIP: Clip = { data: null, durationMs: 1800, speechProbability: 0.1 };

function t(text: string, confidence = 0.9): Transcript {
  return { text, confidence };
}

function makePorts(opts: {
  clips?: Clip[];
  transcripts?: Transcript[];
  llm?: (command: string) => Promise<ParsedCommand>;
  battery?: number | null;
  now?: Date;
}) {
  const clips = [...(opts.clips ?? [GOOD_CLIP])];
  const transcripts = [...(opts.transcripts ?? [])];
  const spoken: string[] = [];
  const events: string[] = [];

  const ports: PipelinePorts = {
    detector: {
      start: jest.fn(async () => {}),
      stop: jest.fn(async () => {}),
      pause: jest.fn(async () => {
        events.push('pause');
      }),
      resume: jest.fn(async () => {
        events.push('resume');
      }),
    },
    recorder: { record: jest.fn(async () => clips.shift() ?? GOOD_CLIP) },
    stt: {
      transcribe: jest.fn(async () => {
        const next = transcripts.shift();
        if (!next) throw new Error('no transcript scripted');
        return next;
      }),
    },
    tts: {
      speak: jest.fn(async (text: string) => {
        spoken.push(text);
      }),
    },
    feedback: { beep: jest.fn(async () => {}) },
    llm: opts.llm ? { parse: jest.fn(opts.llm) } : undefined,
    now: () => opts.now ?? new Date(2026, 9, 9, 16, 45),
    getBatteryLevel: async () => (opts.battery === undefined ? 80 : opts.battery),
  };
  return { ports, spoken, events };
}

describe('Orchestrator', () => {
  it('handles "Yah anong oras na ba" end to end', async () => {
    const { ports, spoken, events } = makePorts({ transcripts: [t('Yah anong oras na ba')] });
    const o = new Orchestrator(ports);

    const outcome = await o.handleTrigger();

    expect(outcome).toMatchObject({ result: 'handled', intent: 'tell_time' });
    expect(spoken).toEqual(["It's 4:45 in the afternoon"]);
    expect(events).toEqual(['pause', 'resume']);
    expect(ports.feedback.beep).toHaveBeenCalledTimes(1);
    expect(o.getState()).toBe('idle');
  });

  it('discards silently when there is no wake word', async () => {
    const { ports, spoken } = makePorts({ transcripts: [t('anong oras na')] });
    const outcome = await new Orchestrator(ports).handleTrigger();
    expect(outcome).toMatchObject({ result: 'discarded_no_wake' });
    expect(spoken).toEqual([]);
  });

  it('ignores clips that are too short or have no speech, without running STT', async () => {
    for (const clip of [SHORT_CLIP, QUIET_CLIP]) {
      const { ports, spoken } = makePorts({ clips: [clip] });
      const outcome = await new Orchestrator(ports).handleTrigger();
      expect(outcome).toEqual({ result: 'discarded_short' });
      expect(ports.stt.transcribe).not.toHaveBeenCalled();
      expect(spoken).toEqual([]);
    }
  });

  it('says "Yes?" for a bare wake word and listens again', async () => {
    const { ports, spoken } = makePorts({
      clips: [GOOD_CLIP, GOOD_CLIP],
      transcripts: [t('Tropa'), t('anong petsa ngayon')],
    });
    const outcome = await new Orchestrator(ports).handleTrigger();
    expect(outcome).toMatchObject({ result: 'handled', intent: 'tell_date' });
    expect(spoken).toEqual(['Yes?', 'Today is Friday, October 9']);
  });

  it('gives up quietly if nothing follows the bare wake word', async () => {
    const { ports, spoken } = makePorts({
      clips: [GOOD_CLIP, SHORT_CLIP],
      transcripts: [t('Tropa')],
    });
    const outcome = await new Orchestrator(ports).handleTrigger();
    expect(outcome).toEqual({ result: 'no_command' });
    expect(spoken).toEqual(['Yes?']);
  });

  it('asks to repeat on low confidence after a wake word matched', async () => {
    const { ports, spoken } = makePorts({ transcripts: [t('Yah anong oras', 0.2)] });
    const outcome = await new Orchestrator(ports).handleTrigger();
    expect(outcome).toMatchObject({ result: 'low_confidence' });
    expect(spoken).toEqual(['Please say that again']);
  });

  it('says sorry for unknown commands and does not call handlers', async () => {
    const { ports, spoken } = makePorts({ transcripts: [t('Yah kumain ka na ba')] });
    const outcome = await new Orchestrator(ports).handleTrigger();
    expect(outcome).toMatchObject({ result: 'not_understood', command: 'kumain ka na ba' });
    expect(spoken).toEqual(["Sorry, I didn't understand"]);
  });

  it('uses rules first and only calls the LLM when no rule matches', async () => {
    const llm = jest.fn(async () => ({ intent: 'battery_level', target: null, source: 'llm' }) as ParsedCommand);
    const a = makePorts({ transcripts: [t('Yah anong oras')], llm });
    await new Orchestrator(a.ports).handleTrigger();
    expect(llm).not.toHaveBeenCalled();

    const b = makePorts({ transcripts: [t('Yah ilan na lakas ng cellphone ko')], llm });
    const outcome = await new Orchestrator(b.ports).handleTrigger();
    expect(llm).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ result: 'handled', intent: 'battery_level' });
    expect(b.spoken).toEqual(['Battery is at 80 percent']);
  });

  it('skips the LLM in fast mode and when the LLM fails or returns unknown', async () => {
    const llm = jest.fn(async () => ({ intent: 'battery_level', target: null, source: 'llm' }) as ParsedCommand);
    const fast = makePorts({ transcripts: [t('Yah blah blah')], llm });
    await new Orchestrator(fast.ports, { ...DEFAULT_CONFIG, llmEnabled: false }).handleTrigger();
    expect(llm).not.toHaveBeenCalled();
    expect(fast.spoken).toEqual(["Sorry, I didn't understand"]);

    const failing = makePorts({
      transcripts: [t('Yah blah blah')],
      llm: async () => {
        throw new Error('model crashed');
      },
    });
    expect(await new Orchestrator(failing.ports).handleTrigger()).toMatchObject({ result: 'not_understood' });

    const unknown = makePorts({
      transcripts: [t('Yah blah blah')],
      llm: async () => ({ intent: 'unknown', target: null, source: 'llm' }),
    });
    expect(await new Orchestrator(unknown.ports).handleTrigger()).toMatchObject({ result: 'not_understood' });
  });

  it('reports battery and handles an unreadable battery', async () => {
    const ok = makePorts({ transcripts: [t('Yah ilang porsyento baterya')], battery: 63.4 });
    await new Orchestrator(ok.ports).handleTrigger();
    expect(ok.spoken).toEqual(['Battery is at 63 percent']);

    const none = makePorts({ transcripts: [t('Yah baterya')], battery: null });
    await new Orchestrator(none.ports).handleTrigger();
    expect(none.spoken).toEqual(["I can't read the battery"]);
  });

  it('repeats the last reply without overwriting it', async () => {
    const { ports, spoken } = makePorts({
      transcripts: [t('Yah anong oras'), t('Yah ulitin mo'), t('Yah ulitin mo')],
    });
    const o = new Orchestrator(ports);
    await o.handleTrigger();
    await o.handleTrigger();
    await o.handleTrigger();
    expect(spoken).toEqual([
      "It's 4:45 in the afternoon",
      "It's 4:45 in the afternoon",
      "It's 4:45 in the afternoon",
    ]);
  });

  it('says there is nothing to repeat at first', async () => {
    const { ports, spoken } = makePorts({ transcripts: [t('Yah ulitin mo')] });
    await new Orchestrator(ports).handleTrigger();
    expect(spoken).toEqual(['I have nothing to repeat']);
  });

  it('ignores a second trigger while busy', async () => {
    const gate: { release?: (clip: Clip) => void } = {};
    const { ports } = makePorts({ transcripts: [t('Yah anong oras')] });
    ports.recorder.record = jest.fn(() => new Promise<Clip>((resolve) => (gate.release = resolve)));
    const o = new Orchestrator(ports);

    const first = o.handleTrigger();
    while (!gate.release) await Promise.resolve(); // wait until recording has started
    expect(await o.handleTrigger()).toEqual({ result: 'ignored_busy' });

    gate.release(GOOD_CLIP);
    expect(await first).toMatchObject({ result: 'handled' });
  });

  it('returns an error outcome and still resumes the detector', async () => {
    const { ports, events } = makePorts({ transcripts: [] }); // stt throws
    const o = new Orchestrator(ports);
    const outcome = await o.handleTrigger();
    expect(outcome).toMatchObject({ result: 'error' });
    expect(events).toEqual(['pause', 'resume']);
    expect(o.getState()).toBe('idle');
  });

  it('reports state changes and outcome timing through hooks', async () => {
    const { ports } = makePorts({ transcripts: [t('Yah anong oras')] });
    const states: string[] = [];
    const outcomes: string[] = [];
    await new Orchestrator(ports, DEFAULT_CONFIG, {
      onStateChange: (s) => states.push(s),
      onOutcome: (o) => outcomes.push(o.result),
    }).handleTrigger();
    expect(states).toEqual(['triggered', 'recording', 'stt', 'verify', 'intent', 'act', 'speak', 'idle']);
    expect(outcomes).toEqual(['handled']);
  });
});
