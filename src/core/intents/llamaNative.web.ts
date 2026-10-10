import type { LlamaContext } from 'llama.rn';

export type { LlamaContext };

/** llama.rn is Android/iOS-only; on web there is no model file, so this is never reached. */
export function initLlama(_options: Record<string, unknown>): Promise<LlamaContext> {
  return Promise.reject(new Error('Llama is not supported on web'));
}
