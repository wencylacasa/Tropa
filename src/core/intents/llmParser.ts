import { initLlama, type LlamaContext } from './llamaNative';

import type { LlmPort } from './dispatcher';
import { INTENT_GRAMMAR } from './grammar';
import { buildChatMessages, buildMessages } from './prompt';

export type LlmParserOptions = {
  /** Absolute path of the Qwen GGUF file, or null if not installed yet. */
  getModelPath: () => string | null;
  /**
   * Context size in tokens. The system prompt + 29 few-shots are roughly
   * 1,200+ tokens, so 1024 (the original plan) is too small; 2048 is the
   * default until the prompt is measured on a device.
   */
  nCtx?: number;
  /** Max tokens to generate. The JSON object is short; 64 is plenty. */
  nPredict?: number;
  /** Keep the model in RAM between commands (faster, needs headroom on 4 GB phones). */
  keepLoaded?: boolean;
  nThreads?: number;
};

/**
 * Load > parse > release (unless keepLoaded), per the memory strategy.
 *
 * Output is forced into the intent JSON shape by the GBNF grammar, greedy
 * decoding (temperature 0) and `/no_think` in every user turn. The raw text is
 * NOT trusted: `parseCommand` validates it and applies the never-guess guard.
 *
 * Use `port()` as the `LlmPort` for `parseCommand`.
 */
const SPEECH_CAP = 320;

/** Voice reply cap: cut at the last sentence end inside the limit, never mid-word. */
function trimForSpeech(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= SPEECH_CAP) return trimmed;
  const cut = trimmed.slice(0, SPEECH_CAP);
  const end = Math.max(
    cut.lastIndexOf('.'),
    cut.lastIndexOf('!'),
    cut.lastIndexOf('?'),
    cut.lastIndexOf('\n'),
  );
  return (end > 40 ? cut.slice(0, end + 1) : cut).trim();
}

export class LlmParser {
  private context: LlamaContext | null = null;

  constructor(private readonly options: LlmParserOptions) {}

  /** Shaped for `parseCommand(transcript, llm)`. */
  port(): LlmPort {
    return (transcript) => this.run(transcript);
  }

  async run(transcript: string): Promise<string> {
    const context = await this.load();
    try {
      // Every command is independent; never reuse another command's cache.
      await context.clearCache(false);

      const result = await context.completion({
        messages: buildMessages(transcript),
        grammar: INTENT_GRAMMAR,
        n_predict: this.options.nPredict ?? 64,
        temperature: 0,
        // Qwen3 thinks by default; /no_think is in the prompt, this is the belt to its braces.
        enable_thinking: false,
      });
      return result.text;
    } finally {
      if (!this.options.keepLoaded) await this.release();
    }
  }

  /**
   * Freeform short reply for commands no intent matched. No grammar — just a
   * small system prompt, slightly warm decoding, one spoken line.
   */
  async chat(
    transcript: string,
    lastExchange?: { command: string; reply: string } | null,
  ): Promise<string> {
    const context = await this.load();
    try {
      await context.clearCache(false);
      const result = await context.completion({
        messages: buildChatMessages(transcript, lastExchange),
        n_predict: 140,
        temperature: 0.7,
        enable_thinking: false,
      });
      return trimForSpeech(result.text);
    } finally {
      if (!this.options.keepLoaded) await this.release();
    }
  }

  async release(): Promise<void> {
    const context = this.context;
    this.context = null;
    if (context) await context.release();
  }

  private async load(): Promise<LlamaContext> {
    if (this.context) return this.context;

    const model = this.options.getModelPath();
    if (!model) throw new Error('Qwen model is not installed yet (run Setup)');

    this.context = await initLlama({
      model,
      n_ctx: this.options.nCtx ?? 2048,
      n_threads: this.options.nThreads,
      // Single short request at a time: no parallel slots, no GPU offload (CPU-only on Android).
      n_parallel: 1,
      n_gpu_layers: 0,
      use_mlock: false,
    });
    return this.context;
  }
}
