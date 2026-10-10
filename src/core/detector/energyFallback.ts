import type { FrameHub } from '../audio/hub';
import type { WakeDetector } from '../pipeline/states';

export type EnergyFallbackOptions = {
  /** Continuous speech needed before we fire (filters clicks and bumps). */
  minSpeechMs?: number;
  /** After firing, ignore audio for this long so one phrase fires once. */
  cooldownMs?: number;
  /**
   * After resume(), this much continuous quiet is required before speech can
   * trigger us again. Noise that was already running when the previous
   * pipeline run ended (music, engine, our own TTS tail) must not retrigger
   * the detector in a loop.
   */
  rearmQuietMs?: number;
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
  private readonly rearmQuietMs: number;

  private unsubscribe: (() => void) | null = null;
  private onTrigger: (() => void) | null = null;
  private paused = false;
  private rearming = false;

  private speechRunMs = 0;
  private quietRunMs = 0;
  private firedThisRun = false;
  private cooldownLeftMs = 0;

  constructor(
    private readonly hub: FrameHub,
    options: EnergyFallbackOptions = {},
  ) {
    this.minSpeechMs = options.minSpeechMs ?? 150;
    this.cooldownMs = options.cooldownMs ?? 2000;
    this.rearmQuietMs = options.rearmQuietMs ?? 600;
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
    // Drop partial state so audio from before the pause cannot fire us, and
    // clear the pre-roll: it still holds our own TTS reply and the tail of the
    // last command, which would leak into the next clip otherwise.
    this.reset();
    this.rearming = true;
    this.hub.clearPreRoll();
    this.paused = false;
  }

  private reset(): void {
    this.speechRunMs = 0;
    this.quietRunMs = 0;
    this.firedThisRun = false;
    this.cooldownLeftMs = 0;
    this.rearming = false;
  }

  private handle(isSpeech: boolean, durationMs: number): void {
    if (this.paused) return;

    // Re-arm: require a real quiet gap after resume() so noise that was
    // already running cannot fire us again the instant we unpause.
    if (this.rearming) {
      if (isSpeech) {
        this.quietRunMs = 0;
        return;
      }
      this.quietRunMs += durationMs;
      if (this.quietRunMs < this.rearmQuietMs) return;
      this.rearming = false;
      this.quietRunMs = 0;
    }

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
