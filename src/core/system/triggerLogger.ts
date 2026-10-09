import { File, Paths } from 'expo-file-system';
import type { TriggerOutcome } from '../pipeline/states';

export const LOG_FILE = new File(Paths.document, 'trigger_logs.jsonl');

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
    
    try {
      const line = JSON.stringify(entry) + '\n';
      if (!LOG_FILE.exists) {
        LOG_FILE.create({ intermediates: true });
      }
      LOG_FILE.write(line, { append: true });
    } catch {
      // Best effort; ignore logging failures.
    }
  },

  /** Reads the last N logs. Returns empty array if file missing. */
  async readLogs(linesCount = 50): Promise<LogEntry[]> {
    try {
      if (!LOG_FILE.exists) return [];
      
      const content = LOG_FILE.textSync();
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.slice(-linesCount).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  },

  /** Clears the log file. */
  async clearLogs(): Promise<void> {
    try {
      if (LOG_FILE.exists) {
        LOG_FILE.delete();
      }
    } catch {
      // Ignored
    }
  },
};
