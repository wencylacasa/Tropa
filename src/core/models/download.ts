import { MODEL_SPECS, partFileName, type ModelFiles, type ModelId, type ModelSpec } from './manager';
import { Sha256 } from './sha256';

/** File operations the downloader needs on top of the read-only lookups. */
export interface ModelFileOps extends ModelFiles {
  /** Creates the models directory if needed. */
  ensure(): void;
  /** No-op when the file does not exist. */
  remove(fileName: string): void;
  /** Same directory. The target must not exist. */
  rename(fromName: string, toName: string): void;
  /** Reads the file in order, `chunkSize` bytes at a time, awaiting each callback. */
  readChunks(
    fileName: string,
    chunkSize: number,
    onChunk: (chunk: Uint8Array) => Promise<void> | void,
  ): Promise<void>;
}

/** The only place that touches the network (Setup). Rejects on failure or abort. */
export interface ModelTransfer {
  /** Downloads `url` into the models directory as `fileName`. `total` is -1 when unknown. */
  download(
    url: string,
    fileName: string,
    onProgress: (bytes: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface NetworkGate {
  isOnWifi(): Promise<boolean>;
}

export type InstallProgress = {
  id: ModelId;
  phase: 'downloading' | 'verifying';
  bytes: number;
  totalBytes: number;
};

export type InstallOptions = {
  onProgress?: (progress: InstallProgress) => void;
  signal?: AbortSignal;
  /** Setup asks first; the default is Wi-Fi only (the models are 75-400 MB). */
  allowMobileData?: boolean;
  /** Skip the SHA-256 pass (slow on old phones). The exact size is still checked. */
  skipChecksum?: boolean;
};

export type InstallResult =
  | { result: 'installed' }
  | { result: 'already_installed' }
  | { result: 'not_wifi' }
  | { result: 'cancelled' }
  | { result: 'bad_size'; expected: number; actual: number }
  | { result: 'bad_checksum' }
  | { result: 'error'; message: string };

export const VERIFY_CHUNK_BYTES = 1024 * 1024;

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Downloads a model to `<file>.part`, checks size and SHA-256, and only then
 * renames it into place. A model file with its real name is therefore always
 * complete. Interrupted or failed downloads are deleted, not resumed (resume
 * across app restarts is not implemented; see TASKS.md).
 */
export class ModelDownloader {
  constructor(
    private readonly files: ModelFileOps,
    private readonly transfer: ModelTransfer,
    private readonly network: NetworkGate,
    private readonly specs: Record<ModelId, ModelSpec> = MODEL_SPECS,
  ) {}

  async install(id: ModelId, options: InstallOptions = {}): Promise<InstallResult> {
    const spec = this.specs[id];
    const part = partFileName(spec);
    const { files, transfer } = this;
    const { signal } = options;
    const report = (phase: InstallProgress['phase'], bytes: number, total: number) =>
      options.onProgress?.({ id, phase, bytes, totalBytes: total > 0 ? total : spec.sizeBytes });

    try {
      const existing = files.stat(spec.fileName);
      if (existing.exists && existing.size === spec.sizeBytes) return { result: 'already_installed' };

      if (!options.allowMobileData && !(await this.network.isOnWifi())) return { result: 'not_wifi' };
      if (signal?.aborted) return { result: 'cancelled' };

      files.ensure();
      files.remove(part); // a leftover from an earlier attempt

      try {
        await transfer.download(spec.url, part, (bytes, total) => report('downloading', bytes, total), signal);
      } catch (error) {
        files.remove(part);
        return signal?.aborted ? { result: 'cancelled' } : { result: 'error', message: messageOf(error) };
      }

      const got = files.stat(part);
      if (!got.exists || got.size !== spec.sizeBytes) {
        files.remove(part);
        return { result: 'bad_size', expected: spec.sizeBytes, actual: got.exists ? got.size : 0 };
      }

      if (!options.skipChecksum) {
        const hash = new Sha256();
        let done = 0;
        try {
          await files.readChunks(part, VERIFY_CHUNK_BYTES, async (chunk) => {
            if (signal?.aborted) throw new Error('aborted');
            hash.update(chunk);
            done += chunk.length;
            report('verifying', done, spec.sizeBytes);
            await yieldToEventLoop(); // keep the UI alive during the long hash
          });
        } catch (error) {
          files.remove(part);
          return signal?.aborted ? { result: 'cancelled' } : { result: 'error', message: messageOf(error) };
        }
        if (hash.digestHex() !== spec.sha256) {
          files.remove(part);
          return { result: 'bad_checksum' };
        }
      }

      files.remove(spec.fileName); // replaces an incomplete or corrupt earlier file
      files.rename(part, spec.fileName);
      return { result: 'installed' };
    } catch (error) {
      return { result: 'error', message: messageOf(error) };
    }
  }
}
