import { initLlama, type LlamaContext } from 'llama.rn';

import { INTENT_GRAMMAR } from './grammar';
import type { LlmPort } from './dispatcher';
import { buildMessages } from './prompt';

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
