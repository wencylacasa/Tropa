import { timeToEnglish } from '@/core/format/timeToEnglish';

describe('timeToEnglish', () => {
  it.each([
    [{ hours: 16, minutes: 45 }, '4:45 in the afternoon'],
    [{ hours: 9, minutes: 5 }, '9:05 in the morning'],
    [{ hours: 0, minutes: 0 }, 'midnight'],
    [{ hours: 12, minutes: 0 }, 'noon'],
    [{ hours: 12, minutes: 30 }, '12:30 in the afternoon'],
    [{ hours: 0, minutes: 30 }, '12:30 at night'],
    [{ hours: 1, minutes: 0 }, "1 o'clock at night"],
    [{ hours: 5, minutes: 0 }, "5 o'clock in the morning"],
    [{ hours: 18, minutes: 15 }, '6:15 in the evening'],
    [{ hours: 21, minutes: 59 }, '9:59 at night'],
    [{ hours: 23, minutes: 59 }, '11:59 at night'],
  ])('%j -> %s', (input, expected) => {
    expect(timeToEnglish(input)).toBe(expected);
  });

  it('accepts a Date', () => {
    expect(timeToEnglish(new Date(2026, 9, 9, 16, 45))).toBe('4:45 in the afternoon');
  });

  it('rejects invalid input', () => {
    expect(() => timeToEnglish({ hours: 24, minutes: 0 })).toThrow(RangeError);
    expect(() => timeToEnglish({ hours: 10, minutes: 60 })).toThrow(RangeError);
  });
});
