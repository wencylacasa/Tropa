import { defaultSettings, sanitizeSettings, type Settings } from './settings';

/** Where the JSON text lives. Synchronous so the store can be read at startup. */
export interface SettingsStorage {
  /** null when nothing has been saved yet. */
  read(): string | null;
  write(text: string): void;
}

export type SettingsListener = (settings: Settings) => void;

export type SettingsStoreOptions = {
  /** Called when reading or saving fails. The store keeps working in memory. */
  onError?: (error: unknown, phase: 'load' | 'save') => void;
};

/**
 * Persisted settings. A broken or missing file never stops the app: it loads
 * defaults, and the bad file is only replaced on the next update().
 */
export class SettingsStore {
  private current: Settings = defaultSettings();
  private readonly listeners = new Set<SettingsListener>();

  constructor(
    private readonly storage: SettingsStorage,
    private readonly options: SettingsStoreOptions = {},
  ) {}

  load(): Settings {
    try {
      const text = this.storage.read();
      this.current = text === null ? defaultSettings() : sanitizeSettings(JSON.parse(text));
    } catch (error) {
      this.current = defaultSettings();
      this.options.onError?.(error, 'load');
    }
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  /** Merges the patch, validates the result, saves, and notifies listeners. */
  update(patch: Partial<Settings>): Settings {
    this.current = sanitizeSettings({ ...this.current, ...patch }, this.current);
    this.persist();
    this.notify();
    return this.current;
  }

  reset(): Settings {
    this.current = defaultSettings();
    this.persist();
    this.notify();
    return this.current;
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private persist(): void {
    try {
      this.storage.write(JSON.stringify(this.current));
    } catch (error) {
      this.options.onError?.(error, 'save');
    }
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) listener(this.current);
  }
}
