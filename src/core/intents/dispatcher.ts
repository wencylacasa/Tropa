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

export type ParseResult = {
  command: ParsedCommand;
  /** Model-suggested reply (LLM path only). Handlers own the real reply. */
  llmReply: string | null;
};

const NONE: ParsedCommand = { intent: 'unknown', target: null, source: 'none' };

export async function parseCommand(transcript: string, llm?: LlmPort): Promise<ParseResult> {
  const ruled = matchRules(transcript);
  if (ruled) return { command: ruled, llmReply: null };

  if (!llm || transcript.trim().length === 0) {
    return { command: NONE, llmReply: null };
  }

  let raw: string;
  try {
    raw = await llm(transcript);
  } catch {
    return { command: { ...NONE, source: 'llm' }, llmReply: null };
  }

  const parsed = parseLlmOutput(raw);
  const command = guardLlmCommand(parsed.command, transcript);
  // If the guard downgraded the command, the model's reply no longer applies.
  const llmReply = command.intent === parsed.command.intent ? parsed.reply : null;
  return { command, llmReply };
}
