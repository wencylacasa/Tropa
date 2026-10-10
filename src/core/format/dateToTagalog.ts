/** "2026-10-09" -> "Biyernes, Oktubre 9". */

const DAYS_TL = ['Linggo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'];

const MONTHS_TL = [
  'Enero',
  'Pebrero',
  'Marso',
  'Abril',
  'Mayo',
  'Hunyo',
  'Hulyo',
  'Agosto',
  'Setyembre',
  'Oktubre',
  'Nobyembre',
  'Disyembre',
];

export function dateToTagalog(date: Date): string {
  return `${DAYS_TL[date.getDay()]}, ${MONTHS_TL[date.getMonth()]} ${date.getDate()}`;
}
