import type { ParsedCommand } from '../intents/types';

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
  /** Opaque to the orchestrator; the STT adapter knows how to read it. */
  data: unknown;
  durationMs: number;
  /** 0-1 from the VAD. */
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

export interface ClipRecorder {
  /** Resolves when ~1 s of silence or the 6 s cap is reached. */
  record(): Promise<Clip>;
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
}

export type PipelinePorts = {
  detector: WakeDetector;
  recorder: ClipRecorder;
  stt: SpeechToText;
  tts: Speaker;
  feedback: Feedback;
  /** Optional: absent when "fast mode" (rules only) or model not installed. */
  llm?: LlmParser;
  now: () => Date;
  getBatteryLevel: () => Promise<number | null>;
};

export type TriggerOutcome =
  | { result: 'ignored_busy' }
  | { result: 'discarded_short' }
  | { result: 'discarded_no_wake'; transcript: string }
  | { result: 'no_command' }
  | { result: 'low_confidence'; transcript: string }
  | { result: 'handled'; transcript: string; command: string; intent: string; reply: string }
  | { result: 'not_understood'; transcript: string; command: string }
  | { result: 'error'; message: string };
