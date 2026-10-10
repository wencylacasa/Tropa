/**
 * In-memory ring buffer of pipeline events, for the on-screen "Logs" panel.
 * Separate from triggerLogger (which writes to a file for support): this one
 * is live, cheap, and safe on every platform including web.
 */

export type LogEntry = {
  ts: number;
  tag: string;
  message: string;
};

const MAX_ENTRIES = 100;

class AppLogStore {
  private entries: LogEntry[] = [];
  private readonly listeners = new Set<() => void>();

  get = (): LogEntry[] => this.entries;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  add(tag: string, message: string): void {
    this.entries = [...this.entries.slice(-(MAX_ENTRIES - 1)), { ts: Date.now(), tag, message }];
    for (const listener of Array.from(this.listeners)) listener();
  }

  clear(): void {
    if (this.entries.length === 0) return;
    this.entries = [];
    for (const listener of Array.from(this.listeners)) listener();
  }
}

export const appLog = new AppLogStore();

export function logEvent(tag: string, message: string): void {
  appLog.add(tag, message);
}
