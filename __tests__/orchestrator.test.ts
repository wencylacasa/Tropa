import { Orchestrator, DEFAULT_CONFIG } from '@/core/pipeline/orchestrator';
import type { Clip, PipelinePorts, Transcript } from '@/core/pipeline/states';
import type { ParsedCommand } from '@/core/intents/types';
import type { Contact } from '@/core/system/contactMatch';

const CONTACTS: Contact[] = [
  { id: '1', name: 'Kuya Ben' },
  { id: '2', name: 'Jun Santos' },
  { id: '3', name: 'Jun Cruz' },
];

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
  /** Wires the call flow. `dial` defaults to a recording mock. */
  contacts?: Contact[];
  dial?: (contact: Contact) => Promise<void>;
  /** Wires the SOS flow. */
  emergencyContacts?: import('@/core/settings/settings').EmergencyContact[];
  location?: { latitude: number; longitude: number } | null;
}) {
  const clips = [...(opts.clips ?? [GOOD_CLIP])];
  const transcripts = [...(opts.transcripts ?? [])];
  const spoken: string[] = [];
  const events: string[] = [];
  const dialed: Contact[] = [];
  const sentSms: { phone: string; message: string }[] = [];

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
    contacts: opts.contacts ? { getContacts: async () => opts.contacts as Contact[] } : undefined,
    dialer: opts.contacts
      ? {
          dial: jest.fn(async (contact: Contact) => {
            if (opts.dial) await opts.dial(contact);
            dialed.push(contact);
          }),
        }
      : undefined,
    now: () => opts.now ?? new Date(2026, 9, 9, 16, 45),
    getBatteryLevel: async () => (opts.battery === undefined ? 80 : opts.battery),
    getEmergencyContacts: opts.emergencyContacts ? () => opts.emergencyContacts! : undefined,
    getLocation: opts.location !== undefined ? () => opts.location! : undefined,
    sendSms: opts.emergencyContacts 
      ? async (phone, message) => { sentSms.push({ phone, message }); } 
      : undefined,
    audioFocus: {
      request: jest.fn(() => true),
      abandon: jest.fn(() => {}),
    },
  };
  return { ports, spoken, events, dialed, sentSms };
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
    // The follow-up clip must skip the pre-roll: it would contain our own "Yes?".
    expect(ports.recorder.record).toHaveBeenNthCalledWith(1, { includePreRoll: true });
    expect(ports.recorder.record).toHaveBeenNthCalledWith(2, { includePreRoll: false });
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

  describe('call_contact', () => {
    it('confirms by voice, speaks, then dials after a yes', async () => {
      const { ports, spoken, dialed } = makePorts({
        clips: [GOOD_CLIP, GOOD_CLIP],
        transcripts: [t('Yah tawagan si kuya ben'), t('oo')],
        contacts: CONTACTS,
      });
      const outcome = await new Orchestrator(ports).handleTrigger();

      expect(outcome).toMatchObject({ result: 'handled', intent: 'call_contact', reply: 'Okay, calling' });
      expect(spoken).toEqual(['Calling Kuya Ben, okay?', 'Okay, calling']);
      expect(dialed).toEqual([CONTACTS[0]]);
      // The answer clip must skip the pre-roll: it would contain our own prompt.
      expect(ports.recorder.record).toHaveBeenNthCalledWith(2, { includePreRoll: false });
    });

    it('does not dial on no', async () => {
      const { ports, spoken, dialed } = makePorts({
        clips: [GOOD_CLIP, GOOD_CLIP],
        transcripts: [t('Yah tawagan si kuya ben'), t('hindi')],
        contacts: CONTACTS,
      });
      await new Orchestrator(ports).handleTrigger();
      expect(spoken).toEqual(['Calling Kuya Ben, okay?', 'Okay, cancelled']);
      expect(dialed).toEqual([]);
    });

    it('treats a too-short answer as not confirmed and never dials', async () => {
      const { ports, spoken, dialed } = makePorts({
        clips: [GOOD_CLIP, SHORT_CLIP, SHORT_CLIP],
        transcripts: [t('Yah tawagan si kuya ben')],
        contacts: CONTACTS,
      });
      await new Orchestrator(ports).handleTrigger();
      expect(spoken).toEqual(['Calling Kuya Ben, okay?', 'Please say yes or no', 'Okay, cancelled']);
      expect(dialed).toEqual([]);
    });

    it('treats a low-confidence "yes" as not confirmed and never dials', async () => {
      const { ports, dialed } = makePorts({
        clips: [GOOD_CLIP, GOOD_CLIP, GOOD_CLIP],
        transcripts: [t('Yah tawagan si kuya ben'), t('oo', 0.2), t('oo', 0.2)],
        contacts: CONTACTS,
      });
      await new Orchestrator(ports).handleTrigger();
      expect(dialed).toEqual([]);
    });

    it('never guesses between tied contacts', async () => {
      const { ports, spoken, dialed } = makePorts({
        transcripts: [t('Yah tawagan si jun')],
        contacts: CONTACTS,
      });
      await new Orchestrator(ports).handleTrigger();
      expect(spoken).toEqual(['I found Jun Santos or Jun Cruz. Please say the full name']);
      expect(dialed).toEqual([]);
    });

    it('says it could not place the call when the dialer fails', async () => {
      const { ports, spoken } = makePorts({
        clips: [GOOD_CLIP, GOOD_CLIP],
        transcripts: [t('Yah tawagan si kuya ben'), t('sige')],
        contacts: CONTACTS,
        dial: async () => {
          throw new Error('CALL_PHONE denied');
        },
      });
      const outcome = await new Orchestrator(ports).handleTrigger();
      expect(outcome).toMatchObject({ result: 'handled', intent: 'call_contact' });
      expect(spoken).toEqual([
        'Calling Kuya Ben, okay?',
        'Okay, calling',
        "Sorry, I couldn't place the call",
      ]);
    });

    it('is "not understood" when contacts and dialer are not wired', async () => {
      const { ports, spoken } = makePorts({ transcripts: [t('Yah tawagan si kuya ben')] });
      const outcome = await new Orchestrator(ports).handleTrigger();
      expect(outcome).toMatchObject({ result: 'not_understood' });
      expect(spoken).toEqual(["Sorry, I didn't understand"]);
    });
  });

  describe('sos_alert', () => {
    it('confirms cancellation, if no cancellation sends SMS', async () => {
      const { ports, spoken, sentSms } = makePorts({
        clips: [GOOD_CLIP, GOOD_CLIP],
        transcripts: [t('Yah tulong'), t('wala', 0.9)], // "wala" is not "cancel" or "no"
        emergencyContacts: [{ name: 'Test', phone: '123' }],
        location: { latitude: 1, longitude: 2 },
      });
      const outcome = await new Orchestrator(ports).handleTrigger();
      expect(outcome).toMatchObject({ result: 'handled', intent: 'sos_alert', reply: 'SOS sent to your emergency contacts.' });
      expect(spoken).toEqual(['SOS triggered. Say cancel to abort.', 'SOS sent to your emergency contacts.']);
      expect(sentSms).toHaveLength(1);
    });

    it('cancels if the user says no/cancel', async () => {
      const { ports, spoken, sentSms } = makePorts({
        clips: [GOOD_CLIP, GOOD_CLIP],
        transcripts: [t('Yah tulong'), t('cancel', 0.9)],
        emergencyContacts: [{ name: 'Test', phone: '123' }],
        location: { latitude: 1, longitude: 2 },
      });
      const outcome = await new Orchestrator(ports).handleTrigger();
      expect(outcome).toMatchObject({ result: 'handled', intent: 'sos_alert', reply: 'Okay, SOS cancelled.' });
      expect(spoken).toEqual(['SOS triggered. Say cancel to abort.', 'Okay, SOS cancelled.']);
      expect(sentSms).toHaveLength(0);
    });

    it('bails out if no emergency contacts', async () => {
      const { ports, spoken, sentSms } = makePorts({
        transcripts: [t('Yah tulong')],
        emergencyContacts: [],
        location: null,
      });
      const outcome = await new Orchestrator(ports).handleTrigger();
      expect(outcome).toMatchObject({ result: 'handled', intent: 'sos_alert', reply: 'You have no emergency contacts set up.' });
      expect(spoken).toEqual(['You have no emergency contacts set up.']);
      expect(sentSms).toHaveLength(0);
    });

    it('gracefully complains if SOS ports are not wired', async () => {
      const { ports, spoken } = makePorts({ transcripts: [t('Yah tulong')] }); // no emergencyContacts provided
      const outcome = await new Orchestrator(ports).handleTrigger();
      expect(outcome).toMatchObject({ result: 'handled', intent: 'sos_alert', reply: 'You have no emergency contacts set up.' });
      expect(spoken).toEqual(['You have no emergency contacts set up.']);
    });
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
