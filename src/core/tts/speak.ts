import * as Speech from 'expo-speech';

import type { Speaker } from '../pipeline/states';

export type ExpoSpeakerOptions = {
  /** Replies are English everywhere, so en-US by default. */
  language?: string;
  rate?: number;
  /** Safety net so a stuck TTS engine can never hang the pipeline. */
  timeoutMs?: number;
  onError?: (error: Error) => void;
};

/**
 * Uses the phone's built-in offline TTS engine. speak() resolves when speech
 * finishes, is stopped, errors, or times out. It never rejects: a failed
 * reply must not crash the pipeline (the error goes to onError instead).
 */
export class ExpoSpeaker implements Speaker {
  constructor(private readonly options: ExpoSpeakerOptions = {}) {}

  speak(text: string): Promise<void> {
    const { language = 'en-US', rate = 1, timeoutMs = 15_000, onError } = this.options;

    return new Promise<void>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const done = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve();
      };

      timer = setTimeout(() => {
        void Speech.stop();
        done();
      }, timeoutMs);

      Speech.speak(text, {
        language,
        rate,
        onDone: done,
        onStopped: done,
        onError: (error) => {
          onError?.(error);
          done();
        },
      });
    });
  }

  stop(): Promise<void> {
    return Speech.stop();
  }
}
