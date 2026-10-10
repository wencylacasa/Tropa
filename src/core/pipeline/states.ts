import type { ParsedCommand } from '../intents/types';
import type { Contact } from '../system/contactMatch';

export type PipelineState =
  | 'idle'
  | 'triggered'
  | 'recording'
  | 'stt'
  | 'verify'
  | 'intent'
  | 'act'
  | 'speak';

/** Audio captured after a possible trigger (pre-roll + live speech). */
export type Clip = {
  /** Opaque to the orchestrator; the STT adapter knows how to read it (Float32Array, 16 kHz mono). */
  data: unknown;
  /** Length of the speech itself (first to last speech frame), not the padding around it. */
  durationMs: number;
  /** Fraction of that speech span the VAD flagged as speech, 0-1. */
  speechProbability: number;
};

export type Transcript = {
  text: string;
  /** 0-1. Adapters should map the engine's own score into this range. */
  confidence: number;
};

/** Always-on wake detector. Over-triggering is allowed; verify() is the gate. */
export interface WakeDetector {
  start(onTrigger: () => void): Promise<void>;
  stop(): Promise<void>;
  /** Paused while we record/speak so we do not hear ourselves. */
  pause(): Promise<void>;
  resume(): Promise<void>;
}

export type RecordOptions = {
  /**
   * Prepend the last few seconds of audio (default true). Turn off for the
   * follow-up clip after "Yes?", where the pre-roll would contain our own voice.
   */
  includePreRoll?: boolean;
};

export interface ClipRecorder {
  /** Resolves when ~1 s of silence or the 6 s cap is reached. */
  record(options?: RecordOptions): Promise<Clip>;
}

export interface SpeechToText {
  transcribe(clip: Clip): Promise<Transcript>;
}

export interface Speaker {
  /** Resolves when speech has finished. */
  speak(text: string): Promise<void>;
}

export interface Feedback {
  beep(): Promise<void>;
}

export interface LlmParser {
  parse(command: string): Promise<ParsedCommand>;
  /** Optional: freeform short answer when no intent matches. */
  chat?(command: string, lastExchange?: { command: string; reply: string } | null): Promise<string>;
}

/** Cached contacts that have a phone number. Empty when permission is missing. */
export interface ContactSource {
  getContacts(): Promise<readonly Contact[]>;
}

/** Places the call. Called only after an explicit spoken yes. */
export interface Dialer {
  dial(contact: Contact): Promise<void>;
}

export type PipelinePorts = {
  detector: WakeDetector;
  recorder: ClipRecorder;
  stt: SpeechToText;
  tts: Speaker;
  feedback: Feedback;
  /** Optional: absent when "fast mode" (rules only) or model not installed. */
  llm?: LlmParser;
  /** Optional: without both `contacts` and `dialer`, call_contact is "not understood". */
  contacts?: ContactSource;
  dialer?: Dialer;
  now: () => Date;
  getBatteryLevel: () => Promise<number | null>;
  /** Optional: SOS flow requires these three ports. */
  getEmergencyContacts?: () => readonly import('../settings/settings').EmergencyContact[];
  getLocation?: () => { latitude: number; longitude: number } | null;
  sendSms?: (phone: string, message: string) => Promise<void>;
  /** Optional: reverse-geocoded place for "where am I"; null when unavailable. */
  describeLocation?: () => Promise<string | null>;
  /** Optional: Used to duck background audio while listening/speaking. */
  audioFocus?: { request: () => boolean; abandon: () => void };
  /** Optional: media transport keys + volume. Absent on Expo Go / web. */
  media?: {
    playPause(): void;
    next(): void;
    volumeUp(): void;
    volumeDown(): void;
  } | null;
};

export type TriggerOutcome =
  | { result: 'ignored_busy' }
  | { result: 'discarded_short' }
  | { result: 'discarded_no_wake'; transcript: string }
  | { result: 'no_command' }
  | { result: 'low_confidence'; transcript: string; reply?: string }
  | { result: 'handled'; transcript: string; command: string; intent: string; reply: string }
  | { result: 'not_understood'; transcript: string; command: string; reply?: string }
  | { result: 'error'; message: string };
