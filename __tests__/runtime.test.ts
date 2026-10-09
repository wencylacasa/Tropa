import { AssistantRuntime, type BuiltPorts, type RuntimeDeps } from '@/core/app/runtime';
import { StatusStore } from '@/core/app/status';
import type { FrameHub } from '@/core/audio/hub';
import type { Clip } from '@/core/pipeline/states';
import type { Settings } from '@/core/settings/settings';
import { SettingsStore } from '@/core/settings/store';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function memoryStore(): SettingsStore {
  let text: string | null = null;
  const store = new SettingsStore({ read: () => text, write: (t) => void (text = t) });
  store.load();
  return store;
}

function fakeHub(): FrameHub & { start: jest.Mock; stop: jest.Mock } {
  return {
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    subscribe: () => () => {},
    getPreRoll: () => ({ samples: new Float32Array(0), frames: [] }),
    clearPreRoll: () => {},
  };
}

const SHORT_CLIP: Clip = { data: new Float32Array(0), durationMs: 0, speechProbability: 0 };

function setup(overrides: { record?: () => Promise<Clip>; hubStartError?: Error } = {}) {
  const settings = memoryStore();
  const status = new StatusStore();
  const hubs: ReturnType<typeof fakeHub>[] = [];
  const triggers: (() => void)[] = [];
  const release = jest.fn(async () => {});
  const detectorStop = jest.fn(async () => {});

  const createPorts = jest.fn(
    (_hub: FrameHub, _settings: Settings): BuiltPorts => ({
      release,
      detector: {
        start: async (onTrigger) => void triggers.push(onTrigger),
        stop: detectorStop,
        pause: async () => {},
        resume: async () => {},
      },
      recorder: { record: overrides.record ?? (async () => SHORT_CLIP) },
      stt: { transcribe: async () => ({ text: '', confidence: 1 }) },
      tts: { speak: async () => {} },
      feedback: { beep: async () => {} },
      now: () => new Date(2026, 9, 9, 16, 45),
      getBatteryLevel: async () => 50,
    }),
  );

  const deps: RuntimeDeps = {
    createHub: () => {
      const hub = fakeHub();
      if (overrides.hubStartError) hub.start.mockRejectedValue(overrides.hubStartError);
      hubs.push(hub);
      return hub;
    },
    createPorts,
    foreground: { start: jest.fn(), stop: jest.fn() },
    location: { start: jest.fn(async () => {}), stop: jest.fn() },
    log: jest.fn(),
  };

  const runtime = new AssistantRuntime(settings, status, deps);
  return { runtime, settings, status, hubs, triggers, deps, createPorts, release, detectorStop };
}

describe('AssistantRuntime', () => {
  it('starts the foreground service, mic hub and detector', async () => {
    const { runtime, status, hubs, triggers, deps } = setup();
    await runtime.start();

    expect(runtime.isRunning()).toBe(true);
    expect(deps.foreground!.start).toHaveBeenCalledTimes(1);
    expect(hubs[0].start).toHaveBeenCalledTimes(1);
    expect(triggers).toHaveLength(1);
    expect(deps.location!.start).toHaveBeenCalled();
    expect(status.get().listening).toBe(true);
    expect(status.get().error).toBeNull();
  });

  it('start twice is a no-op', async () => {
    const { runtime, createPorts } = setup();
    await runtime.start();
    await runtime.start();
    expect(createPorts).toHaveBeenCalledTimes(1);
  });

  it('reports a start failure in status and cleans up', async () => {
    const { runtime, status, deps } = setup({ hubStartError: new Error('RECORD_AUDIO permission is not granted') });
    await runtime.start();

    expect(runtime.isRunning()).toBe(false);
    expect(status.get().listening).toBe(false);
    expect(status.get().error).toBe('RECORD_AUDIO permission is not granted');
    expect(deps.foreground!.stop).toHaveBeenCalled();
  });

  it('mute turns the mic off completely and unmute starts it again', async () => {
    const { runtime, status, hubs, deps, release, detectorStop } = setup();
    await runtime.start();

    await runtime.setMuted(true);
    expect(status.get().muted).toBe(true);
    expect(status.get().listening).toBe(false);
    expect(detectorStop).toHaveBeenCalled();
    expect(hubs[0].stop).toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
    expect(deps.foreground!.stop).toHaveBeenCalled();
    expect(deps.location!.stop).toHaveBeenCalled();

    await runtime.setMuted(false);
    expect(status.get().muted).toBe(false);
    expect(status.get().listening).toBe(true);
    expect(hubs).toHaveLength(2);
  });

  it('does not start while muted', async () => {
    const { runtime, createPorts } = setup();
    await runtime.setMuted(true);
    await runtime.start();
    expect(createPorts).not.toHaveBeenCalled();
  });

  it('notification stop mutes', async () => {
    const { runtime, status } = setup();
    await runtime.start();
    await runtime.handleExternalStop();
    expect(status.get().muted).toBe(true);
    expect(runtime.isRunning()).toBe(false);
  });

  it('runs a trigger through the orchestrator and records the outcome', async () => {
    const { runtime, status, triggers, deps } = setup();
    await runtime.start();

    triggers[0]();
    await flush();

    expect(status.get().lastAction).toBe('Ignored (too short)');
    expect(status.get().pipeline).toBe('idle');
    expect(deps.log).not.toHaveBeenCalled(); // logging is off by default
  });

  it('logs outcomes only when logging is on', async () => {
    const { runtime, settings, triggers, deps } = setup();
    settings.update({ logging: true });
    await runtime.start();

    triggers[0]();
    await flush();

    expect(deps.log).toHaveBeenCalledWith({ result: 'discarded_short' }, expect.any(Number));
  });

  it('restarts when a pipeline setting changes, not for live-read settings', async () => {
    const { runtime, settings, createPorts } = setup();
    await runtime.start();

    settings.update({ emergencyContacts: [{ name: 'Ben', phone: '0917 123 4567' }], logging: true });
    await flush();
    expect(createPorts).toHaveBeenCalledTimes(1);

    settings.update({ whisperModel: 'base' });
    await flush();
    expect(createPorts).toHaveBeenCalledTimes(2);
    expect(createPorts.mock.calls[1][1].whisperModel).toBe('base');
    expect(runtime.isRunning()).toBe(true);
  });

  it('stopping waits for a trigger in progress before closing the mic', async () => {
    let finishRecording: (clip: Clip) => void = () => {};
    const { runtime, hubs, triggers } = setup({
      record: () => new Promise<Clip>((resolve) => (finishRecording = resolve)),
    });
    await runtime.start();
    triggers[0]();
    await flush();

    const stopping = runtime.setMuted(true);
    await flush();
    expect(hubs[0].stop).not.toHaveBeenCalled();

    finishRecording(SHORT_CLIP);
    await stopping;
    expect(hubs[0].stop).toHaveBeenCalled();
  });

  it('defers a settings restart until the trigger in progress is done', async () => {
    let finishRecording: (clip: Clip) => void = () => {};
    const { runtime, settings, triggers, createPorts } = setup({
      record: () => new Promise<Clip>((resolve) => (finishRecording = resolve)),
    });
    await runtime.start();
    triggers[0]();
    await flush();

    settings.update({ llmEnabled: false });
    await flush();
    expect(createPorts).toHaveBeenCalledTimes(1);

    finishRecording(SHORT_CLIP);
    await flush();
    await flush();
    expect(createPorts).toHaveBeenCalledTimes(2);
  });

  it('ignores a second trigger while one is running', async () => {
    let finishRecording: (clip: Clip) => void = () => {};
    const record = jest.fn(() => new Promise<Clip>((resolve) => (finishRecording = resolve)));
    const { runtime, triggers } = setup({ record });
    await runtime.start();

    triggers[0]();
    triggers[0]();
    await flush();
    expect(record).toHaveBeenCalledTimes(1);
    finishRecording(SHORT_CLIP);
    await flush();
  });
});
