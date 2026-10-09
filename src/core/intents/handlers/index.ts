import { dateToEnglish } from '../../format/dateToEnglish';
import { timeToEnglish } from '../../format/timeToEnglish';
import type { ParsedCommand } from '../types';

export type HandlerContext = {
  now: () => Date;
  /** 0-100, or null if unavailable. */
  getBatteryLevel: () => Promise<number | null>;
  lastReply: string | null;
};

/**
 * Returns the English reply to speak, or null if this intent has no handler
 * yet (caller then says "Sorry, I didn't understand"). Never guesses.
 */
export async function runHandler(
  command: ParsedCommand,
  ctx: HandlerContext,
): Promise<string | null> {
  switch (command.intent) {
    case 'tell_time':
      return `It's ${timeToEnglish(ctx.now())}`;

    case 'tell_date':
      return `Today is ${dateToEnglish(ctx.now())}`;

    case 'battery_level': {
      const level = await ctx.getBatteryLevel();
      return level === null ? "I can't read the battery" : `Battery is at ${Math.round(level)} percent`;
    }

    case 'repeat_last':
      return ctx.lastReply ?? 'I have nothing to repeat';

    default:
      // media, volume, call_contact, sos_alert, unknown: added in later milestones.
      return null;
  }
}
