import {
  INITIAL_STATUS,
  StatusStore,
  describeOutcome,
  statusLabel,
  statusTone,
  type AssistantStatus,
} from '@/core/app/status';
import { MODEL_SPECS } from '@/core/models/manager';
import { readinessNotice } from '@/core/models/readinessNotice';
import type { PipelineState, TriggerOutcome } from '@/core/pipeline/states';

function status(changes: Partial<AssistantStatus> = {}): AssistantStatus {
  return { ...INITIAL_STATUS, listening: true, ...changes };
}

describe('statusLabel', () => {
  it('shows the wake word prompt when idle and listening', () => {
    expect(statusLabel(status())).toBe('Naghihintay ng "Yah"');
    expect(statusLabel(status(), 'tropa')).toBe('Naghihintay ng "Tropa"');
  });

  it('shows Muted and Mic off before anything else', () => {
    expect(statusLabel(status({ muted: true, pipeline: 'speak' }))).toBe('Muted');
    expect(statusLabel(status({ listening: false }))).toBe('Mic off');
    expect(statusLabel(status({ muted: true, listening: false }))).toBe('Muted');
  });

  it('maps every pipeline state to Listening, Thinking or Speaking', () => {
    const expected: Record<PipelineState, string> = {
      idle: 'Naghihintay ng "Yah"',
      triggered: 'Listening',
      recording: 'Listening',
      stt: 'Thinking',
      verify: 'Thinking',
      intent: 'Thinking',
      act: 'Thinking',
      speak: 'Speaking',
    };
    for (const [pipeline, label] of Object.entries(expected)) {
      expect(statusLabel(status({ pipeline: pipeline as PipelineState }))).toBe(label);
    }
  });
});

describe('statusTone', () => {
  it('is off when muted or the mic is off, waiting when idle, busy otherwise', () => {
    expect(statusTone(status({ muted: true }))).toBe('off');
    expect(statusTone(status({ listening: false }))).toBe('off');
    expect(statusTone(status())).toBe('waiting');
    expect(statusTone(status({ pipeline: 'stt' }))).toBe('busy');
  });
});

describe('describeOutcome', () => {
  it('describes every outcome, and skips ignored_busy', () => {
    const cases: [TriggerOutcome, string | null][] = [
      [{ result: 'handled', transcript: 'Yah oras', command: 'oras', intent: 'tell_time', reply: 'x' }, 'tell_time'],
      [{ result: 'not_understood', transcript: 'a', command: 'b' }, "Didn't understand"],
      [{ result: 'low_confidence', transcript: 'a' }, 'Asked to repeat'],
      [{ result: 'discarded_no_wake', transcript: 'a' }, 'Ignored (no wake word)'],
      [{ result: 'discarded_short' }, 'Ignored (too short)'],
      [{ result: 'no_command' }, 'No command heard'],
      [{ result: 'error', message: 'boom' }, 'Error: boom'],
      [{ result: 'ignored_busy' }, null],
    ];
    for (const [outcome, text] of cases) expect(describeOutcome(outcome)).toBe(text);
  });
});

describe('StatusStore', () => {
  it('starts from the initial status', () => {
    expect(new StatusStore().get()).toEqual(INITIAL_STATUS);
  });

  it('records a handled command: heard text, action, reply and timing', () => {
    const store = new StatusStore();
    store.recordOutcome(
      { result: 'handled', transcript: 'Yah anong oras', command: 'anong oras', intent: 'tell_time', reply: "It's 4:45" },
      812,
    );
    expect(store.get()).toMatchObject({
      lastHeard: 'Yah anong oras',
      lastAction: 'tell_time',
      lastReply: "It's 4:45",
      lastTimingMs: 812,
    });
  });

  it('keeps the last reply when a later trigger was not handled, but updates the rest', () => {
    const store = new StatusStore();
    store.recordOutcome({ result: 'handled', transcript: 'a', command: 'b', intent: 'tell_date', reply: 'Friday' }, 1);
    store.recordOutcome({ result: 'discarded_no_wake', transcript: 'kumain na' }, 2);
    expect(store.get()).toMatchObject({
      lastHeard: 'kumain na',
      lastAction: 'Ignored (no wake word)',
      lastReply: 'Friday',
      lastTimingMs: 2,
    });
  });

  it('keeps the last heard text for outcomes without a transcript', () => {
    const store = new StatusStore();
    store.recordOutcome({ result: 'low_confidence', transcript: 'garbled' }, 1);
    store.recordOutcome({ result: 'discarded_short' }, 2);
    expect(store.get().lastHeard).toBe('garbled');
    expect(store.get().lastAction).toBe('Ignored (too short)');
  });

  it('ignores ignored_busy completely', () => {
    const store = new StatusStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.recordOutcome({ result: 'ignored_busy' }, 5);
    expect(listener).not.toHaveBeenCalled();
    expect(store.get()).toEqual(INITIAL_STATUS);
  });

  it('notifies on change, returns a new object each time, and stays quiet when nothing changed', () => {
    const store = new StatusStore();
    const listener = jest.fn();
    store.subscribe(listener);

    const before = store.get();
    store.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).not.toBe(before);

    const after = store.get();
    store.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toBe(after);
  });

  it('works with get and subscribe passed around unbound (useSyncExternalStore)', () => {
    const store = new StatusStore();
    const { get, subscribe } = store;
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);

    store.setPipelineState('speak');
    expect(get().pipeline).toBe('speak');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.setListening(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tracks listening, muted and pipeline state independently', () => {
    const store = new StatusStore();
    store.setListening(true);
    store.setPipelineState('recording');
    store.setMuted(true);
    expect(store.get()).toMatchObject({ listening: true, pipeline: 'recording', muted: true });
  });

  it('reset clears everything', () => {
    const store = new StatusStore();
    store.setListening(true);
    store.recordOutcome({ result: 'handled', transcript: 'a', command: 'b', intent: 'tell_time', reply: 'x' }, 9);
    store.reset();
    expect(store.get()).toEqual(INITIAL_STATUS);
  });
});

describe('readinessNotice', () => {
  it('is null when everything is ready', () => {
    expect(readinessNotice({ ready: true, blocking: [] })).toBeNull();
  });

  it('lists each blocking model with a plain reason', () => {
    const notice = readinessNotice({
      ready: false,
      blocking: [
        { id: 'whisper-tiny', status: 'missing' },
        { id: 'qwen3-0.6b', status: 'incomplete' },
        { id: 'whisper-base', status: 'wrong_variant' },
      ],
    });
    expect(notice).toContain(`${MODEL_SPECS['whisper-tiny'].label}: not downloaded`);
    expect(notice).toContain(`${MODEL_SPECS['qwen3-0.6b'].label}: incomplete, needs a new download`);
    expect(notice).toContain(`${MODEL_SPECS['whisper-base'].label}: wrong build (English-only)`);
  });
});
