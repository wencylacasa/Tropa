import { toBatteryPercent } from '@/core/system/batteryPercent';
import { CONFIDENT, NONE, SUSPICIOUS, estimateConfidence } from '@/core/stt/sttConfidence';

describe('estimateConfidence', () => {
  it.each(['', '   ', '[BLANK_AUDIO]', '(music)', '♪ la la ♪', '...', '123'])(
    '"%s" -> none',
    (text) => {
      expect(estimateConfidence(text)).toBe(NONE);
    },
  );

  it.each(['Thank you.', 'thanks for watching!', 'You', 'Salamat sa panonood', 'ya ya ya ya ya ya'])(
    '"%s" -> suspicious (silence hallucination or looping)',
    (text) => {
      expect(estimateConfidence(text)).toBe(SUSPICIOUS);
    },
  );

  it.each(['Yah anong oras na ba', 'Tropa', 'anong petsa ngayon', 'sige', 'kuya ben tawag'])(
    '"%s" -> confident',
    (text) => {
      expect(estimateConfidence(text)).toBe(CONFIDENT);
    },
  );

  it('does not flag a long sentence with some repeated words', () => {
    expect(estimateConfidence('oo oo sige tawag na kay kuya ben')).toBe(CONFIDENT);
  });
});

describe('toBatteryPercent', () => {
  it('converts 0..1 to a whole percent', () => {
    expect(toBatteryPercent(0.759999)).toBe(76);
    expect(toBatteryPercent(0)).toBe(0);
    expect(toBatteryPercent(1)).toBe(100);
  });

  it('returns null when the level is unavailable or invalid', () => {
    expect(toBatteryPercent(-1)).toBeNull();
    expect(toBatteryPercent(NaN)).toBeNull();
  });
});
