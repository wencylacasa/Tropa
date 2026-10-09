/**
 * Voice flow for call_contact: resolve the spoken name, read it back, and only
 * hand a contact to the dialer after an explicit yes. Pure logic; the caller
 * supplies contacts and the speak+listen step, and does the dialing itself.
 *
 * Never guesses: unknown, ambiguous, silent or failed confirmation all end in
 * "no call". The caller speaks `reply` first, then dials `dial` if it is set
 * (speaking after the call starts would be cut off by the call UI).
 */

import type { YesNo } from '../intents/yesNo';
import { matchContact, type Contact } from './contactMatch';

export type CallFlowPorts = {
  /** Cached contacts that have a phone number. Empty when permission is missing. */
  getContacts: () => Promise<readonly Contact[]>;
  /** Speaks the prompt, listens for one short answer, returns it as yes/no. */
  confirm: (prompt: string) => Promise<YesNo>;
};

export type CallFlowResult = {
  reply: string;
  /** Set only after an explicit yes. */
  dial: Contact | null;
};

export const REPLY_NO_NAME = "Sorry, I didn't catch the name";
export const REPLY_NO_CONTACTS = "I can't read your contacts";
export const REPLY_CALL_CANCELLED = 'Okay, cancelled';
export const REPLY_CALL_CONFIRMED = 'Okay, calling';
export const PROMPT_YES_OR_NO = 'Please say yes or no';

const MAX_NAMES_SPOKEN = 3;

function declined(reply: string): CallFlowResult {
  return { reply, dial: null };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** A failed listen (mic, STT) counts as "not confirmed", never as yes. */
async function ask(ports: CallFlowPorts, prompt: string): Promise<YesNo> {
  try {
    return await ports.confirm(prompt);
  } catch {
    return 'unknown';
  }
}

export async function runCallFlow(
  target: string | null,
  ports: CallFlowPorts,
): Promise<CallFlowResult> {
  const spoken = target?.trim() ?? '';
  if (spoken.length === 0) return declined(REPLY_NO_NAME);

  let contacts: readonly Contact[];
  try {
    contacts = await ports.getContacts();
  } catch {
    contacts = [];
  }
  if (contacts.length === 0) return declined(REPLY_NO_CONTACTS);

  const found = matchContact(spoken, contacts);

  if (found.status === 'none') {
    return declined(`I can't find ${spoken} in your contacts`);
  }

  if (found.status === 'ambiguous') {
    const names = found.contacts.slice(0, MAX_NAMES_SPOKEN).map((c) => c.name);
    return declined(`I found ${joinNames(names)}. Please say the full name`);
  }

  const { contact } = found;
  let answer = await ask(ports, `Calling ${contact.name}, okay?`);
  // One retry for noise or a mumbled answer; a second non-answer cancels.
  if (answer === 'unknown') answer = await ask(ports, PROMPT_YES_OR_NO);

  return answer === 'yes'
    ? { reply: REPLY_CALL_CONFIRMED, dial: contact }
    : declined(REPLY_CALL_CANCELLED);
}
