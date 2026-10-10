/**
 * Rules-first command parsing. Keyword rules run first; the LLM is only
 * called when no rule matches. LLM output is validated and passed through the
 * never-guess guard. Any LLM failure resolves to `unknown`.
 */

import { guardLlmCommand, parseLlmOutput } from './llmOutput';
import { matchRules } from './rules';
import type { ParsedCommand } from './types';

/** Runs the model on the transcript and returns its raw text output. */
export type LlmPort = (transcript: string) => Promise<string>;

const NONE: ParsedCommand = { intent: 'unknown', target: null, source: 'none' };

export async function parseCommand(transcript: string, llm?: LlmPort): Promise<ParsedCommand> {
  const ruled = matchRules(transcript);
  if (ruled) return ruled;

  if (!llm || transcript.trim().length === 0) {
    return NONE;
  }

  let raw: string;
  try {
    raw = await llm(transcript);
  } catch {
    return { ...NONE, source: 'llm' };
  }

  return guardLlmCommand(parseLlmOutput(raw), transcript);
}
