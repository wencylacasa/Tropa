import type { FrameHub, FrameListener } from '@/core/audio/hub';
import { EnergyFallbackDetector } from '@/core/detector/energyFallback';

const FRAME_MS = 20;

function makeHub() {
  const listeners = new Set<FrameListener>();
  const hub: FrameHub = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPreRoll: () => ({ samples: new Float32Array(0), frames: [] }),
    clearPreRoll: () => {},
    start: async () => {},
    stop: async () => {},
  };
  function emit(isSpeech: boolean, frames = 1) {
    for (let i = 0; i < frames; i++) {
      for (const l of Array.from(listeners)) {
        l({ samples: new Float32Array(320), isSpeech, durationMs: FRAME_MS });
      }
    }
  }
  return { hub, emit, listenerCount: () => listeners.size };
}

describe('EnergyFallbackDetector', () => {
  it('fires once speech lasts long enough, and only once per phrase', async () => {
    const { hub, emit } = makeHub();
    const onTrigger = jest.fn();
    await new EnergyFallbackDetector(hub, { minSpeechMs: 100 }).start(onTrigger);

    emit(true, 4); // 80 ms: too short
    expect(onTrigger).not.toHaveBeenCalled();

    emit(true, 1); // 100 ms
    expect(onTrigger).toHaveBeenCalledTimes(1);

    emit(true, 50); // still talking
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('ignores short bursts that are followed by silence', async () => {
    const { hub, emit } = makeHub();
    const onTrigger = jest.fn();
    await new EnergyFallbackDetector(hub, { minSpeechMs: 100 }).start(onTrigger);

    for (let i = 0; i < 10; i++) {
      emit(true, 3); // 60 ms click
      emit(false, 3);
    }
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('stays quiet during the cooldown, then fires again', async () => {
    const { hub, emit } = makeHub();
    const onTrigger = jest.fn();
    await new EnergyFallbackDetector(hub, { minSpeechMs: 100, cooldownMs: 1000 }).start(onTrigger);

    emit(true, 5);
    expect(onTrigger).toHaveBeenCalledTimes(1);

    emit(false, 10);
    emit(true, 10); // inside the 1 s cooldown
    expect(onTrigger).toHaveBeenCalledTimes(1);

    emit(false, 50); // cooldown over
    emit(true, 5);
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });

  it('does not fire while paused, and forgets old audio on resume', async () => {
    const { hub, emit } = makeHub();
    const onTrigger = jest.fn();
    const detector = new EnergyFallbackDetector(hub, { minSpeechMs: 100, cooldownMs: 0 });
    await detector.start(onTrigger);

    emit(true, 3); // 60 ms of speech before the pause
    await detector.pause();
    emit(true, 20);
    expect(onTrigger).not.toHaveBeenCalled();

    await detector.resume();
    emit(false, 30); // 600 ms quiet gap: re-arms the detector
    emit(true, 2); // 40 ms: the 60 ms from before must not count
    expect(onTrigger).not.toHaveBeenCalled();

    emit(true, 3);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('does not retrigger on noise that was already running at resume', async () => {
    const { hub, emit } = makeHub();
    const onTrigger = jest.fn();
    const detector = new EnergyFallbackDetector(hub, { minSpeechMs: 100, cooldownMs: 0 });
    await detector.start(onTrigger);

    emit(true, 5); // fires once
    expect(onTrigger).toHaveBeenCalledTimes(1);

    // Simulate the pipeline running: pause, then resume while the "noise"
    // (music, engine, our own reply) is still going.
    await detector.pause();
    await detector.resume();
    emit(true, 200); // continuous sound: must NOT fire again
    expect(onTrigger).toHaveBeenCalledTimes(1);

    // The noise stops; after a quiet gap the next phrase fires normally.
    emit(false, 30);
    emit(true, 5);
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes on stop and ignores a second start', async () => {
    const { hub, emit, listenerCount } = makeHub();
    const onTrigger = jest.fn();
    const detector = new EnergyFallbackDetector(hub, { minSpeechMs: 100 });

    await detector.start(onTrigger);
    await detector.start(onTrigger);
    expect(listenerCount()).toBe(1);

    await detector.stop();
    expect(listenerCount()).toBe(0);
    emit(true, 20);
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
