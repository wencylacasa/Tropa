import { File, Paths } from 'expo-file-system';
import type { TriggerOutcome } from '../pipeline/states';

// Null where expo-file-system has no backend (web); all methods no-op then.
function createLogFile(): File | null {
  try {
    return new File(Paths.document, 'trigger_logs.jsonl');
  } catch {
    return null;
  }
}

export const LOG_FILE = createLogFile();

export type LogEntry = {
  timestamp: string;
  durationMs: number;
} & TriggerOutcome;

export const triggerLogger = {
  /** Appends a single outcome as a JSONL line. */
  async log(outcome: TriggerOutcome, durationMs: number): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      durationMs,
      ...outcome,
    };
    
    const file = LOG_FILE;
    if (!file) return;

    try {
      const line = JSON.stringify(entry) + '\n';
      if (!file.exists) {
        file.create({ intermediates: true });
      }
      file.write(line, { append: true });
    } catch {
      // Best effort; ignore logging failures.
    }
  },

  /** Reads the last N logs. Returns empty array if file missing. */
  async readLogs(linesCount = 50): Promise<LogEntry[]> {
    const file = LOG_FILE;
    if (!file) return [];

    try {
      if (!file.exists) return [];

      const content = file.textSync();
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.slice(-linesCount).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  },

  /** Clears the log file. */
  async clearLogs(): Promise<void> {
    const file = LOG_FILE;
    if (!file) return;

    try {
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Ignored
    }
  },
};
