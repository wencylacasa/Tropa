import { Platform } from 'react-native';

import { ModelDownloader, type ModelFileOps, type ModelTransfer } from '../models/download';
import { createFileModelFiles } from '../models/fileModelFiles';
import { ModelManager } from '../models/manager';
import { expoNetworkGate } from '../models/networkGate';
import { createFileSettingsStorage } from '../settings/fileStorage';
import { SettingsStore, type SettingsStorage } from '../settings/store';

type Services = {
  settings: SettingsStore;
  models: ModelManager;
  downloader: ModelDownloader;
};

let services: Services | null = null;

const isWeb = Platform.OS === 'web';

// expo-file-system has no web backend; persist settings in localStorage so the
// web preview still works.
function createWebSettingsStorage(): SettingsStorage {
  const key = 'tropa.settings';
  return {
    read() {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(text) {
      try {
        globalThis.localStorage?.setItem(key, text);
      } catch {
        // Storage unavailable (e.g. SSR): keep defaults.
      }
    },
  };
}

const webFiles: ModelFileOps & ModelTransfer = {
  directory: '',
  stat: () => ({ exists: false, size: 0 }),
  ensure() {},
  remove() {},
  rename() {},
  async readChunks() {
    throw new Error('File access is not supported on web');
  },
  async download() {
    throw new Error('Model downloads are not supported on web');
  },
};

/**
 * App-wide singletons backed by the real device adapters. Created on first use
 * (not at import) so screens and tests can import this module freely.
 */
export function getServices(): Services {
  if (services) return services;

  const settings = new SettingsStore(isWeb ? createWebSettingsStorage() : createFileSettingsStorage(), {
    onError: (error, phase) => console.warn(`[settings] ${phase} failed`, error),
  });
  settings.load();

  const files = isWeb ? webFiles : createFileModelFiles();
  services = {
    settings,
    models: new ModelManager(files),
    downloader: new ModelDownloader(files, files, expoNetworkGate),
  };
  return services;
}
