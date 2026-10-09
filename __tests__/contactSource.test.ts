import {
  createContactSource,
  normalizePhone,
  pickPhone,
  toDialableContacts,
  type ContactsBackend,
  type RawContactRow,
} from '@/core/system/contactSource';

describe('normalizePhone', () => {
  it('strips formatting and keeps a leading +', () => {
    expect(normalizePhone('+63 917-123-4567')).toBe('+639171234567');
    expect(normalizePhone('(0917) 123 4567')).toBe('09171234567');
  });

  it('rejects empty or too-short numbers', () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('ext.')).toBeNull();
  });

  it('keeps short emergency numbers', () => {
    expect(normalizePhone('911')).toBe('911');
  });
});

describe('pickPhone', () => {
  it('prefers a mobile/cell number', () => {
    expect(
      pickPhone([
        { label: 'home', number: '028111111' },
        { label: 'Mobile', number: '09171234567' },
      ]),
    ).toBe('09171234567');
    expect(pickPhone([{ label: 'work', number: '1234' }, { label: 'cell', number: '5678' }])).toBe('5678');
  });

  it('falls back to the first usable number', () => {
    expect(pickPhone([{ number: 'x' }, { label: 'home', number: '028111111' }])).toBe('028111111');
  });

  it('returns null when nothing is dialable', () => {
    expect(pickPhone([])).toBeNull();
    expect(pickPhone(null)).toBeNull();
    expect(pickPhone([{ label: 'mobile' }])).toBeNull();
  });
});

describe('toDialableContacts', () => {
  it('keeps id, trimmed name and phone', () => {
    expect(
      toDialableContacts([{ id: '1', name: '  Kuya Ben ', phones: [{ label: 'mobile', number: '0917 111 2222' }] }]),
    ).toEqual([{ id: '1', name: 'Kuya Ben', phone: '09171112222' }]);
  });

  it('drops contacts with no name or no usable number', () => {
    const rows: RawContactRow[] = [
      { id: '1', name: null, phones: [{ number: '09171112222' }] },
      { id: '2', name: '   ', phones: [{ number: '09171112222' }] },
      { id: '3', name: 'No Number', phones: [] },
      { id: '4', name: 'Bad Number', phones: [{ number: 'n/a' }] },
      { id: '5', name: 'Ate Rose', phones: [{ number: '09173334444' }] },
    ];
    expect(toDialableContacts(rows)).toEqual([{ id: '5', name: 'Ate Rose', phone: '09173334444' }]);
  });
});

function fakeBackend(rows: RawContactRow[], granted = true) {
  const state = { rows, granted, reads: 0 };
  const backend: ContactsBackend = {
    hasPermission: async () => state.granted,
    getRows: async () => {
      state.reads += 1;
      return state.rows;
    },
  };
  return { state, backend };
}

const ben: RawContactRow = { id: '1', name: 'Kuya Ben', phones: [{ number: '09171112222' }] };

describe('createContactSource', () => {
  it('returns an empty list without permission and never reads the address book', async () => {
    const { state, backend } = fakeBackend([ben], false);
    const source = createContactSource(backend);
    expect(await source.getContacts()).toEqual([]);
    expect(state.reads).toBe(0);
  });

  it('picks up permission granted later (denied result is not cached)', async () => {
    const { state, backend } = fakeBackend([ben], false);
    const source = createContactSource(backend);
    await source.getContacts();
    state.granted = true;
    expect(await source.getContacts()).toHaveLength(1);
  });

  it('caches within the ttl and reloads after it', async () => {
    const { state, backend } = fakeBackend([ben]);
    let t = 0;
    const source = createContactSource(backend, { ttlMs: 1000, now: () => t });
    await source.getContacts();
    t = 999;
    await source.getContacts();
    expect(state.reads).toBe(1);
    t = 1000;
    await source.getContacts();
    expect(state.reads).toBe(2);
  });

  it('reloads after invalidate()', async () => {
    const { state, backend } = fakeBackend([ben]);
    const source = createContactSource(backend);
    await source.getContacts();
    source.invalidate();
    await source.getContacts();
    expect(state.reads).toBe(2);
  });

  it('shares one read between overlapping calls', async () => {
    const { state, backend } = fakeBackend([ben]);
    const source = createContactSource(backend);
    const [a, b] = await Promise.all([source.getContacts(), source.getContacts()]);
    expect(state.reads).toBe(1);
    expect(a).toBe(b);
  });

  it('does not cache an empty address book', async () => {
    const { state, backend } = fakeBackend([]);
    const source = createContactSource(backend);
    await source.getContacts();
    await source.getContacts();
    expect(state.reads).toBe(2);
  });
});
