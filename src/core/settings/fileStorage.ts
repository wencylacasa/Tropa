import { File, Paths } from 'expo-file-system';

import type { SettingsStorage } from './store';

/**
 * Settings as one JSON file in the app's document directory (safe from the
 * system clearing it, unlike cache). Uses the SDK 57 File API; no extra package.
 */
export function createFileSettingsStorage(fileName = 'settings.json'): SettingsStorage {
  const file = new File(Paths.document, fileName);

  return {
    read() {
      return file.exists ? file.textSync() : null;
    },
    write(text) {
      if (!file.exists) file.create({ intermediates: true });
      file.write(text); // replaces the content (append defaults to false)
    },
  };
}
