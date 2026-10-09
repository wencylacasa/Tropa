type Listener = (event: any) => void;

const mockListeners = new Map<string, Set<Listener>>();
const mockNative = {
  startMic: jest.fn(),
  stopMic: jest.fn(),
  beep: jest.fn(async () => {}),
  addListener: jest.fn((name: string, listener: Listener) => {
    if (!mockListeners.has(name)) mockListeners.set(name, new Set());
    mockListeners.get(name)!.add(listener);
    return { remove: () => mockListeners.get(name)!.delete(listener) };
  }),
};

jest.mock('../modules/tropa-native/src', () => ({
  __esModule: true,
  get default() {
    return mockNative;
  },
  requireTropaNative: () => mockNative,
}));

import { createNativeMicSource, MIC_CHUNK_SAMPLES, nativeBeep } from '@/core/system/nativeAudio';

function emit(name: string, event: unknown) {
  for (const listener of Array.from(mockListeners.get(name) ?? [])) listener(event);
}

describe('createNativeMicSource', () => {
  beforeEach(() => {
    mockListeners.clear();
    jest.clearAllMocks();
  });

  it('starts the native mic with 100 ms chunks', async () => {
    await createNativeMicSource().start();
    expect(MIC_CHUNK_SAMPLES).toBe(1600);
    expect(mockNative.startMic).toHaveBeenCalledWith(1600);
  });

  it('decodes base64 PCM16 into float samples for every subscriber', async () => {
    const source = createNativeMicSource();
    const got: Float32Array[] = [];
    source.onSamples((s) => got.push(s));
    await source.start();

    // int16 LE: 0x4000 = 16384 -> 0.5, 0xC000 = -16384 -> -0.5
    emit('onAudioData', { data: 'AEAAwA==' });
    expect(got).toHaveLength(1);
    expect(Array.from(got[0])).toEqual([0.5, -0.5]);
  });

  it('forwards mic errors and removes listeners on stop', async () => {
    const onError = jest.fn();
    const source = createNativeMicSource(1600, onError);
    const got: Float32Array[] = [];
    source.onSamples((s) => got.push(s));
    await source.start();

    emit('onMicError', { message: 'Microphone read failed (-3)' });
    expect(onError).toHaveBeenCalledWith('Microphone read failed (-3)');

    await source.stop();
    expect(mockNative.stopMic).toHaveBeenCalled();
    emit('onAudioData', { data: 'AEAAwA==' });
    expect(got).toHaveLength(0);
  });

  it('does not double-subscribe on repeated start', async () => {
    const source = createNativeMicSource();
    await source.start();
    await source.start();
    expect(mockListeners.get('onAudioData')!.size).toBe(1);
  });
});

describe('nativeBeep', () => {
  it('never throws', async () => {
    mockNative.beep.mockRejectedValueOnce(new Error('no audio'));
    await expect(nativeBeep.beep()).resolves.toBeUndefined();
  });
});
