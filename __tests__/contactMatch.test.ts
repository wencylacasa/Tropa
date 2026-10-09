import { matchContact, type Contact } from '@/core/system/contactMatch';

const c = (id: string, name: string): Contact => ({ id, name });

describe('matchContact', () => {
  const contacts = [
    c('1', 'Kuya Ben'),
    c('2', 'Ate Rose'),
    c('3', 'Mama'),
    c('4', 'Jun Santos'),
    c('5', 'Jun Cruz'),
    c('6', 'Carlo'),
  ];

  it('matches with titles', () => {
    expect(matchContact('Kuya Ben', contacts)).toEqual({ status: 'match', contact: contacts[0] });
    expect(matchContact('si ate rose', contacts)).toEqual({ status: 'match', contact: contacts[1] });
  });

  it('matches the name without the title', () => {
    expect(matchContact('Ben', contacts)).toEqual({ status: 'match', contact: contacts[0] });
    expect(matchContact('rose', contacts)).toEqual({ status: 'match', contact: contacts[1] });
  });

  it('tolerates small transcription errors on longer names', () => {
    expect(matchContact('Karlo', contacts)).toEqual({ status: 'match', contact: contacts[5] });
  });

  it('matches a title-only contact only on the exact name', () => {
    expect(matchContact('Mama', contacts)).toEqual({ status: 'match', contact: contacts[2] });
    expect(matchContact('Kuya', contacts)).toEqual({ status: 'none' });
  });

  it('prefers the contact that also matches the title', () => {
    const list = [c('a', 'Ben'), c('b', 'Kuya Ben')];
    expect(matchContact('Kuya Ben', list)).toEqual({ status: 'match', contact: list[1] });
  });

  it('is ambiguous when several contacts tie (never guess)', () => {
    const r = matchContact('Jun', contacts);
    expect(r.status).toBe('ambiguous');
    if (r.status === 'ambiguous') expect(r.contacts.map((x) => x.id)).toEqual(['4', '5']);
    expect(matchContact('Jun Cruz', contacts)).toEqual({ status: 'match', contact: contacts[4] });
  });

  it('returns none for unknown or empty names', () => {
    expect(matchContact('Pedro', contacts)).toEqual({ status: 'none' });
    expect(matchContact('', contacts)).toEqual({ status: 'none' });
    expect(matchContact('Ben', [])).toEqual({ status: 'none' });
  });
});
