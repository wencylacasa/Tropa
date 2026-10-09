import { ModelDownloader } from '../models/download';
import { createFileModelFiles } from '../models/fileModelFiles';
import { ModelManager } from '../models/manager';
import { expoNetworkGate } from '../models/networkGate';
import { createFileSettingsStorage } from '../settings/fileStorage';
import { SettingsStore } from '../settings/store';

type Services = {
  settings: SettingsStore;
  models: ModelManager;
  downloader: ModelDownloader;
};

let services: Services | null = null;

/**
 * App-wide singletons backed by the real device adapters. Created on first use
 * (not at import) so screens and tests can import this module freely.
 */
export function getServices(): Services {
  if (services) return services;

  const settings = new SettingsStore(createFileSettingsStorage(), {
    onError: (error, phase) => console.warn(`[settings] ${phase} failed`, error),
  });
  settings.load();

  const files = createFileModelFiles();
  services = {
    settings,
    models: new ModelManager(files),
    downloader: new ModelDownloader(files, files, expoNetworkGate),
  };
  return services;
}
