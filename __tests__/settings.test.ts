import {
    MAX_EMERGENCY_CONTACTS,
    MAX_WAKE_WORDS,
    defaultSettings,
    sanitizeSettings,
} from '@/core/settings/settings';
import { SettingsStore, type SettingsStorage } from '@/core/settings/store';
import { DEFAULT_WAKE_WORDS } from '@/core/wake/wakeWords';

function memoryStorage(initial: string | null = null) {
  const state = { text: initial, writes: 0 };
  const storage: SettingsStorage = {
    read: () => state.text,
    write: (text) => {
      state.text = text;
      state.writes++;
    },
  };
  return { storage, state };
}

describe('sanitizeSettings', () => {
  it('gives defaults for garbage input', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}]) {
      expect(sanitizeSettings(raw)).toEqual(defaultSettings());
    }
  });

  it('defaults match the plan (vosk, high sensitivity, tiny, English, tropa is a wake word)', () => {
    const d = defaultSettings();
    expect(d).toMatchObject({
      detector: 'vosk',
      detectorSensitivity: 'high',
      whisperModel: 'tiny',
      replyLanguage: 'en',
      llmEnabled: true,
      keepModelLoaded: true,
    });
    expect(d.wakeWords.map((w) => w.word)).toContain('tropa');
  });

  it('does not share default arrays between calls', () => {
    const a = defaultSettings();
    a.wakeWords[0].variants.push('mutated');
    a.wakeWords.pop();
    expect(defaultSettings().wakeWords).toEqual(DEFAULT_WAKE_WORDS);
  });

  it('replaces invalid enum and boolean values with the base value', () => {
    const s = sanitizeSettings({
      detector: 'porcupine',
      detectorSensitivity: 'extreme',
      whisperModel: 'large',
      replyLanguage: 'fr',
      keepModelLoaded: 'yes',
      llmEnabled: 0,
      debug: 'true',
      logging: null,
    });
    expect(s).toEqual(defaultSettings());
  });

  it('keeps valid values', () => {
    const s = sanitizeSettings({
      detector: 'sherpa',
      detectorSensitivity: 'low',
      whisperModel: 'base',
      replyLanguage: 'tl',
      keepModelLoaded: true,
      llmEnabled: false,
      debug: true,
      logging: true,
      ttsVoice: ' en-us-x-tpd-local ',
    });
    expect(s).toMatchObject({
      detector: 'sherpa',
      detectorSensitivity: 'low',
      whisperModel: 'base',
      replyLanguage: 'tl',
      keepModelLoaded: true,
      llmEnabled: false,
      debug: true,
      logging: true,
      ttsVoice: 'en-us-x-tpd-local',
    });
  });

  it('normalises, dedupes and filters wake words', () => {
    const s = sanitizeSettings({
      wakeWords: [
        { word: '  Hoy   YAH ', variants: ['Hoy Ya', 'hoy ya', '', 5, 'x'.repeat(31)] },
        { word: 'hoy yah', variants: [] }, // duplicate word
        { word: '', variants: ['a'] },
        { word: 'y'.repeat(31), variants: [] },
        { variants: ['no word'] },
        'tol',
        null,
        { word: 'Tol' },
      ],
    });
    expect(s.wakeWords).toEqual([
      { word: 'hoy yah', variants: ['hoy ya'] },
      { word: 'tol', variants: [] },
    ]);
  });

  it('never ends up with an empty wake word list', () => {
    expect(sanitizeSettings({ wakeWords: [] }).wakeWords).toEqual(DEFAULT_WAKE_WORDS);
    expect(sanitizeSettings({ wakeWords: [{ word: '' }, 7] }).wakeWords).toEqual(DEFAULT_WAKE_WORDS);
    expect(sanitizeSettings({ wakeWords: 'yah' }).wakeWords).toEqual(DEFAULT_WAKE_WORDS);
  });

  it('caps the number of wake words', () => {
    const many = Array.from({ length: MAX_WAKE_WORDS + 10 }, (_, i) => ({ word: `word${i}`, variants: [] }));
    expect(sanitizeSettings({ wakeWords: many }).wakeWords).toHaveLength(MAX_WAKE_WORDS);
  });

  it('keeps only emergency contacts with a name and a plausible phone number', () => {
    const s = sanitizeSettings({
      emergencyContacts: [
        { name: ' Kuya Ben ', phone: ' +63 917 123 4567 ' },
        { name: 'Nanay', phone: '(02) 8123-4567' },
        { name: '', phone: '09171234567' },
        { name: 'Bad', phone: 'call me' },
        { name: 'Short', phone: '12' },
        { name: 'Letters', phone: '0917abc4567' },
        { name: 'NoPhone' },
        'Ate',
      ],
    });
    expect(s.emergencyContacts).toEqual([
      { name: 'Kuya Ben', phone: '+63 917 123 4567' },
      { name: 'Nanay', phone: '(02) 8123-4567' },
    ]);
  });

  it('caps emergency contacts', () => {
    const many = Array.from({ length: MAX_EMERGENCY_CONTACTS + 3 }, (_, i) => ({
      name: `C${i}`,
      phone: `0917000000${i}`,
    }));
    expect(sanitizeSettings({ emergencyContacts: many }).emergencyContacts).toHaveLength(MAX_EMERGENCY_CONTACTS);
  });

  it('treats an empty or blank ttsVoice as the engine default (null)', () => {
    expect(sanitizeSettings({ ttsVoice: '' }).ttsVoice).toBeNull();
    expect(sanitizeSettings({ ttsVoice: '   ' }).ttsVoice).toBeNull();
    expect(sanitizeSettings({ ttsVoice: 42 }).ttsVoice).toBeNull();
  });
});

describe('SettingsStore', () => {
  it('loads defaults when nothing is saved, without writing', () => {
    const { storage, state } = memoryStorage(null);
    const store = new SettingsStore(storage);
    expect(store.load()).toEqual(defaultSettings());
    expect(state.writes).toBe(0);
  });

  it('loads saved settings and fills in fields missing from an older file', () => {
    const { storage } = memoryStorage(JSON.stringify({ whisperModel: 'base', debug: true }));
    const store = new SettingsStore(storage);
    expect(store.load()).toEqual({ ...defaultSettings(), whisperModel: 'base', debug: true });
  });

  it('falls back to defaults on corrupt JSON, reports it, and keeps the bad file until an update', () => {
    const { storage, state } = memoryStorage('{not json');
    const onError = jest.fn();
    const store = new SettingsStore(storage, { onError });

    expect(store.load()).toEqual(defaultSettings());
    expect(onError).toHaveBeenCalledWith(expect.anything(), 'load');
    expect(state.text).toBe('{not json');

    store.update({ debug: true });
    expect(JSON.parse(state.text as string)).toMatchObject({ debug: true });
  });

  it('falls back to defaults when reading throws', () => {
    const onError = jest.fn();
    const store = new SettingsStore(
      {
        read: () => {
          throw new Error('disk gone');
        },
        write: () => {},
      },
      { onError },
    );
    expect(store.load()).toEqual(defaultSettings());
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'load');
  });

  it('update merges, saves, and a new store reads the same values back', () => {
    const { storage } = memoryStorage();
    const first = new SettingsStore(storage);
    first.load();
    first.update({ whisperModel: 'base', emergencyContacts: [{ name: 'Nanay', phone: '09171234567' }] });
    first.update({ keepModelLoaded: true });

    const second = new SettingsStore(storage);
    expect(second.load()).toEqual(first.get());
    expect(second.get()).toMatchObject({
      whisperModel: 'base',
      keepModelLoaded: true,
      emergencyContacts: [{ name: 'Nanay', phone: '09171234567' }],
    });
  });

  it('rejects invalid patch values and keeps the previous ones', () => {
    const { storage } = memoryStorage();
    const store = new SettingsStore(storage);
    store.load();
    store.update({ whisperModel: 'base', wakeWords: [{ word: 'tol', variants: [] }] });

    store.update({ whisperModel: 'huge' as never, wakeWords: [] });
    expect(store.get().whisperModel).toBe('base');
    expect(store.get().wakeWords).toEqual([{ word: 'tol', variants: [] }]);
  });

  it('can clear the TTS voice and the emergency contacts with an update', () => {
    const { storage } = memoryStorage();
    const store = new SettingsStore(storage);
    store.load();
    store.update({ ttsVoice: 'voice-1', emergencyContacts: [{ name: 'Nanay', phone: '09171234567' }] });
    store.update({ ttsVoice: null, emergencyContacts: [] });
    expect(store.get().ttsVoice).toBeNull();
    expect(store.get().emergencyContacts).toEqual([]);
  });

  it('keeps working in memory when saving fails', () => {
    const onError = jest.fn();
    const store = new SettingsStore(
      {
        read: () => null,
        write: () => {
          throw new Error('disk full');
        },
      },
      { onError },
    );
    store.load();
    expect(store.update({ debug: true }).debug).toBe(true);
    expect(store.get().debug).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'save');
  });

  it('notifies subscribers on update and reset, and stops after unsubscribe', () => {
    const { storage } = memoryStorage();
    const store = new SettingsStore(storage);
    store.load();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    store.update({ debug: true });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ debug: true }));

    store.reset();
    expect(listener).toHaveBeenLastCalledWith(defaultSettings());
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.update({ debug: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
