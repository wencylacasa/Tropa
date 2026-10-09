/**
 * Spoken English time, e.g. 16:45 -> "4:45 in the afternoon".
 * 00:00 -> "midnight", 12:00 -> "noon".
 */

export type ClockTime = { hours: number; minutes: number };

function periodOf(hours: number): string {
  if (hours >= 5 && hours < 12) return 'in the morning';
  if (hours >= 12 && hours < 18) return 'in the afternoon';
  if (hours >= 18 && hours < 21) return 'in the evening';
  return 'at night';
}

export function timeToEnglish(input: Date | ClockTime): string {
  const hours = input instanceof Date ? input.getHours() : input.hours;
  const minutes = input instanceof Date ? input.getMinutes() : input.minutes;

  if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
    throw new RangeError(`Invalid hours: ${hours}`);
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    throw new RangeError(`Invalid minutes: ${minutes}`);
  }

  if (minutes === 0 && hours === 0) return 'midnight';
  if (minutes === 0 && hours === 12) return 'noon';

  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const period = periodOf(hours);

  if (minutes === 0) return `${hour12} o'clock ${period}`;
  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hour12}:${mm} ${period}`;
}
