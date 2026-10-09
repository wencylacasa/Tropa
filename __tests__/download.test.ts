import { ModelDownloader, type InstallProgress, type ModelFileOps, type ModelTransfer } from '@/core/models/download';
import { MODEL_SPECS, type ModelSpec } from '@/core/models/manager';
import { sha256Hex } from '@/core/models/sha256';

const CONTENT = Uint8Array.from({ length: 3000 }, (_, i) => (i * 7 + 3) % 256);
const SPEC: ModelSpec = {
  id: 'whisper-tiny',
  label: 'Test model',
  kind: 'stt',
  fileName: 'ggml-tiny.bin',
  url: 'https://example.test/models/ggml-tiny.bin',
  sizeBytes: CONTENT.length,
  sha256: sha256Hex(CONTENT),
  wrongVariantFileNames: [],
};
const SPECS = { ...MODEL_SPECS, 'whisper-tiny': SPEC };
const PART = 'ggml-tiny.bin.part';

function makeFs(initial: Record<string, Uint8Array> = {}) {
  const store = new Map<string, Uint8Array>(Object.entries(initial));
  const ops: string[] = [];
  const fs: ModelFileOps = {
    directory: '/models',
    stat: (name) => {
      const data = store.get(name);
      return data ? { exists: true, size: data.length } : { exists: false, size: 0 };
    },
    ensure: () => {
      ops.push('ensure');
    },
    remove: (name) => {
      ops.push(`remove:${name}`);
      store.delete(name);
    },
    rename: (from, to) => {
      const data = store.get(from);
      if (!data) throw new Error(`rename: ${from} is missing`);
      if (store.has(to)) throw new Error(`rename: ${to} already exists`);
      store.delete(from);
      store.set(to, data);
      ops.push(`rename:${from}>${to}`);
    },
    readChunks: async (name, _chunkSize, onChunk) => {
      const data = store.get(name);
      if (!data) throw new Error(`read: ${name} is missing`);
      for (let i = 0; i < data.length; i += 1000) await onChunk(data.subarray(i, i + 1000));
    },
  };
  return { fs, store, ops };
}

type Behaviour = (
  name: string,
  onProgress: (bytes: number, total: number) => void,
  signal?: AbortSignal,
) => Promise<void>;

function setup(options: { initial?: Record<string, Uint8Array>; wifi?: boolean; behaviour?: (store: Map<string, Uint8Array>) => Behaviour } = {}) {
  const { fs, store, ops } = makeFs(options.initial);
  const behaviour: Behaviour = options.behaviour
    ? options.behaviour(store)
    : async (name, onProgress) => {
        store.set(name, CONTENT);
        onProgress(CONTENT.length, CONTENT.length);
      };

  const transfer: ModelTransfer = {
    download: jest.fn(
      (_url: string, name: string, onProgress: (bytes: number, total: number) => void, signal?: AbortSignal) =>
        behaviour(name, onProgress, signal),
    ),
  };
  const network = { isOnWifi: jest.fn(async () => options.wifi ?? true) };
  const downloader = new ModelDownloader(fs, transfer, network, SPECS);
  return { downloader, store, ops, transfer, network };
}

describe('ModelDownloader.install', () => {
  it('downloads, verifies, and moves the file into place', async () => {
    const { downloader, store, transfer, network } = setup();
    const progress: InstallProgress[] = [];

    const result = await downloader.install('whisper-tiny', { onProgress: (p) => progress.push(p) });

    expect(result).toEqual({ result: 'installed' });
    expect(store.get(SPEC.fileName)).toEqual(CONTENT);
    expect(store.has(PART)).toBe(false);
    expect(network.isOnWifi).toHaveBeenCalledTimes(1);
    expect(transfer.download).toHaveBeenCalledWith(SPEC.url, PART, expect.any(Function), undefined);
    expect(progress).toEqual([
      { id: 'whisper-tiny', phase: 'downloading', bytes: 3000, totalBytes: 3000 },
      { id: 'whisper-tiny', phase: 'verifying', bytes: 1000, totalBytes: 3000 },
      { id: 'whisper-tiny', phase: 'verifying', bytes: 2000, totalBytes: 3000 },
      { id: 'whisper-tiny', phase: 'verifying', bytes: 3000, totalBytes: 3000 },
    ]);
  });

  it('falls back to the known size when the server sends no length', async () => {
    const { downloader } = setup({
      behaviour: (store) => async (name, onProgress) => {
        onProgress(1500, -1);
        store.set(name, CONTENT);
      },
    });
    const progress: InstallProgress[] = [];
    await downloader.install('whisper-tiny', { onProgress: (p) => progress.push(p), skipChecksum: true });
    expect(progress[0]).toMatchObject({ phase: 'downloading', bytes: 1500, totalBytes: 3000 });
  });

  it('does nothing when the model is already installed', async () => {
    const { downloader, transfer, network } = setup({ initial: { [SPEC.fileName]: CONTENT } });
    expect(await downloader.install('whisper-tiny')).toEqual({ result: 'already_installed' });
    expect(transfer.download).not.toHaveBeenCalled();
    expect(network.isOnWifi).not.toHaveBeenCalled();
  });

  it('refuses mobile data unless allowed', async () => {
    const off = setup({ wifi: false });
    expect(await off.downloader.install('whisper-tiny')).toEqual({ result: 'not_wifi' });
    expect(off.transfer.download).not.toHaveBeenCalled();
    expect(off.store.size).toBe(0);

    const on = setup({ wifi: false });
    expect(await on.downloader.install('whisper-tiny', { allowMobileData: true })).toEqual({ result: 'installed' });
    expect(on.network.isOnWifi).not.toHaveBeenCalled();
  });

  it('rejects a wrong-size download and leaves nothing behind', async () => {
    const { downloader, store } = setup({
      behaviour: (s) => async (name) => {
        s.set(name, CONTENT.subarray(0, 2000));
      },
    });
    expect(await downloader.install('whisper-tiny')).toEqual({ result: 'bad_size', expected: 3000, actual: 2000 });
    expect(store.size).toBe(0);
  });

  it('rejects a download that produced no file', async () => {
    const { downloader, store } = setup({ behaviour: () => async () => {} });
    expect(await downloader.install('whisper-tiny')).toEqual({ result: 'bad_size', expected: 3000, actual: 0 });
    expect(store.size).toBe(0);
  });

  it('rejects the right size with the wrong content', async () => {
    const corrupt = CONTENT.slice();
    corrupt[1234] ^= 0xff;
    const { downloader, store } = setup({
      behaviour: (s) => async (name) => {
        s.set(name, corrupt);
      },
    });
    expect(await downloader.install('whisper-tiny')).toEqual({ result: 'bad_checksum' });
    expect(store.size).toBe(0);
  });

  it('can skip the checksum but still checks the size', async () => {
    const corrupt = CONTENT.slice();
    corrupt[0] ^= 0xff;
    const { downloader, store } = setup({
      behaviour: (s) => async (name) => {
        s.set(name, corrupt);
      },
    });
    expect(await downloader.install('whisper-tiny', { skipChecksum: true })).toEqual({ result: 'installed' });
    expect(store.get(SPEC.fileName)).toEqual(corrupt);
  });

  it('reports transfer failures and cleans up the partial file', async () => {
    const { downloader, store } = setup({
      behaviour: (s) => async (name) => {
        s.set(name, CONTENT.subarray(0, 10));
        throw new Error('connection reset');
      },
    });
    expect(await downloader.install('whisper-tiny')).toEqual({ result: 'error', message: 'connection reset' });
    expect(store.size).toBe(0);
  });

  it('reports a cancel during the download', async () => {
    const controller = new AbortController();
    const { downloader, store } = setup({
      behaviour: (s) => async (name) => {
        s.set(name, CONTENT.subarray(0, 10));
        controller.abort();
        throw new Error('aborted by user');
      },
    });
    expect(await downloader.install('whisper-tiny', { signal: controller.signal })).toEqual({ result: 'cancelled' });
    expect(store.size).toBe(0);
  });

  it('does not start when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const { downloader, transfer } = setup();
    expect(await downloader.install('whisper-tiny', { signal: controller.signal })).toEqual({ result: 'cancelled' });
    expect(transfer.download).not.toHaveBeenCalled();
  });

  it('reports a cancel during verification and removes the partial file', async () => {
    const controller = new AbortController();
    const { downloader, store } = setup();
    const result = await downloader.install('whisper-tiny', {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.phase === 'verifying') controller.abort();
      },
    });
    expect(result).toEqual({ result: 'cancelled' });
    expect(store.size).toBe(0);
  });

  it('replaces an incomplete earlier file', async () => {
    const { downloader, store } = setup({ initial: { [SPEC.fileName]: CONTENT.subarray(0, 500) } });
    expect(await downloader.install('whisper-tiny')).toEqual({ result: 'installed' });
    expect(store.get(SPEC.fileName)).toEqual(CONTENT);
  });

  it('removes a stale .part file before downloading', async () => {
    let partPresentAtStart: boolean | null = null;
    const { downloader } = setup({
      initial: { [PART]: CONTENT.subarray(0, 100) },
      behaviour: (s) => async (name) => {
        partPresentAtStart = s.has(name);
        s.set(name, CONTENT);
      },
    });
    expect(await downloader.install('whisper-tiny')).toEqual({ result: 'installed' });
    expect(partPresentAtStart).toBe(false);
  });

  it('never leaves the real file name in place until verification passed', async () => {
    const corrupt = CONTENT.slice();
    corrupt[5] ^= 0xff;
    const seenDuringVerify: boolean[] = [];
    const { downloader, store } = setup({
      behaviour: (s) => async (name) => {
        s.set(name, corrupt);
      },
    });
    await downloader.install('whisper-tiny', {
      onProgress: (p) => {
        if (p.phase === 'verifying') seenDuringVerify.push(store.has(SPEC.fileName));
      },
    });
    expect(seenDuringVerify.length).toBeGreaterThan(0);
    expect(seenDuringVerify.every((present) => !present)).toBe(true);
  });
});
