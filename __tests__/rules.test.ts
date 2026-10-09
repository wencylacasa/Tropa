import { matchRules } from '@/core/intents/rules';

describe('matchRules', () => {
  it.each([
    ['anong oras na ba', 'tell_time'],
    ['Anong oras na?', 'tell_time'],
    ['ano oras na', 'tell_time'],
    ['what time is it', 'tell_time'],
    ['What time', 'tell_time'],
    ['anong time na', 'tell_time'],
    ['time', 'tell_time'],
    ['anong petsa ngayon', 'tell_date'],
    ['anong araw ngayon', 'tell_date'],
    ["what's the date", 'tell_date'],
    ['what day is it', 'tell_date'],
    ['ilang porsyento baterya', 'battery_level'],
    ['battery level', 'battery_level'],
    ['ulitin mo', 'repeat_last'],
    ['repeat that', 'repeat_last'],
  ])('"%s" -> %s', (phrase, intent) => {
    expect(matchRules(phrase)).toEqual({ intent, target: null, source: 'rule' });
  });

  it.each(['', '   ', 'tumawag kay kuya ben', 'patugtog ng musika', 'kumain ka na ba'])(
    '"%s" -> no rule match',
    (phrase) => {
      expect(matchRules(phrase)).toBeNull();
    },
  );
});
