import type { Clip, ClipRecorder, RecordOptions } from '../pipeline/states';
import type { FrameHub } from './hub';
import { concatSamples, SAMPLE_RATE } from './pcm';
import type { FrameInfo } from './preRollBuffer';

export type RecorderOptions = {
  /** Stop after this much silence once speech was heard. */
  silenceMs?: number;
  /** Hard cap on live recording. */
  maxMs?: number;
  /** Give up if no speech at all is heard for this long. */
  noSpeechTimeoutMs?: number;
  /** Audio kept before the first / after the last speech frame (Whisper trims better with a little air). */
  paddingMs?: number;
};

/** A frame's position inside the final PCM buffer, in samples. */
type Bounds = { start: number; end: number };

function frameSamples(durationMs: number): number {
  return Math.round((durationMs / 1000) * SAMPLE_RATE);
}

function trailingSilenceMs(frames: FrameInfo[]): number {
  let total = 0;
  for (let i = frames.length - 1; i >= 0 && !frames[i].isSpeech; i--) total += frames[i].durationMs;
  return total;
}

/**
 * Records until ~1 s of silence follows speech, or 6 s total. Optionally starts
 * with the pre-roll so the first syllable of the wake word (spoken before the
 * trigger fired) is not lost.
 *
 * The returned PCM is trimmed to the speech span plus a short padding: feeding
 * Whisper the whole buffer (pre-roll silence + trailing silence) roughly
 * triples transcription time for no benefit.
 *
 * A wall-clock watchdog resolves the promise even if frames stop arriving
 * (dead mic, stopped hub) so a hung record can never wedge the pipeline or
 * block mute/unmute.
 */
export class VadClipRecorder implements ClipRecorder {
  private readonly silenceMs: number;
  private readonly maxMs: number;
  private readonly noSpeechTimeoutMs: number;
  private readonly paddingSamples: number;

  constructor(
    private readonly hub: FrameHub,
    options: RecorderOptions = {},
  ) {
    this.silenceMs = options.silenceMs ?? 1000;
    this.maxMs = options.maxMs ?? 6000;
    this.noSpeechTimeoutMs = options.noSpeechTimeoutMs ?? 4000;
    this.paddingSamples = Math.round(((options.paddingMs ?? 300) / 1000) * SAMPLE_RATE);
  }

  record(options: RecordOptions = {}): Promise<Clip> {
    const includePreRoll = options.includePreRoll ?? true;

    return new Promise<Clip>((resolve) => {
      const chunks: Float32Array[] = [];
      const infos: FrameInfo[] = [];
      const bounds: Bounds[] = [];
      let cursor = 0;
      let liveMs = 0;
      let heardSpeech = false;
      let silenceRunMs = 0;
      let done = false;

      // Snapshot and subscribe in the same tick so no frame is missed or doubled.
      if (includePreRoll) {
        const pre = this.hub.getPreRoll();
        if (pre.samples.length > 0) chunks.push(pre.samples);
        for (const frame of pre.frames) {
          const len = frameSamples(frame.durationMs);
          infos.push(frame);
          bounds.push({ start: cursor, end: cursor + len });
          cursor += len;
        }
        heardSpeech = pre.frames.some((f) => f.isSpeech);
        silenceRunMs = trailingSilenceMs(pre.frames);
      }

      const finish = () => {
        if (done) return;
        done = true;
        unsubscribe();
        clearTimeout(watchdog);
        resolve(buildClip(chunks, infos, bounds, this.paddingSamples));
      };

      // If the mic dies mid-record the frame callback just stops firing; this
      // guarantees the promise still settles a little after the hard cap.
      const watchdog = setTimeout(finish, this.maxMs + 2500);

      const unsubscribe = this.hub.subscribe((frame) => {
        chunks.push(frame.samples);
        infos.push({ durationMs: frame.durationMs, isSpeech: frame.isSpeech });
        bounds.push({ start: cursor, end: cursor + frame.samples.length });
        cursor += frame.samples.length;
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

        if (endOfSpeech || tooLong || nothingSaid) finish();
      });
    });
  }
}

function buildClip(
  chunks: Float32Array[],
  infos: FrameInfo[],
  bounds: Bounds[],
  paddingSamples: number,
): Clip {
  const first = infos.findIndex((f) => f.isSpeech);
  if (first === -1) return { data: concatSamples(chunks), durationMs: 0, speechProbability: 0 };

  let last = infos.length - 1;
  while (!infos[last].isSpeech) last--;

  let spanMs = 0;
  let speechMs = 0;
  for (let i = first; i <= last; i++) {
    spanMs += infos[i].durationMs;
    if (infos[i].isSpeech) speechMs += infos[i].durationMs;
  }

  // Trim to the speech span (plus a little air on both sides) so Whisper sees
  // the command itself, not the surrounding seconds of silence/noise.
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const start = Math.max(0, bounds[first].start - paddingSamples);
  const end = Math.min(total, bounds[last].end + paddingSamples);
  const data = concatSamples(chunks).subarray(start, end);

  return { data, durationMs: spanMs, speechProbability: speechMs / spanMs };
}
