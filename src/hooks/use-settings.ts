import { useSyncExternalStore } from 'react';

import { getServices } from '@/core/app/services';
import type { Settings } from '@/core/settings/settings';

/** Live persisted settings plus the store for updates. */
export function useSettings() {
  const store = getServices().settings;
  const settings = useSyncExternalStore<Settings>(
    (onChange) => store.subscribe(onChange),
    () => store.get(),
  );
  return { settings, store };
}
