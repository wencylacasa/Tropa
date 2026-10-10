import { initWhisper, type WhisperContext } from './whisperNative';

import type { Clip, SpeechToText, Transcript } from '../pipeline/states';
import { estimateConfidence, NONE } from './sttConfidence';

export type WhisperServiceOptions = {
  /** Absolute path of the ggml model file, or null if not installed yet. */
  getModelPath: () => string | null;
  /** Whisper language code. "tl" = Tagalog; Taglish still transcribes best this way. */
  language?: string;
  /** Keep the model in RAM between commands (faster, needs headroom on 4 GB phones). */
  keepLoaded?: boolean;
  /** Optional initial prompt to bias spelling, e.g. "Yah, tropa, kuya, tol". Tune on device. */
  prompt?: string;
  maxThreads?: number;
};

/**
 * Load > transcribe > release (unless keepLoaded), per the memory strategy.
 * Clip.data must be a Float32Array of 16 kHz mono PCM in [-1, 1]. The model
 * must be the multilingual build (ggml-tiny.bin), NOT the English-only
 * ggml-tiny.en.bin, or Tagalog will not work.
 */
export class WhisperService implements SpeechToText {
  private context: WhisperContext | null = null;

  constructor(private readonly options: WhisperServiceOptions) {}

  async transcribe(clip: Clip): Promise<Transcript> {
    const pcm = clip.data;
    if (!(pcm instanceof Float32Array)) {
      throw new Error('WhisperService expects Clip.data to be a Float32Array (16 kHz mono PCM)');
    }

    const context = await this.load();
    try {
      // transcribeData takes an ArrayBuffer; copy so byteOffset/length are exact.
      const buffer = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;

      const { promise } = context.transcribeData(buffer, {
        language: this.options.language ?? 'tl',
        // whisper.rn defaults to 2 threads on <=4 cores; tiny fits comfortably in 4.
        maxThreads: this.options.maxThreads ?? 4,
        prompt: this.options.prompt,
        temperature: 0,
      });
      const result = await promise;

      const text = result.result.trim();
      return { text, confidence: result.isAborted ? NONE : estimateConfidence(text) };
    } finally {
      if (!this.options.keepLoaded) await this.release();
    }
  }

  async release(): Promise<void> {
    const context = this.context;
    this.context = null;
    if (context) await context.release();
  }

  private async load(): Promise<WhisperContext> {
    if (this.context) return this.context;

    const filePath = this.options.getModelPath();
    if (!filePath) throw new Error('Whisper model is not installed yet (run Setup)');

    this.context = await initWhisper({ filePath });
    return this.context;
  }
}
