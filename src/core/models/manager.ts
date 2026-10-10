import type { WhisperModel } from '../settings/settings';

export type ModelId = 'whisper-tiny' | 'whisper-base' | 'qwen3-0.6b';

export type ModelSpec = {
  id: ModelId;
  label: string;
  kind: 'stt' | 'llm';
  /** Exact file name the app looks for in the models directory. */
  fileName: string;
  /** Where Setup downloads it from. Pinned to a commit so the hash below stays valid. */
  url: string;
  /** Exact size in bytes. A file with any other size is never treated as installed. */
  sizeBytes: number;
  /** Lowercase hex SHA-256 (kept for reference; verified by the JS fallback path). */
  sha256: string;
  /** Lowercase hex MD5 — checked natively after the download (much faster than JS SHA-256). */
  md5: string;
  /** Files that look right but are the wrong build (English-only Whisper cannot do Tagalog). */
  wrongVariantFileNames: string[];
};

/**
 * Sizes and hashes come from the Hugging Face API for these exact commits
 * (ggerganov/whisper.cpp @ 5359861c, unsloth/Qwen3-0.6B-GGUF @ 50968a44).
 * Re-check them if you bump a commit or switch to another source.
 */
const WHISPER_REVISION = '5359861c739e955e79d9a303bcbc70fb988958b1';
const QWEN_REVISION = '50968a4468ef4233ed78cd7c3de230dd1d61a56b';

export const MODEL_SPECS: Record<ModelId, ModelSpec> = {
  'whisper-tiny': {
    id: 'whisper-tiny',
    label: 'Whisper tiny (multilingual)',
    kind: 'stt',
    fileName: 'ggml-tiny.bin',
    url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${WHISPER_REVISION}/ggml-tiny.bin`,
    sizeBytes: 77691713,
    sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
    md5: 'ab7280bbcf29e334f7e3b2a9ac0ca386',
    wrongVariantFileNames: ['ggml-tiny.en.bin'],
  },
  'whisper-base': {
    id: 'whisper-base',
    label: 'Whisper base (multilingual)',
    kind: 'stt',
    fileName: 'ggml-base.bin',
    url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${WHISPER_REVISION}/ggml-base.bin`,
    sizeBytes: 147951465,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    md5: '335f34f382e396519b6359d32c786317',
    wrongVariantFileNames: ['ggml-base.en.bin'],
  },
  'qwen3-0.6b': {
    id: 'qwen3-0.6b',
    label: 'Qwen3 0.6B (Q4_K_M)',
    kind: 'llm',
    fileName: 'Qwen3-0.6B-Q4_K_M.gguf',
    url: `https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/${QWEN_REVISION}/Qwen3-0.6B-Q4_K_M.gguf`,
    sizeBytes: 396705472,
    sha256: 'ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a',
    md5: '45349ac9dec6a388775cbd720be5f8df',
    wrongVariantFileNames: [],
  },
};

export function whisperModelId(model: WhisperModel): ModelId {
  return model === 'base' ? 'whisper-base' : 'whisper-tiny';
}

/** Downloads land here first and are renamed only after they verify. */
export function partFileName(spec: ModelSpec): string {
  return `${spec.fileName}.part`;
}

export type ModelStatus =
  /** File present with exactly the expected size. */
  | 'installed'
  | 'missing'
  /** File present but not the expected size (partial or broken download). */
  | 'incomplete'
  /** Only the wrong build is present (e.g. ggml-tiny.en.bin). */
  | 'wrong_variant';

/** Where the model files live. Synchronous so lookups are cheap at startup. */
export interface ModelFiles {
  /** Directory as a path or a file:// URI; both are accepted. */
  directory: string;
  stat(fileName: string): { exists: boolean; size: number };
}

export type Readiness = {
  ready: boolean;
  /** Models that are needed but not usable, with the reason. */
  blocking: { id: ModelId; status: ModelStatus }[];
};

/** "file:///data/x/models/" -> "/data/x/models". Plain paths pass through. */
export function toNativeDirectory(directory: string): string {
  let path = directory.replace(/^file:\/\//, '');
  try {
    path = decodeURI(path);
  } catch {
    // keep the raw path if it has a malformed escape
  }
  return path.replace(/\/+$/, '');
}

/**
 * Path lookup for the offline models. A model is only reported as usable when
 * the file has exactly the expected size, so the pipeline fails early with a
 * clear "run Setup" instead of crashing inside the native loader. (The
 * checksum is verified once, by the downloader, not on every lookup.)
 */
export class ModelManager {
  constructor(
    private readonly files: ModelFiles,
    private readonly specs: Record<ModelId, ModelSpec> = MODEL_SPECS,
  ) {}

  status(id: ModelId): ModelStatus {
    const spec = this.specs[id];
    const main = this.files.stat(spec.fileName);

    if (main.exists) return main.size === spec.sizeBytes ? 'installed' : 'incomplete';

    const wrong = spec.wrongVariantFileNames.some((name) => this.files.stat(name).exists);
    return wrong ? 'wrong_variant' : 'missing';
  }

  /** Absolute path for the native loader, or null unless the model is installed. */
  getPath(id: ModelId): string | null {
    if (this.status(id) !== 'installed') return null;
    return `${toNativeDirectory(this.files.directory)}/${this.specs[id].fileName}`;
  }

  /** Shaped for `WhisperServiceOptions.getModelPath`. */
  getWhisperPath(model: WhisperModel): string | null {
    return this.getPath(whisperModelId(model));
  }

  /** Shaped for the Qwen parser's model path lookup (M3). */
  getLlmPath(): string | null {
    return this.getPath('qwen3-0.6b');
  }

  /**
   * First-launch gate: Whisper is always needed; Qwen only when the LLM is on
   * (fast mode = rules only, so it can run without the LLM file).
   */
  readiness(needs: { whisperModel: WhisperModel; llmEnabled: boolean }): Readiness {
    const required: ModelId[] = [whisperModelId(needs.whisperModel)];
    if (needs.llmEnabled) required.push('qwen3-0.6b');

    const blocking = required
      .map((id) => ({ id, status: this.status(id) }))
      .filter((entry) => entry.status !== 'installed');

    return { ready: blocking.length === 0, blocking };
  }
}
