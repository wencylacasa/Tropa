import type { FrameHub, FrameListener } from '@/core/audio/hub';
import type { PreRollSnapshot } from '@/core/audio/preRollBuffer';
import { VadClipRecorder } from '@/core/audio/recorder';

const FRAME_SAMPLES = 320; // 20 ms at 16 kHz
const FRAME_MS = 20;

function frameSamples(): Float32Array {
  return new Float32Array(FRAME_SAMPLES).fill(0.1);
}

/** Pre-roll made of `count` frames, each flagged speech or not. */
function preRoll(count: number, isSpeech: boolean): PreRollSnapshot {
  const chunks = Array.from({ length: count }, frameSamples);
  const samples = new Float32Array(count * FRAME_SAMPLES);
  chunks.forEach((c, i) => samples.set(c, i * FRAME_SAMPLES));
  return { samples, frames: chunks.map(() => ({ durationMs: FRAME_MS, isSpeech })) };
}

function makeHub(pre: PreRollSnapshot = { samples: new Float32Array(0), frames: [] }) {
  const listeners = new Set<FrameListener>();
  const hub: FrameHub = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPreRoll: jest.fn(() => pre),
    clearPreRoll: jest.fn(),
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
  };

  function emit(isSpeech: boolean, frames = 1) {
    for (let i = 0; i < frames; i++) {
      for (const listener of Array.from(listeners)) {
        listener({ samples: frameSamples(), isSpeech, durationMs: FRAME_MS });
      }
    }
  }

  return { hub, emit, listenerCount: () => listeners.size };
}

describe('VadClipRecorder', () => {
  it('stops after 1 s of silence following speech', async () => {
    const { hub, emit, listenerCount } = makeHub();
    const pending = new VadClipRecorder(hub).record({ includePreRoll: false });

    emit(true, 50); // 1 s of speech
    emit(false, 50); // 1 s of silence

    const clip = await pending;
    expect(clip.durationMs).toBe(1000);
    expect(clip.speechProbability).toBe(1);
    expect(listenerCount()).toBe(0);
  });

  it('includes the pre-roll by default', async () => {
    const { hub, emit } = makeHub(preRoll(10, true));
    const pending = new VadClipRecorder(hub).record();

    emit(false, 50);

    const clip = await pending;
    expect(hub.getPreRoll).toHaveBeenCalledTimes(1);
    // Data is trimmed to the speech span plus padding: 10 speech frames from
    // the pre-roll, then at most 300 ms (15 frames) of trailing silence.
    expect((clip.data as Float32Array).length).toBe((10 + 15) * FRAME_SAMPLES);
    expect(clip.durationMs).toBe(10 * FRAME_MS);
  });

  it('skips the pre-roll when includePreRoll is false (follow-up after "Yes?")', async () => {
    // The pre-roll holds our own voice; it must not end up in the clip.
    const { hub, emit } = makeHub(preRoll(10, true));
    const pending = new VadClipRecorder(hub).record({ includePreRoll: false });

    emit(true, 25);
    emit(false, 50);

    const clip = await pending;
    expect(hub.getPreRoll).not.toHaveBeenCalled();
    // 25 speech frames + up to 15 frames (300 ms) of trailing padding.
    expect((clip.data as Float32Array).length).toBe((25 + 15) * FRAME_SAMPLES);
    expect(clip.durationMs).toBe(25 * FRAME_MS);
  });

  it('trims silence before and after the speech span', async () => {
    const { hub, emit } = makeHub(preRoll(30, false)); // 600 ms of quiet pre-roll
    const pending = new VadClipRecorder(hub).record();

    emit(true, 10); // 200 ms of speech
    emit(false, 50); // 1 s of silence ends the recording

    const clip = await pending;
    // 300 ms padding + 200 ms speech + 300 ms padding = 40 frames.
    expect((clip.data as Float32Array).length).toBe(40 * FRAME_SAMPLES);
    expect(clip.durationMs).toBe(200);
  });

  it('resolves via the watchdog even when frames stop arriving', async () => {
    jest.useFakeTimers();
    try {
      const { hub, emit, listenerCount } = makeHub();
      const pending = new VadClipRecorder(hub, { maxMs: 2000 }).record({ includePreRoll: false });

      emit(true, 5); // a little speech, then the mic "dies" (no more frames)
      jest.advanceTimersByTime(5000); // past maxMs + watchdog slack

      const clip = await pending;
      expect(clip.durationMs).toBe(5 * FRAME_MS);
      expect(listenerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up with an empty clip when nobody speaks', async () => {
    const { hub, emit } = makeHub();
    const pending = new VadClipRecorder(hub, { noSpeechTimeoutMs: 1000 }).record({ includePreRoll: false });

    emit(false, 50); // 1 s of nothing

    expect(await pending).toMatchObject({ durationMs: 0, speechProbability: 0 });
  });

  it('caps the recording at maxMs even if speech never stops', async () => {
    const { hub, emit, listenerCount } = makeHub();
    const pending = new VadClipRecorder(hub, { maxMs: 2000 }).record({ includePreRoll: false });

    emit(true, 100); // 2 s of continuous speech

    const clip = await pending;
    expect(clip.durationMs).toBe(2000);
    expect(listenerCount()).toBe(0);
  });
});
