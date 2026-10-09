import { runSosFlow, REPLY_SOS_NO_CONTACTS, REPLY_SOS_CANCELLED, REPLY_SOS_SENT, type SosFlowPorts } from '../src/core/system/sosFlow';
import type { EmergencyContact } from '../src/core/settings/settings';

describe('SOS Flow', () => {
  let defaultPorts: SosFlowPorts;
  let sentMessages: Array<{ phone: string; message: string }>;

  beforeEach(() => {
    sentMessages = [];
    defaultPorts = {
      getEmergencyContacts: () => [{ name: 'Test', phone: '123' }],
      getLocation: () => ({ latitude: 1, longitude: 2 }),
      listenForCancel: async () => false,
      sendSms: async (phone, message) => {
        sentMessages.push({ phone, message });
      },
    };
  });

  it('bails out if no emergency contacts', async () => {
    const ports = { ...defaultPorts, getEmergencyContacts: () => [] };
    const result = await runSosFlow(ports);
    expect(result.reply).toBe(REPLY_SOS_NO_CONTACTS);
    expect(sentMessages).toHaveLength(0);
  });

  it('cancels if user says so', async () => {
    const ports = { ...defaultPorts, listenForCancel: async () => true };
    const result = await runSosFlow(ports);
    expect(result.reply).toBe(REPLY_SOS_CANCELLED);
    expect(sentMessages).toHaveLength(0);
  });

  it('sends SMS with location if not cancelled', async () => {
    const result = await runSosFlow(defaultPorts);
    expect(result.reply).toBe(REPLY_SOS_SENT);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].phone).toBe('123');
    expect(sentMessages[0].message).toContain('https://maps.google.com/?q=1,2');
  });

  it('sends SMS without location if location unavailable', async () => {
    const ports = { ...defaultPorts, getLocation: () => null };
    const result = await runSosFlow(ports);
    expect(result.reply).toBe(REPLY_SOS_SENT);
    expect(sentMessages[0].message).toContain('unknown');
  });
});
