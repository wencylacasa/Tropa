import { logEvent } from '../app/appLog';
import { runHandler } from '../intents/handlers';
import { matchRules } from '../intents/rules';
import type { ParsedCommand } from '../intents/types';
import { parseYesNo, type YesNo } from '../intents/yesNo';
import type { ReplyLanguage } from '../settings/settings';
import { runCallFlow } from '../system/callFlow';
import type { Contact } from '../system/contactMatch';
import { runSosFlow } from '../system/sosFlow';
import { verifyWakeWord } from '../wake/verify';
import { DEFAULT_WAKE_WORDS, type WakeWord } from '../wake/wakeWords';
import type { Clip, PipelinePorts, PipelineState, TriggerOutcome } from './states';

export type OrchestratorConfig = {
  wakeWords: WakeWord[];
  /** Speech shorter than this is ignored (noise bursts, clicks). */
  minClipMs: number;
  /** Clips with lower VAD speech probability are ignored. */
  minSpeechProbability: number;
  /** Below this (after a wake word matched) we ask the rider to repeat. */
  minConfidence: number;
  /** When false, only keyword rules run ("fast mode"). */
  llmEnabled: boolean;
  /** Give up on a single Whisper transcription after this. */
  sttTimeoutMs: number;
  /** Give up on a single LLM parse after this. */
  llmTimeoutMs: number;
  /** Spoken reply language: English or Tagalog. */
  replyLanguage: ReplyLanguage;
};

export const DEFAULT_CONFIG: OrchestratorConfig = {
  wakeWords: DEFAULT_WAKE_WORDS,
  minClipMs: 300,
  minSpeechProbability: 0.4,
  minConfidence: 0.5,
  llmEnabled: true,
  sttTimeoutMs: 30_000,
  llmTimeoutMs: 45_000,
  replyLanguage: 'en',
};

export type OrchestratorHooks = {
  onStateChange?: (state: PipelineState) => void;
  onOutcome?: (outcome: TriggerOutcome, timingMs: number) => void;
};

export const REPLY_EMPTY_COMMAND = 'Yes?';
export const REPLY_REPEAT = 'Please say that again';
export const REPLY_NOT_UNDERSTOOD = "Sorry, I didn't understand";
export const REPLY_CALL_FAILED = "Sorry, I couldn't place the call";
export const REPLY_SOS_NO_CONTACTS = 'You have no emergency contacts set up.';

/** Spoken strings in both reply languages; picked by config.replyLanguage. */
const REPLIES = {
  en: {
    emptyCommand: REPLY_EMPTY_COMMAND,
    repeat: REPLY_REPEAT,
    notUnderstood: REPLY_NOT_UNDERSTOOD,
    callFailed: REPLY_CALL_FAILED,
    sosNoContacts: REPLY_SOS_NO_CONTACTS,
  },
  tl: {
    emptyCommand: 'Oo? Ano iyon?',
    repeat: 'Pakisabi ulit',
    notUnderstood: 'Pasensya, hindi ko naintindihan',
    callFailed: 'Pasensya, hindi ako makatawag',
    sosNoContacts: 'Wala kang naka-set na emergency contacts.',
  },
} as const;

/**
 * Runs one trigger end to end:
 * beep > record > STT > verify wake word > intent (rules, then LLM) > act > speak.
 * The detector is paused for the whole run and always resumed, even on error.
 */
export class Orchestrator {
  private state: PipelineState = 'idle';
  private busy = false;
  private lastReply: string | null = null;
  /** Last command + spoken reply, handed to chat so follow-ups have context. */
  private lastExchange: { command: string; reply: string } | null = null;

  constructor(
    private readonly ports: PipelinePorts,
    private readonly config: OrchestratorConfig = DEFAULT_CONFIG,
    private readonly hooks: OrchestratorHooks = {},
  ) {}

  getState(): PipelineState {
    return this.state;
  }

  private get strings() {
    return REPLIES[this.config.replyLanguage] ?? REPLIES.en;
  }

  async handleTrigger(): Promise<TriggerOutcome> {
    return this.guarded(() => this.run());
  }

  /**
   * Typed command (web preview, tests): skips beep/record/STT and runs
   * verify > intent > act > speak on the given text. No empty-command
   * follow-up: there is no mic to answer "Yes?".
   */
  async handleText(text: string): Promise<TriggerOutcome> {
    logEvent('input', `typed: "${text.trim()}"`);
    return this.guarded(async () => {
      const transcript = text.trim();
      return transcript
        ? this.respond(transcript, 1)
        : ({ result: 'no_command' } satisfies TriggerOutcome);
    });
  }

  private async guarded(run: () => Promise<TriggerOutcome>): Promise<TriggerOutcome> {
    if (this.busy) return { result: 'ignored_busy' };
    this.busy = true;
    const startedAt = Date.now();

    let outcome: TriggerOutcome;
    try {
      this.ports.audioFocus?.request();
      await this.ports.detector.pause();
      outcome = await run();
    } catch (error) {
      outcome = { result: 'error', message: error instanceof Error ? error.message : String(error) };
    } finally {
      this.setState('idle');
      try {
        await this.ports.detector.resume();
      } catch {
        // Nothing useful to do; the Home screen shows detector status.
      }
      this.ports.audioFocus?.abandon();
      this.busy = false;
    }

    this.hooks.onOutcome?.(outcome, Date.now() - startedAt);
    logEvent('pipeline', `outcome: ${outcome.result} (${Date.now() - startedAt}ms)`);
    return outcome;
  }

  private async run(): Promise<TriggerOutcome> {
    const { ports, config } = this;

    this.setState('triggered');
    logEvent('mic', 'trigger detected');
    await ports.feedback.beep();

    this.setState('recording');
    const recStart = Date.now();
    const clip = await ports.recorder.record({ includePreRoll: true });
    logEvent('mic', `clip ${Math.round(clip.durationMs)}ms (${Date.now() - recStart}ms wall)`);
    if (this.isTooShort(clip)) return { result: 'discarded_short' };

    this.setState('stt');
    const sttStart = Date.now();
    const heard = await this.withTimeout(
      ports.stt.transcribe(clip),
      config.sttTimeoutMs,
      'Transcription timed out',
    );
    logEvent('stt', `"${heard.text.trim()}" (${heard.confidence.toFixed(2)}, ${Date.now() - sttStart}ms)`);

    return this.respond(heard.text, heard.confidence, async () => {
      this.setState('recording');
      const second = await ports.recorder.record({ includePreRoll: false });
      if (this.isTooShort(second)) return null;

      this.setState('stt');
      const followUp = await this.withTimeout(
        ports.stt.transcribe(second),
        config.sttTimeoutMs,
        'Transcription timed out',
      );
      const text = followUp.text.trim();
      return text ? { text, confidence: followUp.confidence } : null;
    });
  }

  /**
   * Verify wake word > intent > act > speak, starting from a transcript.
   * `askAgain` supplies the spoken follow-up for a bare wake word; without it
   * (typed input) the run ends after the "Yes?" prompt.
   */
  private async respond(
    transcript: string,
    confidence: number,
    askAgain?: () => Promise<{ text: string; confidence: number } | null>,
  ): Promise<TriggerOutcome> {
    const { ports, config } = this;

    this.setState('verify');
    const verdict = verifyWakeWord(transcript, config.wakeWords);
    // No wake word: discard silently (no beep, no reply).
    if (!verdict.matched) {
      logEvent('verify', 'no wake word — discarded');
      return { result: 'discarded_no_wake', transcript };
    }
    logEvent('verify', `wake word ok, command: "${verdict.command}"`);

    let command = verdict.command;

    if (verdict.isEmptyCommand) {
      await this.speak(this.strings.emptyCommand);
      const followUp = askAgain ? await askAgain() : null;
      if (!followUp) return { result: 'no_command' };
      command = followUp.text;
      confidence = followUp.confidence;
    }

    if (confidence < config.minConfidence) {
      await this.speak(this.strings.repeat);
      return { result: 'low_confidence', transcript, reply: this.strings.repeat };
    }

    this.setState('intent');
    const parsed = await this.parse(command);
    logEvent('intent', parsed ? `${parsed.intent}${parsed.target ? ` → ${parsed.target}` : ''} (${parsed.source})` : 'no match');

    this.setState('act');
    let reply: string | null = null;
    let dial: Contact | null = null;
    if (parsed?.intent === 'call_contact') {
      const call = await this.runCall(parsed.target);
      reply = call?.reply ?? null;
      dial = call?.dial ?? null;
    } else if (parsed?.intent === 'sos_alert') {
      const sos = await this.runSos();
      reply = sos?.reply ?? null;
    } else if (parsed) {
      reply = await runHandler(parsed, {
        now: ports.now,
        getBatteryLevel: ports.getBatteryLevel,
        lastReply: this.lastReply,
        media: ports.media,
        replyLanguage: config.replyLanguage,
        describeLocation: ports.describeLocation,
      });
    }

    if (reply === null) {
      // Freeform LLM answer first, so unmatched commands stay conversational.
      const chat = await this.tryChat(command);
      if (chat) {
        await this.speak(chat);
        this.lastReply = chat;
        this.lastExchange = { command, reply: chat };
        return { result: 'handled', transcript, command, intent: 'chat', reply: chat };
      }
      await this.speak(this.strings.notUnderstood);
      return { result: 'not_understood', transcript, command, reply: this.strings.notUnderstood };
    }

    await this.speak(reply);
    if (parsed?.intent !== 'repeat_last') {
      this.lastReply = reply;
      this.lastExchange = { command, reply };
    }

    // Dial only after the reply has been spoken (the call UI would cut it off),
    // and only when the call flow produced a contact after an explicit yes.
    if (dial && ports.dialer) {
      try {
        await ports.dialer.dial(dial);
      } catch {
        await this.speak(this.strings.callFailed);
      }
    }

    return {
      result: 'handled',
      transcript,
      command,
      intent: parsed?.intent ?? 'unknown',
      reply,
    };
  }

  /**
   * Last resort: the LLM answers the command freely instead of us saying
   * "not understood". Only when the model is enabled and provides chat;
   * a timeout or empty reply quietly falls back to not_understood.
   */
  private async tryChat(command: string): Promise<string | null> {
    const chat = this.ports.llm?.chat;
    if (!this.config.llmEnabled || !chat) return null;
    try {
      const started = Date.now();
      const reply = (
        await this.withTimeout(
          chat(command, this.lastExchange),
          this.config.llmTimeoutMs,
          'LLM chat timed out',
        )
      ).trim();
      logEvent('qwen', `chat: "${reply}" (${Date.now() - started}ms)`);
      return reply || null;
    } catch (error) {
      logEvent('qwen', `chat failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /** Rules first; the LLM only runs when no rule matches. Failures -> null. */
  private async parse(command: string): Promise<ParsedCommand | null> {
    const byRule = matchRules(command);
    if (byRule) return byRule;

    if (!this.config.llmEnabled || !this.ports.llm) return null;
    try {
      logEvent('qwen', `parse: "${command}"`);
      const started = Date.now();
      const byLlm = await this.withTimeout(
        this.ports.llm.parse(command),
        this.config.llmTimeoutMs,
        'LLM parse timed out',
      );
      logEvent('qwen', `parse → ${byLlm.intent} (${Date.now() - started}ms)`);
      return byLlm.intent === 'unknown' ? null : byLlm;
    } catch (error) {
      logEvent('qwen', `parse failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /** Null when contacts/dialer are not wired, so the caller says "not understood". */
  private async runCall(target: string | null) {
    const { contacts, dialer } = this.ports;
    if (!contacts || !dialer) return null;
    return runCallFlow(target, {
      getContacts: () => contacts.getContacts(),
      confirm: (prompt) => this.listenYesNo(prompt),
      lang: this.config.replyLanguage,
    });
  }

  /** Null when SOS ports are missing. */
  private async runSos() {
    const { getEmergencyContacts, getLocation, sendSms } = this.ports;
    if (!getEmergencyContacts || !getLocation || !sendSms) {
      return { reply: this.strings.sosNoContacts };
    }
    return runSosFlow({
      getEmergencyContacts,
      getLocation,
      sendSms,
      lang: this.config.replyLanguage,
      listenForCancel: async (prompt) => {
        const answer = await this.listenYesNo(prompt);
        return answer === 'no'; // 'no' or 'cancel' (handled by parseYesNo)
      },
    });
  }

  /**
   * Speak a prompt, record one short answer (no pre-roll: it would contain our
   * own voice), and read it as yes/no. A clip that is too short, a low-confidence
   * transcript or an unclear answer all return 'unknown', which never confirms.
   */
  private async listenYesNo(prompt: string): Promise<YesNo> {
    await this.speak(prompt);

    this.setState('recording');
    const clip = await this.ports.recorder.record({ includePreRoll: false });
    if (this.isTooShort(clip)) return 'unknown';

    this.setState('stt');
    const heard = await this.ports.stt.transcribe(clip);
    if (heard.confidence < this.config.minConfidence) return 'unknown';
    return parseYesNo(heard.text);
  }

  /** Hard ceiling on one native step: a hang must never leave us in "Thinking" forever. */
  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
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
