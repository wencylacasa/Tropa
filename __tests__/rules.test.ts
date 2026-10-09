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
    ['patugtog ng musika', 'media_play'],
    ['play music', 'media_play'],
    ['tigil muna', 'media_pause'],
    ['pause', 'media_pause'],
    ['stop the music', 'media_pause'],
    ['sunod', 'media_next'],
    ['next song', 'media_next'],
    ['hinaan mo', 'volume_down'],
    ['volume down', 'volume_down'],
    ['lakasan mo', 'volume_up'],
    ['volume up', 'volume_up'],
    ['make it louder', 'volume_up'],
  ])('"%s" -> %s', (phrase, intent) => {
    expect(matchRules(phrase)).toEqual({ intent, target: null, source: 'rule' });
  });

  it.each([
    ['tawagan si kuya ben', 'kuya ben'],
    ['Tumawag kay Ate Rose', 'ate rose'],
    ['tawagan mo si Ben', 'ben'],
    ['call Ben', 'ben'],
    ['call kuya ben po', 'kuya ben po'],
  ])('"%s" -> call_contact (%s)', (phrase, target) => {
    expect(matchRules(phrase)).toEqual({ intent: 'call_contact', target, source: 'rule' });
  });

  it.each(['', '   ', 'call me back', 'tumawag', 'call', 'kumain ka na ba'])(
    '"%s" -> no rule match',
    (phrase) => {
      expect(matchRules(phrase)).toBeNull();
    },
  );
});
