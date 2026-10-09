import { requireTropaNative } from '../../../modules/tropa-native/src';
import type { Dialer } from '../pipeline/states';
import type { Contact } from './contactMatch';

export class NativeDialer implements Dialer {
  async dial(contact: Contact): Promise<void> {
    if (!contact.phone) {
      throw new Error(`Cannot dial ${contact.name}: no phone number available.`);
    }
    requireTropaNative().dialNumber(contact.phone);
  }
}
