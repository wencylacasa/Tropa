import { runHandler } from '../intents/handlers';
import { matchRules } from '../intents/rules';
import type { ParsedCommand } from '../intents/types';
import { verifyWakeWord } from '../wake/verify';
import { DEFAULT_WAKE_WORDS, type WakeWord } from '../wake/wakeWords';
import type { Clip, PipelinePorts, PipelineState, TriggerOutcome } from './states';

export type OrchestratorConfig = {
  wakeWords: WakeWord[];
  /** Clips shorter than this are ignored. */
  minClipMs: number;
  /** Clips with lower VAD speech probability are ignored. */
  minSpeechProbability: number;
  /** Below this (after a wake word matched) we ask the rider to repeat. */
  minConfidence: number;
  /** When false, only keyword rules run ("fast mode"). */
  llmEnabled: boolean;
};

export const DEFAULT_CONFIG: OrchestratorConfig = {
  wakeWords: DEFAULT_WAKE_WORDS,
  minClipMs: 500,
  minSpeechProbability: 0.4,
  minConfidence: 0.5,
  llmEnabled: true,
};

export type OrchestratorHooks = {
  onStateChange?: (state: PipelineState) => void;
  onOutcome?: (outcome: TriggerOutcome, timingMs: number) => void;
};

export const REPLY_EMPTY_COMMAND = 'Yes?';
export const REPLY_REPEAT = 'Please say that again';
export const REPLY_NOT_UNDERSTOOD = "Sorry, I didn't understand";

/**
 * Runs one trigger end to end:
 * beep > record > STT > verify wake word > intent (rules, then LLM) > act > speak.
 * The detector is paused for the whole run and always resumed, even on error.
 */
export class Orchestrator {
  private state: PipelineState = 'idle';
  private busy = false;
  private lastReply: string | null = null;

  constructor(
    private readonly ports: PipelinePorts,
    private readonly config: OrchestratorConfig = DEFAULT_CONFIG,
    private readonly hooks: OrchestratorHooks = {},
  ) {}

  getState(): PipelineState {
    return this.state;
  }

  async handleTrigger(): Promise<TriggerOutcome> {
    if (this.busy) return { result: 'ignored_busy' };
    this.busy = true;
    const startedAt = Date.now();

    let outcome: TriggerOutcome;
    try {
      await this.ports.detector.pause();
      outcome = await this.run();
    } catch (error) {
      outcome = { result: 'error', message: error instanceof Error ? error.message : String(error) };
    } finally {
      this.setState('idle');
      try {
        await this.ports.detector.resume();
      } catch {
        // Nothing useful to do; the Home screen shows detector status.
      }
      this.busy = false;
    }

    this.hooks.onOutcome?.(outcome, Date.now() - startedAt);
    return outcome;
  }

  private async run(): Promise<TriggerOutcome> {
    const { ports, config } = this;

    this.setState('triggered');
    await ports.feedback.beep();

    this.setState('recording');
    const clip = await ports.recorder.record();
    if (this.isTooShort(clip)) return { result: 'discarded_short' };

    this.setState('stt');
    const heard = await ports.stt.transcribe(clip);

    this.setState('verify');
    const verdict = verifyWakeWord(heard.text, config.wakeWords);
    // No wake word: discard silently (no beep, no reply).
    if (!verdict.matched) return { result: 'discarded_no_wake', transcript: heard.text };

    let command = verdict.command;
    let confidence = heard.confidence;

    if (verdict.isEmptyCommand) {
      await this.speak(REPLY_EMPTY_COMMAND);

      this.setState('recording');
      const second = await ports.recorder.record();
      if (this.isTooShort(second)) return { result: 'no_command' };

      this.setState('stt');
      const followUp = await ports.stt.transcribe(second);
      command = followUp.text.trim();
      confidence = followUp.confidence;
      if (command.length === 0) return { result: 'no_command' };
    }

    if (confidence < config.minConfidence) {
      await this.speak(REPLY_REPEAT);
      return { result: 'low_confidence', transcript: heard.text };
    }

    this.setState('intent');
    const parsed = await this.parse(command);

    this.setState('act');
    const reply = parsed
      ? await runHandler(parsed, {
          now: ports.now,
          getBatteryLevel: ports.getBatteryLevel,
          lastReply: this.lastReply,
        })
      : null;

    if (reply === null) {
      await this.speak(REPLY_NOT_UNDERSTOOD);
      return { result: 'not_understood', transcript: heard.text, command };
    }

    await this.speak(reply);
    if (parsed?.intent !== 'repeat_last') this.lastReply = reply;

    return {
      result: 'handled',
      transcript: heard.text,
      command,
      intent: parsed?.intent ?? 'unknown',
      reply,
    };
  }

  /** Rules first; the LLM only runs when no rule matches. Failures -> null. */
  private async parse(command: string): Promise<ParsedCommand | null> {
    const byRule = matchRules(command);
    if (byRule) return byRule;

    if (!this.config.llmEnabled || !this.ports.llm) return null;
    try {
      const byLlm = await this.ports.llm.parse(command);
      return byLlm.intent === 'unknown' ? null : byLlm;
    } catch {
      return null;
    }
  }

  private isTooShort(clip: Clip): boolean {
    return (
      clip.durationMs < this.config.minClipMs ||
      clip.speechProbability < this.config.minSpeechProbability
    );
  }

  private async speak(text: string): Promise<void> {
    this.setState('speak');
    await this.ports.tts.speak(text);
  }

  private setState(next: PipelineState): void {
    if (this.state === next) return;
    this.state = next;
    this.hooks.onStateChange?.(next);
  }
}
