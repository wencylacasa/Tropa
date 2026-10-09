import { samplesToMs } from './pcm';
import type { PreRollBuffer, PreRollSnapshot } from './preRollBuffer';
import type { EnergyVad } from './vad';

/** One chunk of microphone audio plus the VAD verdict for it. */
export type Frame = {
  samples: Float32Array;
  isSpeech: boolean;
  durationMs: number;
};

export type FrameListener = (frame: Frame) => void;

/** The raw microphone: 16 kHz mono float samples in small chunks. */
export interface RawAudioSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  onSamples(callback: (samples: Float32Array) => void): () => void;
}

/**
 * What the detector and recorder talk to. ONE microphone feeds everything
 * (Vosk and Whisper must not fight over the mic).
 */
export interface FrameHub {
  subscribe(listener: FrameListener): () => void;
  /** Snapshot of the last few seconds, for the pre-roll of a clip. */
  getPreRoll(): PreRollSnapshot;
  clearPreRoll(): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class AudioHub implements FrameHub {
  private readonly listeners = new Set<FrameListener>();
  private detach: (() => void) | null = null;

  constructor(
    private readonly source: RawAudioSource,
    private readonly vad: EnergyVad,
    private readonly preRoll: PreRollBuffer,
  ) {}

  async start(): Promise<void> {
    if (this.detach) return;
    this.detach = this.source.onSamples((samples) => this.handle(samples));
    await this.source.start();
  }

  async stop(): Promise<void> {
    this.detach?.();
    this.detach = null;
    await this.source.stop();
  }

  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getPreRoll(): PreRollSnapshot {
    return this.preRoll.snapshot();
  }

  clearPreRoll(): void {
    this.preRoll.clear();
  }

  private handle(samples: Float32Array): void {
    const { isSpeech } = this.vad.process(samples);
    // Push BEFORE notifying: a recorder that snapshots the pre-roll and then
    // subscribes (synchronously) sees every frame exactly once.
    this.preRoll.push(samples, isSpeech);

    const frame: Frame = { samples, isSpeech, durationMs: samplesToMs(samples.length) };
    for (const listener of Array.from(this.listeners)) listener(frame);
  }
}
