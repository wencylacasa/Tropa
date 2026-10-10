import type { EmergencyContact, ReplyLanguage } from '../settings/settings';

export type SosFlowPorts = {
  /** Speaks the prompt, listens for an answer, and returns true if the user says cancel/no. */
  listenForCancel: (prompt: string) => Promise<boolean>;
  getEmergencyContacts: () => readonly EmergencyContact[];
  getLocation: () => { latitude: number; longitude: number } | null;
  sendSms: (phone: string, message: string) => Promise<void>;
  /** Spoken language of prompts/replies; English when omitted. */
  lang?: ReplyLanguage;
};

export type SosFlowResult = {
  reply: string;
};

export const REPLY_SOS_NO_CONTACTS = "You have no emergency contacts set up.";
export const REPLY_SOS_CANCELLED = "Okay, SOS cancelled.";
export const REPLY_SOS_SENT = "SOS sent to your emergency contacts.";

const TL = {
  noContacts: 'Wala kang naka-set na emergency contacts.',
  cancelled: 'Sige, kinansela ang SOS.',
  sent: 'Naipadala ang SOS sa mga emergency contacts mo.',
  prompt: 'SOS. Sabihin ang cancel para itigil.',
};

const EN = {
  noContacts: REPLY_SOS_NO_CONTACTS,
  cancelled: REPLY_SOS_CANCELLED,
  sent: REPLY_SOS_SENT,
  prompt: 'SOS triggered. Say cancel to abort.',
};

export async function runSosFlow(ports: SosFlowPorts): Promise<SosFlowResult> {
  const s = ports.lang === 'tl' ? TL : EN;

  const contacts = ports.getEmergencyContacts();
  if (contacts.length === 0) {
    return { reply: s.noContacts };
  }

  const cancelled = await ports.listenForCancel(s.prompt);
  if (cancelled) {
    return { reply: s.cancelled };
  }

  const location = ports.getLocation();
  const locationText = location
    ? `My last location: https://maps.google.com/?q=${location.latitude},${location.longitude}`
    : 'My location is currently unknown.';

  const message = `EMERGENCY: Tropa SOS triggered. ${locationText}`;

  for (const contact of contacts) {
    try {
      await ports.sendSms(contact.phone, message);
    } catch {
      // Best effort; continue with other contacts
    }
  }

  return { reply: s.sent };
}
