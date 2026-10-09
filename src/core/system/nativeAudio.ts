import TropaNative, { requireTropaNative } from '../../../modules/tropa-native/src';
import type { RawAudioSource } from '../audio/hub';
import { base64ToBytes, pcm16BytesToFloat32, SAMPLE_RATE } from '../audio/pcm';
import type { Feedback } from '../pipeline/states';

/** 100 ms per chunk: small enough for the VAD, few enough events for the JS thread. */
export const MIC_CHUNK_SAMPLES = SAMPLE_RATE / 10;

/** The phone microphone through the local native module (16 kHz mono PCM16). */
export function createNativeMicSource(
  chunkSamples = MIC_CHUNK_SAMPLES,
  onError?: (message: string) => void,
): RawAudioSource {
  const callbacks = new Set<(samples: Float32Array) => void>();
  let subscriptions: { remove(): void }[] = [];

  return {
    async start() {
      const native = requireTropaNative();
      if (subscriptions.length === 0) {
        subscriptions = [
          native.addListener('onAudioData', ({ data }) => {
            const samples = pcm16BytesToFloat32(base64ToBytes(data));
            for (const cb of Array.from(callbacks)) cb(samples);
          }),
          native.addListener('onMicError', ({ message }) => onError?.(message)),
        ];
      }
      native.startMic(chunkSamples);
    },
    async stop() {
      for (const sub of subscriptions) sub.remove();
      subscriptions = [];
      TropaNative?.stopMic();
    },
    onSamples(callback) {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
  };
}

/** Soft beep after a possible trigger. A missing module or failure is silent. */
export const nativeBeep: Feedback = {
  async beep() {
    try {
      await TropaNative?.beep(150);
    } catch {
      // A missing beep must never break the pipeline.
    }
  },
};

export type ForegroundService = { start(): void; stop(): void };

/** Persistent notification that keeps the mic alive with the screen off. */
export const foregroundService: ForegroundService = {
  start() {
    requireTropaNative().startForegroundService();
  },
  stop() {
    try {
      TropaNative?.stopForegroundService();
    } catch {
      // Already stopped.
    }
  },
};

/** "Stop mic" tapped in the notification. Returns an unsubscribe function. */
export function onNotificationStop(callback: () => void): () => void {
  const sub = TropaNative?.addListener('onStopRequested', callback);
  return () => sub?.remove();
}
