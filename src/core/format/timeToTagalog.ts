/**
 * "16:45" -> "Alas-kuwatro y kuwarenta y singko ng hapon".
 * Spoken Tagalog keeps the Spanish-style clock: ala-una .. alas-dose for the
 * hour, Spanish-derived numbers for the minutes ("y singko", "y kinse",
 * "y medya" for :30, "kuwarenta y singko"), plus the part of day.
 */

const HOURS_TL = [
  'Alas-dose', // 0 / 12
  'Ala-una',
  'Alas-dos',
  'Alas-tres',
  'Alas-kuwatro',
  'Alas-singko',
  'Alas-sais',
  'Alas-siyete',
  'Alas-otso',
  'Alas-nuwebe',
  'Alas-dyes',
  'Alas-onse',
];

const MIN_ONES_TL = [
  '',
  'uno',
  'dos',
  'tres',
  'kuwatro',
  'singko',
  'sais',
  'siyete',
  'otso',
  'nuwebe',
  'dyes',
  'onse',
  'dose',
  'trese',
  'katorse',
  'kinse',
  'disisais',
  'disisiyete',
  'disiotso',
  'disinuwebe',
];

const MIN_TENS_TL: Record<number, string> = {
  2: 'beinti', // compounds: beintiuno, beintidos, ...
  3: 'treinta',
  4: 'kuwarenta',
  5: 'singkuwenta',
};

function minutesToTagalog(minutes: number): string {
  if (minutes < 20) return MIN_ONES_TL[minutes];
  const tens = Math.floor(minutes / 10);
  const ones = minutes % 10;
  if (tens === 2) return `${MIN_TENS_TL[2]}${MIN_ONES_TL[ones]}`; // "beintisingko"
  return ones === 0 ? MIN_TENS_TL[tens] : `${MIN_TENS_TL[tens]} y ${MIN_ONES_TL[ones]}`;
}

function partOfDay(hours: number): string {
  if (hours < 5) return 'ng madaling araw';
  if (hours < 12) return 'ng umaga';
  if (hours < 13) return 'ng tanghali';
  if (hours < 18) return 'ng hapon';
  return 'ng gabi';
}

export function timeToTagalog(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hourWord = HOURS_TL[hours % 12];
  const part = partOfDay(hours);

  if (minutes === 0) return `${hourWord} ${part}`;
  if (minutes === 30) return `${hourWord} y medya ${part}`;
  return `${hourWord} y ${minutesToTagalog(minutes)} ${part}`;
}
