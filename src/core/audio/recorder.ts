import type { Clip, ClipRecorder, RecordOptions } from '../pipeline/states';
import type { FrameHub } from './hub';
import { concatSamples } from './pcm';
import type { FrameInfo } from './preRollBuffer';

export type RecorderOptions = {
  /** Stop after this much silence once speech was heard. */
  silenceMs?: number;
  /** Hard cap on live recording. */
  maxMs?: number;
  /** Give up if no speech at all is heard for this long. */
  noSpeechTimeoutMs?: number;
};

function trailingSilenceMs(frames: FrameInfo[]): number {
  let total = 0;
  for (let i = frames.length - 1; i >= 0 && !frames[i].isSpeech; i--) total += frames[i].durationMs;
  return total;
}

/**
 * Records until ~1 s of silence follows speech, or 6 s total. Optionally starts
 * with the pre-roll so the first syllable of the wake word (spoken before the
 * trigger fired) is not lost.
 */
export class VadClipRecorder implements ClipRecorder {
  private readonly silenceMs: number;
  private readonly maxMs: number;
  private readonly noSpeechTimeoutMs: number;

  constructor(
    private readonly hub: FrameHub,
    options: RecorderOptions = {},
  ) {
    this.silenceMs = options.silenceMs ?? 1000;
    this.maxMs = options.maxMs ?? 6000;
    this.noSpeechTimeoutMs = options.noSpeechTimeoutMs ?? 4000;
  }

  record(options: RecordOptions = {}): Promise<Clip> {
    const includePreRoll = options.includePreRoll ?? true;

    return new Promise<Clip>((resolve) => {
      const chunks: Float32Array[] = [];
      const infos: FrameInfo[] = [];
      let liveMs = 0;
      let heardSpeech = false;
      let silenceRunMs = 0;

      // Snapshot and subscribe in the same tick so no frame is missed or doubled.
      if (includePreRoll) {
        const pre = this.hub.getPreRoll();
        if (pre.samples.length > 0) chunks.push(pre.samples);
        infos.push(...pre.frames);
        heardSpeech = pre.frames.some((f) => f.isSpeech);
        silenceRunMs = trailingSilenceMs(pre.frames);
      }

      const unsubscribe = this.hub.subscribe((frame) => {
        chunks.push(frame.samples);
        infos.push({ durationMs: frame.durationMs, isSpeech: frame.isSpeech });
        liveMs += frame.durationMs;

        if (frame.isSpeech) {
          heardSpeech = true;
          silenceRunMs = 0;
        } else {
          silenceRunMs += frame.durationMs;
        }

        const endOfSpeech = heardSpeech && silenceRunMs >= this.silenceMs;
        const tooLong = liveMs >= this.maxMs;
        const nothingSaid = !heardSpeech && liveMs >= this.noSpeechTimeoutMs;

        if (endOfSpeech || tooLong || nothingSaid) {
          unsubscribe();
          resolve(buildClip(chunks, infos));
        }
      });
    });
  }
}

function buildClip(chunks: Float32Array[], infos: FrameInfo[]): Clip {
  const data = concatSamples(chunks);

  const first = infos.findIndex((f) => f.isSpeech);
  if (first === -1) return { data, durationMs: 0, speechProbability: 0 };

  let last = infos.length - 1;
  while (!infos[last].isSpeech) last--;

  let spanMs = 0;
  let speechMs = 0;
  for (let i = first; i <= last; i++) {
    spanMs += infos[i].durationMs;
    if (infos[i].isSpeech) speechMs += infos[i].durationMs;
  }
  return { data, durationMs: spanMs, speechProbability: speechMs / spanMs };
}
