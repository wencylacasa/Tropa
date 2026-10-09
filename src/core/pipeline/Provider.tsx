import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import { getAssistant } from '../app/assistant';
import type { AssistantStatus } from '../app/status';

type OrchestratorContextValue = {
  status: AssistantStatus;
  /** Starts the mic + detector (no-op when muted or already running). */
  start: () => Promise<void>;
  toggleMute: () => Promise<void>;
};

const OrchestratorContext = createContext<OrchestratorContextValue | null>(null);

/** Exposes the real assistant (see core/app/assistant.ts) to the screens. */
export function OrchestratorProvider({ children }: { children: ReactNode }) {
  const { runtime, status: store } = getAssistant();
  const status = useSyncExternalStore(store.subscribe, store.get);

  const value = useMemo<OrchestratorContextValue>(
    () => ({
      status,
      start: () => runtime.start(),
      toggleMute: () => runtime.setMuted(!status.muted),
    }),
    [runtime, status],
  );

  return <OrchestratorContext.Provider value={value}>{children}</OrchestratorContext.Provider>;
}

export function useOrchestrator(): OrchestratorContextValue {
  const ctx = useContext(OrchestratorContext);
  if (!ctx) throw new Error('useOrchestrator must be used within an OrchestratorProvider');
  return ctx;
}
