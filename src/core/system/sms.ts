import { requireTropaNative } from '../../../modules/tropa-native/src';

export interface SmsSender {
  sendSilentSms(phone: string, message: string): Promise<void>;
}

export const nativeSmsSender: SmsSender = {
  async sendSilentSms(phone: string, message: string): Promise<void> {
    requireTropaNative().sendSilentSms(phone, message);
  }
};
