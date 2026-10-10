import type { FrameHub } from '../audio/hub';
import { DEFAULT_CONFIG, Orchestrator } from '../pipeline/orchestrator';
import type { PipelinePorts, TriggerOutcome } from '../pipeline/states';
import type { Settings } from '../settings/settings';
import type { SettingsStore } from '../settings/store';
import { logEvent } from './appLog';
import type { StatusStore } from './status';

/** `release` frees resident models (keepModelLoaded) when the pipeline stops. */
export type BuiltPorts = PipelinePorts & { release?: () => Promise<void> };

export type RuntimeDeps = {
  /** The one microphone (+ VAD + pre-roll) everything listens to. */
  createHub: () => FrameHub;
  /** All pipeline ports for the current settings, built on every start. */
  createPorts: (hub: FrameHub, settings: Settings) => BuiltPorts;
  /** Persistent notification; optional so tests and Expo Go can run without it. */
  foreground?: { start(): void; stop(): void };
  /** Started with the mic so SOS has a recent fix. */
  location?: { start(): Promise<void>; stop(): void };
  /** Called for every outcome when Settings > logging is on. */
  log?: (outcome: TriggerOutcome, timingMs: number) => void;
};

type Running = {
  hub: FrameHub;
  ports: BuiltPorts;
  orchestrator: Orchestrator;
  /** Fingerprint of the settings the pipeline was built from. */
  builtFrom: string;
};

/** Settings baked into the ports/orchestrator. Others (contacts, logging) are read live. */
function pipelineFingerprint(s: Settings): string {
  return JSON.stringify([
    s.wakeWords,
    s.detector,
    s.detectorSensitivity,
    s.whisperModel,
    s.keepModelLoaded,
    s.llmEnabled,
    s.replyLanguage,
  ]);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the always-on assistant: mic hub > detector > orchestrator, plus the
 * foreground service. Start/stop/mute are serialised, and stopping waits for
 * an in-flight trigger to finish (the recorder needs mic frames to end).
 * Settings changes take effect by restarting once the pipeline is idle.
 */
export class AssistantRuntime {
  private running: Running | null = null;
  private inFlight: Promise<unknown> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private restartPending = false;
  private readonly unsubscribeSettings: () => void;

  constructor(
    private readonly settings: SettingsStore,
    private readonly status: StatusStore,
    private readonly deps: RuntimeDeps,
  ) {
    this.unsubscribeSettings = settings.subscribe(() => this.onSettingsChanged());
  }

  isRunning(): boolean {
    return this.running !== null;
  }

  /** Starts listening unless muted. Errors end up in status.error, never thrown. */
  start(): Promise<void> {
    return this.serial(async () => {
      if (this.running || this.status.get().muted) return;
      await this.startNow();
    });
  }

  stop(): Promise<void> {
    return this.serial(() => this.stopNow());
  }

  /** Muted = microphone completely off, not just ignoring triggers. */
  setMuted(muted: boolean): Promise<void> {
    this.status.setMuted(muted);
    return this.serial(async () => {
      if (muted) await this.stopNow();
      else if (!this.running) await this.startNow();
    });
  }

  /** The notification's "Stop mic" already turned the native mic off. */
  handleExternalStop(): Promise<void> {
    return this.setMuted(true);
  }

  /**
   * Typed command path (web preview, tests): skips mic + STT and runs the
   * intent > act > speak tail on the given text. Uses the running orchestrator
   * when the mic is up, otherwise builds a throwaway one (its hub never starts,
   * so the detector/recorder are inert).
   */
  submitText(text: string): Promise<void> {
    return this.serial(async () => {
      try {
        const orchestrator =
          this.running?.orchestrator ?? this.buildOrchestrator(this.deps.createHub()).orchestrator;
        await orchestrator.handleText(text);
      } catch (error) {
        this.status.setError(messageOf(error));
      }
    });
  }

  async dispose(): Promise<void> {
    this.unsubscribeSettings();
    await this.stop();
  }

  private serial(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  /** Ports + orchestrator for the current settings. The hub is not started here. */
  private buildOrchestrator(hub: FrameHub): { ports: BuiltPorts; orchestrator: Orchestrator } {
    const settings = this.settings.get();
    const ports = this.deps.createPorts(hub, settings);
    const orchestrator = new Orchestrator(
      ports,
      {
        ...DEFAULT_CONFIG,
        wakeWords: settings.wakeWords,
        llmEnabled: settings.llmEnabled,
        replyLanguage: settings.replyLanguage,
      },
      {
        onStateChange: (state) => this.status.setPipelineState(state),
        onOutcome: (outcome, ms) => this.onOutcome(outcome, ms),
      },
    );
    return { ports, orchestrator };
  }

  private async startNow(): Promise<void> {
    const settings = this.settings.get();
    this.status.setError(null);
    logEvent('runtime', 'starting mic + detector');

    let hub: FrameHub | null = null;
    try {
      this.deps.foreground?.start();
      hub = this.deps.createHub();
      const { ports, orchestrator } = this.buildOrchestrator(hub);

      await hub.start();
      await ports.detector.start(() => this.trigger());
      this.running = { hub, ports, orchestrator, builtFrom: pipelineFingerprint(settings) };
      this.status.setListening(true);
      logEvent('runtime', 'listening');
      void this.deps.location?.start();
    } catch (error) {
      try {
        await hub?.stop();
      } catch {
        // already failed
      }
      this.deps.foreground?.stop();
      this.status.setListening(false);
      this.status.setError(messageOf(error));
      logEvent('runtime', `start failed: ${messageOf(error)}`);
    }
  }

  private async stopNow(): Promise<void> {
    const running = this.running;
    if (!running) return;
    logEvent('runtime', 'stopping mic + detector');
    this.running = null;
    this.status.setListening(false);

    try {
      await running.ports.detector.stop();
      // Let a trigger in progress finish while frames still arrive.
      if (this.inFlight) await this.inFlight;
      await running.hub.stop();
      await running.ports.release?.();
    } catch (error) {
      this.status.setError(messageOf(error));
    } finally {
      this.deps.location?.stop();
      this.deps.foreground?.stop();
      this.status.setPipelineState('idle');
    }
  }

  private trigger(): void {
    const running = this.running;
    if (!running || this.inFlight) return;
    const run = running.orchestrator.handleTrigger().finally(() => {
      this.inFlight = null;
      if (this.restartPending) void this.restart();
    });
    this.inFlight = run;
  }

  private onOutcome(outcome: TriggerOutcome, timingMs: number): void {
    this.status.recordOutcome(outcome, timingMs);
    if (this.settings.get().logging) this.deps.log?.(outcome, timingMs);
  }

  private onSettingsChanged(): void {
    if (!this.running || this.running.builtFrom === pipelineFingerprint(this.settings.get())) return;
    if (this.inFlight) {
      this.restartPending = true;
      return;
    }
    void this.restart();
  }

  private restart(): Promise<void> {
    this.restartPending = false;
    return this.serial(async () => {
      if (!this.running) return;
      await this.stopNow();
      if (!this.status.get().muted) await this.startNow();
    });
  }
}
