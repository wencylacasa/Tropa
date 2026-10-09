import { verifyWakeWord } from '@/core/wake/verify';
import { isFuzzyMatch, levenshtein, normalizeWord } from '@/core/wake/fuzzyMatch';

describe('fuzzyMatch', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('collapses spelling variants', () => {
    expect(normalizeWord('Yaah')).toBe(normalizeWord('ya'));
    expect(normalizeWord('Troppa')).toBe(normalizeWord('tropa'));
  });

  it('is strict for very short words', () => {
    expect(isFuzzyMatch('to', 'tol')).toBe(false);
    expect(isFuzzyMatch('toy', 'tol')).toBe(false);
    expect(isFuzzyMatch('tropa', 'trupa')).toBe(true);
  });
});

describe('verifyWakeWord', () => {
  it('strips the wake word and keeps the command', () => {
    expect(verifyWakeWord('Yah anong oras na ba')).toEqual({
      matched: true,
      wakeWord: 'yah',
      command: 'anong oras na ba',
      isEmptyCommand: false,
    });
  });

  it('ignores punctuation after the wake word', () => {
    const r = verifyWakeWord('Yah, anong oras na ba?');
    expect(r).toMatchObject({ matched: true, wakeWord: 'yah', command: 'anong oras na ba?' });
  });

  it('matches the two-word wake phrase', () => {
    expect(verifyWakeWord('Hoy yah, anong oras')).toMatchObject({
      matched: true,
      wakeWord: 'hoy yah',
      command: 'anong oras',
    });
  });

  it('flags an empty command', () => {
    expect(verifyWakeWord('Tropa')).toMatchObject({ matched: true, isEmptyCommand: true });
    expect(verifyWakeWord('tol.')).toMatchObject({ matched: true, isEmptyCommand: true });
  });

  it('accepts Whisper spelling variants', () => {
    expect(verifyWakeWord('Troppa anong oras')).toMatchObject({ matched: true, wakeWord: 'tropa' });
    expect(verifyWakeWord('Tols anong oras')).toMatchObject({ matched: true, wakeWord: 'tol' });
    expect(verifyWakeWord('Yeah anong oras')).toMatchObject({ matched: true, wakeWord: 'yah' });
  });

  it('rejects clips without a wake word at the start', () => {
    expect(verifyWakeWord('Anong oras na')).toEqual({ matched: false });
    expect(verifyWakeWord('ang kuya ko ay nasa bahay')).toEqual({ matched: false });
    expect(verifyWakeWord('to anong oras')).toEqual({ matched: false });
    expect(verifyWakeWord('Hoy anong oras')).toEqual({ matched: false });
    expect(verifyWakeWord('')).toEqual({ matched: false });
    expect(verifyWakeWord('   ')).toEqual({ matched: false });
  });

  it('honours a custom wake word list', () => {
    const custom = [{ word: 'boss', variants: ['boss', 'bos'] }];
    expect(verifyWakeWord('Boss oras na?', custom)).toMatchObject({ matched: true, wakeWord: 'boss' });
    expect(verifyWakeWord('Yah oras na?', custom)).toEqual({ matched: false });
  });
});
