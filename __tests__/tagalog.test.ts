import { dateToTagalog } from '@/core/format/dateToTagalog';
import { timeToTagalog } from '@/core/format/timeToTagalog';
import { runHandler } from '@/core/intents/handlers';
import { matchRules } from '@/core/intents/rules';

function at(hours: number, minutes: number): Date {
  return new Date(2026, 9, 9, hours, minutes);
}

describe('timeToTagalog', () => {
  it.each([
    [16, 45, 'Alas-kuwatro y kuwarenta y singko ng hapon'],
    [1, 0, 'Ala-una ng madaling araw'],
    [7, 15, 'Alas-siyete y kinse ng umaga'],
    [9, 30, 'Alas-nuwebe y medya ng umaga'],
    [12, 0, 'Alas-dose ng tanghali'],
    [13, 5, 'Ala-una y singko ng hapon'],
    [21, 21, 'Alas-nuwebe y beintiuno ng gabi'],
    [0, 0, 'Alas-dose ng madaling araw'],
  ])('%i:%i -> %s', (h, m, expected) => {
    expect(timeToTagalog(at(h, m))).toBe(expected);
  });
});

describe('dateToTagalog', () => {
  it('formats weekday, month and day in Tagalog', () => {
    expect(dateToTagalog(new Date(2026, 9, 9))).toBe('Biyernes, Oktubre 9');
    expect(dateToTagalog(new Date(2026, 0, 4))).toBe('Linggo, Enero 4');
  });
});

describe('Tagalog keyword rules', () => {
  it.each([
    ['ilang oras na', 'tell_time'],
    ['time na ba', 'tell_time'],
    ['araw ngayon', 'tell_date'],
    ['magkano pa ang charge', 'battery_level'],
    ['palitan ang kanta', 'media_next'],
    ['itigil mo', 'media_pause'],
    ['istop ang musika', 'media_pause'],
    ['magpatugtog', 'media_play'],
    ['ituloy mo', 'media_play'],
    ['kanta', 'media_play'],
    ['pahinaan mo', 'volume_down'],
    ['ibaba mo', 'volume_down'],
    ['bawasan mo', 'volume_down'],
    ['palakasin mo', 'volume_up'],
    ['itaas mo', 'volume_up'],
    ['dagdagan mo', 'volume_up'],
    ['saklolo', 'sos_alert'],
    ['pakiulit', 'repeat_last'],
  ])('"%s" -> %s', (phrase, intent) => {
    expect(matchRules(phrase)).toEqual({ intent, target: null, source: 'rule' });
  });

  it.each([
    ['itawag mo kay Ben', 'ben'],
    ['tawagin mo si Mama', 'mama'],
    ['pakitawag si Kuya Ben', 'kuya ben'],
  ])('"%s" -> call_contact (%s)', (phrase, target) => {
    expect(matchRules(phrase)).toEqual({ intent: 'call_contact', target, source: 'rule' });
  });
});

describe('Tagalog replies (replyLanguage: tl)', () => {
  const ctx = {
    now: () => at(16, 45),
    getBatteryLevel: async () => 42,
    lastReply: null,
    media: null,
    replyLanguage: 'tl' as const,
  };

  it('speaks the time in Tagalog', async () => {
    const reply = await runHandler({ intent: 'tell_time', target: null, source: 'rule' }, ctx);
    expect(reply).toBe('Alas-kuwatro y kuwarenta y singko ng hapon na');
  });

  it('speaks the date in Tagalog', async () => {
    const reply = await runHandler({ intent: 'tell_date', target: null, source: 'rule' }, ctx);
    expect(reply).toBe('Ngayon ay Biyernes, Oktubre 9');
  });

  it('speaks the battery in Tagalog', async () => {
    const reply = await runHandler({ intent: 'battery_level', target: null, source: 'rule' }, ctx);
    expect(reply).toBe('Nasa 42 porsyento ang baterya');
  });
});
