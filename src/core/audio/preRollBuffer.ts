import { SAMPLE_RATE, concatSamples, samplesToMs } from './pcm';

export type FrameInfo = { durationMs: number; isSpeech: boolean };

export type PreRollSnapshot = {
  samples: Float32Array;
  frames: FrameInfo[];
};

/**
 * Rolling window of the most recent audio (default 4 s), kept as whole frames
 * so each frame keeps its speech flag. Holds at least `capacityMs`, at most one
 * extra frame.
 */
export class PreRollBuffer {
  private frames: { samples: Float32Array; isSpeech: boolean }[] = [];
  private totalSamples = 0;
  private readonly capacitySamples: number;

  constructor(
    capacityMs = 4000,
    private readonly sampleRate = SAMPLE_RATE,
  ) {
    this.capacitySamples = Math.round((capacityMs * sampleRate) / 1000);
  }

  push(samples: Float32Array, isSpeech: boolean): void {
    this.frames.push({ samples, isSpeech });
    this.totalSamples += samples.length;

    while (this.frames.length > 1 && this.totalSamples - this.frames[0].samples.length >= this.capacitySamples) {
      this.totalSamples -= this.frames[0].samples.length;
      this.frames.shift();
    }
  }

  snapshot(): PreRollSnapshot {
    return {
      samples: concatSamples(this.frames.map((f) => f.samples)),
      frames: this.frames.map((f) => ({
        durationMs: samplesToMs(f.samples.length, this.sampleRate),
        isSpeech: f.isSpeech,
      })),
    };
  }

  clear(): void {
    this.frames = [];
    this.totalSamples = 0;
  }
}
