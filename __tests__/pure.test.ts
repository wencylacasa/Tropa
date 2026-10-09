import { dateToEnglish } from '@/core/format/dateToEnglish';
import { parseYesNo } from '@/core/intents/yesNo';

describe('dateToEnglish', () => {
  it('formats weekday, month and day', () => {
    expect(dateToEnglish(new Date(2026, 9, 9))).toBe('Friday, October 9');
    expect(dateToEnglish(new Date(2026, 0, 1))).toBe('Thursday, January 1');
    expect(dateToEnglish(new Date(2024, 1, 29))).toBe('Thursday, February 29');
  });
});

describe('parseYesNo', () => {
  it.each(['oo', 'Opo!', 'sige', 'ok', 'okay', 'yes', 'oo sige tawag na'])('"%s" -> yes', (s) => {
    expect(parseYesNo(s)).toBe('yes');
  });

  it.each(['hindi', 'huwag', 'wag po', 'no', 'cancel', 'Hindi, cancel'])('"%s" -> no', (s) => {
    expect(parseYesNo(s)).toBe('no');
  });

  it.each(['', 'ano', 'baka', 'oo hindi', 'sige huwag', 'okay no'])(
    '"%s" -> unknown (never counts as confirmed)',
    (s) => {
      expect(parseYesNo(s)).toBe('unknown');
    },
  );
});
