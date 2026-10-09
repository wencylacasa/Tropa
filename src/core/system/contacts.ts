import * as Contacts from 'expo-contacts';

import {
  createContactSource,
  type CachedContactSource,
  type ContactsBackend,
  type RawContactRow,
} from './contactSource';

const FIELDS = [Contacts.ContactField.FULL_NAME, Contacts.ContactField.PHONES] as const;

/** expo-contacts (SDK 57 object API) behind the small backend interface. */
export const expoContactsBackend: ContactsBackend = {
  async hasPermission() {
    try {
      return (await Contacts.getPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },
  async getRows(): Promise<readonly RawContactRow[]> {
    const details = await Contacts.Contact.getAllDetails(FIELDS);
    return details.map((d) => ({ id: d.id, name: d.fullName, phones: d.phones }));
  },
};

/** For the Setup screen: asks for READ_CONTACTS. Never called from the voice flow. */
export async function requestContactsPermission(): Promise<boolean> {
  try {
    return (await Contacts.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** The ContactSource to put in PipelinePorts.contacts. */
export function createExpoContactSource(): CachedContactSource {
  const source = createContactSource(expoContactsBackend);
  // Keep the cache fresh when the address book changes (Android may delay this by a few seconds).
  try {
    Contacts.addContactsChangeListener(() => source.invalidate());
  } catch {
    // Listener unsupported: the cache simply expires on its own.
  }
  return source;
}
