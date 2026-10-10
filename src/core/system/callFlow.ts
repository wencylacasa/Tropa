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
import type { ReplyLanguage } from '../settings/settings';
import { matchContact, type Contact } from './contactMatch';

export type CallFlowPorts = {
  /** Cached contacts that have a phone number. Empty when permission is missing. */
  getContacts: () => Promise<readonly Contact[]>;
  /** Speaks the prompt, listens for one short answer, returns it as yes/no. */
  confirm: (prompt: string) => Promise<YesNo>;
  /** Spoken language of prompts/replies; English when omitted. */
  lang?: ReplyLanguage;
};

export type CallFlowResult = {
  reply: string;
  /** Set only after an explicit yes. */
  dial: Contact | null;
};

// English strings are exported for tests; Tagalog lives in the table below.
export const REPLY_NO_NAME = "Sorry, I didn't catch the name";
export const REPLY_NO_CONTACTS = "I can't read your contacts";
export const REPLY_CALL_CANCELLED = 'Okay, cancelled';
export const REPLY_CALL_CONFIRMED = 'Okay, calling';
export const PROMPT_YES_OR_NO = 'Please say yes or no';

const TL = {
  noName: 'Pasensya, hindi ko narinig ang pangalan',
  noContacts: 'Hindi ko mabasa ang contacts mo',
  cancelled: 'Sige, hindi na tatawag',
  confirmed: 'Sige, tatawag na',
  yesOrNo: 'Pakisabi ng oo o hindi',
  notFound: (name: string) => `Wala akong nakitang ${name} sa contacts mo`,
  ambiguous: (names: string) => `May nakita akong ${names}. Pakisabi ang buong pangalan`,
  calling: (name: string) => `Tatawag kay ${name}, okay?`,
};

const EN = {
  noName: REPLY_NO_NAME,
  noContacts: REPLY_NO_CONTACTS,
  cancelled: REPLY_CALL_CANCELLED,
  confirmed: REPLY_CALL_CONFIRMED,
  yesOrNo: PROMPT_YES_OR_NO,
  notFound: (name: string) => `I can't find ${name} in your contacts`,
  ambiguous: (names: string) => `I found ${names}. Please say the full name`,
  calling: (name: string) => `Calling ${name}, okay?`,
};

const MAX_NAMES_SPOKEN = 3;

function declined(reply: string): CallFlowResult {
  return { reply, dial: null };
}

function joinNames(names: string[], tl: boolean): string {
  if (names.length <= 1) return names.join('');
  const conjunction = tl ? ' o ' : ' or ';
  return `${names.slice(0, -1).join(', ')}${conjunction}${names[names.length - 1]}`;
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
  const tl = ports.lang === 'tl';
  const s = tl ? TL : EN;

  const spoken = target?.trim() ?? '';
  if (spoken.length === 0) return declined(s.noName);

  let contacts: readonly Contact[];
  try {
    contacts = await ports.getContacts();
  } catch {
    contacts = [];
  }
  if (contacts.length === 0) return declined(s.noContacts);

  const found = matchContact(spoken, contacts);

  if (found.status === 'none') {
    return declined(s.notFound(spoken));
  }

  if (found.status === 'ambiguous') {
    const names = found.contacts.slice(0, MAX_NAMES_SPOKEN).map((c) => c.name);
    return declined(s.ambiguous(joinNames(names, tl)));
  }

  const { contact } = found;
  let answer = await ask(ports, s.calling(contact.name));
  // One retry for noise or a mumbled answer; a second non-answer cancels.
  if (answer === 'unknown') answer = await ask(ports, s.yesOrNo);

  return answer === 'yes'
    ? { reply: s.confirmed, dial: contact }
    : declined(s.cancelled);
}
