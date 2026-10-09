import type { EmergencyContact } from '../settings/settings';

export type SosFlowPorts = {
  /** Speaks the prompt, listens for an answer, and returns true if the user says cancel/no. */
  listenForCancel: (prompt: string) => Promise<boolean>;
  getEmergencyContacts: () => readonly EmergencyContact[];
  getLocation: () => { latitude: number; longitude: number } | null;
  sendSms: (phone: string, message: string) => Promise<void>;
};

export type SosFlowResult = {
  reply: string;
};

export const REPLY_SOS_NO_CONTACTS = "You have no emergency contacts set up.";
export const REPLY_SOS_CANCELLED = "Okay, SOS cancelled.";
export const REPLY_SOS_SENT = "SOS sent to your emergency contacts.";

export async function runSosFlow(ports: SosFlowPorts): Promise<SosFlowResult> {
  const contacts = ports.getEmergencyContacts();
  if (contacts.length === 0) {
    return { reply: REPLY_SOS_NO_CONTACTS };
  }

  const cancelled = await ports.listenForCancel("SOS triggered. Say cancel to abort.");
  if (cancelled) {
    return { reply: REPLY_SOS_CANCELLED };
  }

  const location = ports.getLocation();
  const locationText = location 
    ? `My last location: https://maps.google.com/?q=${location.latitude},${location.longitude}`
    : "My location is currently unknown.";

  const message = `EMERGENCY: Tropa SOS triggered. ${locationText}`;

  for (const contact of contacts) {
    try {
      await ports.sendSms(contact.phone, message);
    } catch {
      // Best effort; continue with other contacts
    }
  }

  return { reply: REPLY_SOS_SENT };
}
