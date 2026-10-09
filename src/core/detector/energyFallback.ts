import type { FrameHub } from '../audio/hub';
import type { WakeDetector } from '../pipeline/states';

export type EnergyFallbackOptions = {
  /** Continuous speech needed before we fire (filters clicks and bumps). */
  minSpeechMs?: number;
  /** After firing, ignore audio for this long so one phrase fires once. */
  cooldownMs?: number;
};

/**
 * VAD-only detector for testing without Vosk: fires whenever someone speaks.
 * It always over-triggers by design; Whisper + wake-word verification is the
 * real gate. It does not own the hub, so the caller starts/stops the mic.
 *
 * Time is measured in frame durations, not wall-clock, so it is deterministic.
 */
export class EnergyFallbackDetector implements WakeDetector {
  private readonly minSpeechMs: number;
  private readonly cooldownMs: number;

  private unsubscribe: (() => void) | null = null;
  private onTrigger: (() => void) | null = null;
  private paused = false;

  private speechRunMs = 0;
  private firedThisRun = false;
  private cooldownLeftMs = 0;

  constructor(
    private readonly hub: FrameHub,
    options: EnergyFallbackOptions = {},
  ) {
    this.minSpeechMs = options.minSpeechMs ?? 150;
    this.cooldownMs = options.cooldownMs ?? 2000;
  }

  async start(onTrigger: () => void): Promise<void> {
    if (this.unsubscribe) return;
    this.onTrigger = onTrigger;
    this.reset();
    this.unsubscribe = this.hub.subscribe((frame) => this.handle(frame.isSpeech, frame.durationMs));
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.onTrigger = null;
    this.reset();
  }

  async pause(): Promise<void> {
    this.paused = true;
  }

  async resume(): Promise<void> {
    // Drop partial state so audio from before the pause cannot fire us.
    this.reset();
    this.paused = false;
  }

  private reset(): void {
    this.speechRunMs = 0;
    this.firedThisRun = false;
    this.cooldownLeftMs = 0;
  }

  private handle(isSpeech: boolean, durationMs: number): void {
    if (this.paused) return;

    if (this.cooldownLeftMs > 0) {
      this.cooldownLeftMs = Math.max(0, this.cooldownLeftMs - durationMs);
      return;
    }

    if (!isSpeech) {
      this.speechRunMs = 0;
      this.firedThisRun = false;
      return;
    }

    this.speechRunMs += durationMs;
    if (!this.firedThisRun && this.speechRunMs >= this.minSpeechMs) {
      this.firedThisRun = true;
      this.cooldownLeftMs = this.cooldownMs;
      this.onTrigger?.();
    }
  }
}
