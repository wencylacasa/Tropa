import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { PipelineState, TriggerOutcome } from './states';

export type OrchestratorStatus = {
  state: PipelineState;
  isMuted: boolean;
  lastHeard: string | null;
  lastReply: string | null;
  lastOutcome: TriggerOutcome | null;
};

type OrchestratorContextValue = {
  status: OrchestratorStatus;
  toggleMute: () => void;
  setState: (state: PipelineState) => void;
  setLastHeard: (text: string) => void;
  setLastReply: (text: string) => void;
  setLastOutcome: (outcome: TriggerOutcome) => void;
};

const OrchestratorContext = createContext<OrchestratorContextValue | null>(null);

export function OrchestratorProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OrchestratorStatus>({
    state: 'idle',
    isMuted: false,
    lastHeard: null,
    lastReply: null,
    lastOutcome: null,
  });

  const toggleMute = useCallback(() => {
    setStatus((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const setState = useCallback((state: PipelineState) => {
    setStatus((prev) => ({ ...prev, state }));
  }, []);

  const setLastHeard = useCallback((text: string) => {
    setStatus((prev) => ({ ...prev, lastHeard: text }));
  }, []);

  const setLastReply = useCallback((text: string) => {
    setStatus((prev) => ({ ...prev, lastReply: text }));
  }, []);

  const setLastOutcome = useCallback((outcome: TriggerOutcome) => {
    setStatus((prev) => ({ ...prev, lastOutcome: outcome }));
  }, []);

  return (
    <OrchestratorContext.Provider value={{ status, toggleMute, setState, setLastHeard, setLastReply, setLastOutcome }}>
      {children}
    </OrchestratorContext.Provider>
  );
}

export function useOrchestrator(): OrchestratorContextValue {
  const ctx = useContext(OrchestratorContext);
  if (!ctx) throw new Error('useOrchestrator must be used within an OrchestratorProvider');
  return ctx;
}
