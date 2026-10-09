import { rms, samplesToMs } from './pcm';

export type EnergyVadOptions = {
  /** Absolute floor: quieter than this is never speech (about -34 dBFS). */
  minRms?: number;
  /** Speech must be this many times louder than the tracked noise floor. */
  ratio?: number;
  /** How fast the noise floor follows quiet frames (0-1 per frame). */
  floorAlpha?: number;
  initialFloor?: number;
  minFloor?: number;
  /** Continuous "speech" longer than this is treated as steady noise (engine, wind). */
  maxSpeechMs?: number;
};

/**
 * Simple energy gate with an adaptive noise floor. Good enough for tests and
 * as the always-on fallback; it will over-trigger on a loud bike, which is
 * exactly why Whisper + wake-word verification sits behind it.
 */
export class EnergyVad {
  private floor: number;
  private speechRunMs = 0;
  private readonly o: Required<EnergyVadOptions>;

  constructor(options: EnergyVadOptions = {}) {
    this.o = {
      minRms: 0.02,
      ratio: 3,
      floorAlpha: 0.05,
      initialFloor: 0.005,
      minFloor: 0.0005,
      maxSpeechMs: 8000,
      ...options,
    };
    this.floor = this.o.initialFloor;
  }

  process(samples: Float32Array): { isSpeech: boolean; rms: number } {
    const level = rms(samples);
    const durationMs = samplesToMs(samples.length);
    const threshold = Math.max(this.o.minRms, this.floor * this.o.ratio);

    if (level > threshold) {
      this.speechRunMs += durationMs;
      if (this.speechRunMs > this.o.maxSpeechMs) {
        // Never-ending "speech" is noise: raise the floor above it.
        this.floor = level;
        this.speechRunMs = 0;
        return { isSpeech: false, rms: level };
      }
      return { isSpeech: true, rms: level };
    }

    this.speechRunMs = 0;
    this.floor = Math.max(this.o.minFloor, this.floor + (level - this.floor) * this.o.floorAlpha);
    return { isSpeech: false, rms: level };
  }

  getNoiseFloor(): number {
    return this.floor;
  }
}
