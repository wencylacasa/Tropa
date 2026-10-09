import type { PipelineState, TriggerOutcome } from '../pipeline/states';

export type AssistantStatus = {
  /** Mic and detector are running. */
  listening: boolean;
  muted: boolean;
  pipeline: PipelineState;
  /** What Whisper last heard, including clips that were then discarded. */
  lastHeard: string | null;
  /** Short description of what the last trigger led to. */
  lastAction: string | null;
  /** The last thing we said for a handled command. */
  lastReply: string | null;
  lastTimingMs: number | null;
};

export type StatusTone = 'off' | 'waiting' | 'busy';

export const INITIAL_STATUS: AssistantStatus = {
  listening: false,
  muted: false,
  pipeline: 'idle',
  lastHeard: null,
  lastAction: null,
  lastReply: null,
  lastTimingMs: null,
};

/** One line for the Home screen. Returns null for outcomes that should not overwrite it. */
export function describeOutcome(outcome: TriggerOutcome): string | null {
  switch (outcome.result) {
    case 'handled':
      return outcome.intent;
    case 'not_understood':
      return "Didn't understand";
    case 'low_confidence':
      return 'Asked to repeat';
    case 'discarded_no_wake':
      return 'Ignored (no wake word)';
    case 'discarded_short':
      return 'Ignored (too short)';
    case 'no_command':
      return 'No command heard';
    case 'error':
      return `Error: ${outcome.message}`;
    case 'ignored_busy':
      return null;
  }
}

function capitalize(word: string): string {
  return word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word;
}

/** Big status text. `wakeWord` is the first wake word from Settings. */
export function statusLabel(status: AssistantStatus, wakeWord = 'yah'): string {
  if (status.muted) return 'Muted';
  if (!status.listening) return 'Mic off';

  switch (status.pipeline) {
    case 'idle':
      return `Naghihintay ng "${capitalize(wakeWord)}"`;
    case 'triggered':
    case 'recording':
      return 'Listening';
    case 'stt':
    case 'verify':
    case 'intent':
    case 'act':
      return 'Thinking';
    case 'speak':
      return 'Speaking';
  }
}

export function statusTone(status: AssistantStatus): StatusTone {
  if (status.muted || !status.listening) return 'off';
  return status.pipeline === 'idle' ? 'waiting' : 'busy';
}

/**
 * What the Home screen shows. The orchestrator feeds it through its hooks
 * (onStateChange / onOutcome); the UI subscribes with useSyncExternalStore, so
 * `get` and `subscribe` are arrow properties and can be passed around unbound.
 */
export class StatusStore {
  private status: AssistantStatus = INITIAL_STATUS;
  private readonly listeners = new Set<() => void>();

  get = (): AssistantStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setListening(listening: boolean): void {
    this.patch({ listening });
  }

  setMuted(muted: boolean): void {
    this.patch({ muted });
  }

  setPipelineState(pipeline: PipelineState): void {
    this.patch({ pipeline });
  }

  recordOutcome(outcome: TriggerOutcome, timingMs: number): void {
    if (outcome.result === 'ignored_busy') return;

    const patch: Partial<AssistantStatus> = {
      lastAction: describeOutcome(outcome),
      lastTimingMs: timingMs,
    };
    if ('transcript' in outcome) patch.lastHeard = outcome.transcript;
    if (outcome.result === 'handled') patch.lastReply = outcome.reply;
    this.patch(patch);
  }

  /** Forget the last heard/action/reply (e.g. a "clear" button, or tests). */
  reset(): void {
    this.patch({ ...INITIAL_STATUS });
  }

  private patch(changes: Partial<AssistantStatus>): void {
    const next = { ...this.status, ...changes };
    const changed = (Object.keys(next) as (keyof AssistantStatus)[]).some((key) => next[key] !== this.status[key]);
    if (!changed) return;

    this.status = next;
    for (const listener of Array.from(this.listeners)) listener();
  }
}
