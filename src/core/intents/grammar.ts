/**
 * GBNF grammar forcing llama.rn to emit exactly:
 *   {"intent":<one of INTENTS>,"target":<string|null>,"reply":<string>}
 * The intent list is built from INTENTS so grammar and validator never drift.
 * Output is still validated by parseLlmOutput; the grammar only makes
 * malformed output rare.
 */

import { INTENTS } from './llmOutput';

const intentAlternatives = INTENTS.map((i) => `"\\"${i}\\""`).join(' | ');

export const INTENT_GRAMMAR = [
  'root ::= "{" ws "\\"intent\\"" ws ":" ws intent ws "," ws "\\"target\\"" ws ":" ws target ws "," ws "\\"reply\\"" ws ":" ws str ws "}"',
  `intent ::= ${intentAlternatives}`,
  'target ::= "null" | str',
  'str ::= "\\"" [^"\\\\\\n]{0,60} "\\""',
  'ws ::= [ ]?',
].join('\n');
