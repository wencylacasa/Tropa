import { dateToEnglish } from '../../format/dateToEnglish';
import { dateToTagalog } from '../../format/dateToTagalog';
import { timeToEnglish } from '../../format/timeToEnglish';
import { timeToTagalog } from '../../format/timeToTagalog';
import type { ReplyLanguage } from '../../settings/settings';
import type { MediaControl } from '../../system/mediaControl';
import type { ParsedCommand } from '../types';

export type HandlerContext = {
  now: () => Date;
  /** 0-100, or null if unavailable. */
  getBatteryLevel: () => Promise<number | null>;
  lastReply: string | null;
  /** Media transport + volume keys; null without the native module. */
  media: MediaControl | null | undefined;
  /** Spoken reply language; English when unset. */
  replyLanguage?: ReplyLanguage;
  /** Human-readable place ("EDSA, Makati") or coordinates; null when no GPS fix. */
  describeLocation?: () => Promise<string | null>;
};

/**
 * Returns the reply to speak, or null if this intent has no handler
 * yet (caller then says "not understood"). Never guesses.
 */
export async function runHandler(
  command: ParsedCommand,
  ctx: HandlerContext,
): Promise<string | null> {
  const tl = ctx.replyLanguage === 'tl';

  switch (command.intent) {
    case 'tell_time':
      return tl
        ? `${timeToTagalog(ctx.now())} na`
        : `It's ${timeToEnglish(ctx.now())}`;

    case 'tell_date':
      return tl
        ? `Ngayon ay ${dateToTagalog(ctx.now())}`
        : `Today is ${dateToEnglish(ctx.now())}`;

    case 'battery_level': {
      const level = await ctx.getBatteryLevel();
      if (level === null) {
        return tl ? 'Hindi ko mabasa ang baterya' : "I can't read the battery";
      }
      return tl
        ? `Nasa ${Math.round(level)} porsyento ang baterya`
        : `Battery is at ${Math.round(level)} percent`;
    }

    case 'media_play':
      if (!ctx.media) return tl ? 'Hindi ko makontrol ang media dito' : "I can't control media on this device";
      ctx.media.playPause();
      return tl ? 'Pinapatugtog na' : 'Playing';

    case 'media_pause':
      if (!ctx.media) return tl ? 'Hindi ko makontrol ang media dito' : "I can't control media on this device";
      ctx.media.playPause();
      return tl ? 'Tigil muna' : 'Paused';

    case 'media_next':
      if (!ctx.media) return tl ? 'Hindi ko makontrol ang media dito' : "I can't control media on this device";
      ctx.media.next();
      return tl ? 'Sunod na kanta' : 'Next song';

    case 'volume_up':
      if (!ctx.media) return tl ? 'Hindi ko mabago ang volume dito' : "I can't change the volume on this device";
      ctx.media.volumeUp();
      return tl ? 'Tinaasan ang volume' : 'Volume up';

    case 'volume_down':
      if (!ctx.media) return tl ? 'Hindi ko mabago ang volume dito' : "I can't change the volume on this device";
      ctx.media.volumeDown();
      return tl ? 'Binabaan ang volume' : 'Volume down';

    case 'repeat_last':
      return ctx.lastReply ?? (tl ? 'Wala akong mai-uulit' : 'I have nothing to repeat');

    case 'greet':
      return tl ? 'Ayos lang ako! Ano ang kailangan mo?' : "Doing great! What do you need?";

    case 'thank':
      return tl ? 'Walang anuman!' : "You're welcome!";

    case 'identity':
      return tl
        ? 'Ako si Tropa, ang hands-free assistant mo sa biyahe.'
        : "I'm Tropa, your hands-free riding assistant.";

    case 'where_am_i': {
      const place = await ctx.describeLocation?.();
      if (!place) {
        return tl ? 'Hindi ko makuha ang location mo' : "I can't get your location";
      }
      return tl ? `Nasa ${place} ka` : `You're at ${place}`;
    }

    case 'help':
      return tl
        ? 'Kaya kong sabihin ang oras, petsa, baterya, at kung nasaan ka; magpatugtog, magpalit ng kanta, at magbago ng volume; tumawag sa contacts mo; at magpadala ng SOS.'
        : 'I can tell the time, date, battery and your location; play, skip and control music volume; call your contacts; and send an SOS.';

    default:
      // call_contact / sos_alert have dedicated flows; unknown is the caller's.
      return null;
  }
}
