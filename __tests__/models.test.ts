import { MODEL_SPECS, ModelManager, toNativeDirectory, whisperModelId, type ModelFiles } from '@/core/models/manager';

const tiny = MODEL_SPECS['whisper-tiny'];
const base = MODEL_SPECS['whisper-base'];
const qwen = MODEL_SPECS['qwen3-0.6b'];

function makeFiles(contents: Record<string, number>, directory = '/data/user/0/com.wenz.tropa/files/models') {
  const files: ModelFiles = {
    directory,
    stat: (name) => (name in contents ? { exists: true, size: contents[name] } : { exists: false, size: 0 }),
  };
  return files;
}

describe('MODEL_SPECS', () => {
  it('has complete, pinned entries', () => {
    for (const spec of Object.values(MODEL_SPECS)) {
      expect(spec.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(spec.sizeBytes).toBeGreaterThan(50 * 1024 * 1024);
      expect(spec.url.startsWith('https://')).toBe(true);
      expect(spec.url.endsWith(`/${spec.fileName}`)).toBe(true);
      // Pinned to a commit so the hash cannot silently go stale.
      expect(spec.url).toMatch(/\/resolve\/[0-9a-f]{40}\//);
    }
  });

  it('uses the multilingual Whisper builds, never the English-only ones', () => {
    for (const id of ['whisper-tiny', 'whisper-base'] as const) {
      expect(MODEL_SPECS[id].fileName).not.toContain('.en');
      expect(MODEL_SPECS[id].url).not.toContain('.en.bin');
      expect(MODEL_SPECS[id].wrongVariantFileNames).toHaveLength(1);
    }
  });
});

describe('toNativeDirectory', () => {
  it('strips file:// and trailing slashes, and decodes escapes', () => {
    expect(toNativeDirectory('file:///data/user/0/app/files/models/')).toBe('/data/user/0/app/files/models');
    expect(toNativeDirectory('/data/models//')).toBe('/data/models');
    expect(toNativeDirectory('file:///data/my%20files/models')).toBe('/data/my files/models');
  });

  it('keeps the raw path when an escape is malformed', () => {
    expect(toNativeDirectory('/data/100%/models')).toBe('/data/100%/models');
  });
});

describe('ModelManager', () => {
  it('returns the absolute path for an installed model', () => {
    const m = new ModelManager(makeFiles({ [tiny.fileName]: tiny.sizeBytes }));
    expect(m.status('whisper-tiny')).toBe('installed');
    expect(m.getPath('whisper-tiny')).toBe('/data/user/0/com.wenz.tropa/files/models/ggml-tiny.bin');
    expect(m.getWhisperPath('tiny')).toBe('/data/user/0/com.wenz.tropa/files/models/ggml-tiny.bin');
  });

  it('accepts a file:// directory (what expo-file-system returns)', () => {
    const m = new ModelManager(makeFiles({ [tiny.fileName]: tiny.sizeBytes }, 'file:///data/files/models/'));
    expect(m.getWhisperPath('tiny')).toBe('/data/files/models/ggml-tiny.bin');
  });

  it('reports a missing model as missing with a null path', () => {
    const m = new ModelManager(makeFiles({}));
    expect(m.status('whisper-tiny')).toBe('missing');
    expect(m.getPath('whisper-tiny')).toBeNull();
    expect(m.getLlmPath()).toBeNull();
  });

  it('treats any size other than the exact one as incomplete, never usable', () => {
    for (const size of [0, 1024, tiny.sizeBytes - 1, tiny.sizeBytes + 1]) {
      const m = new ModelManager(makeFiles({ [tiny.fileName]: size }));
      expect(m.status('whisper-tiny')).toBe('incomplete');
      expect(m.getWhisperPath('tiny')).toBeNull();
    }
  });

  it('does not treat a .part file as the model', () => {
    const m = new ModelManager(makeFiles({ [`${tiny.fileName}.part`]: tiny.sizeBytes }));
    expect(m.status('whisper-tiny')).toBe('missing');
  });

  it('flags the English-only Whisper build, which cannot do Tagalog', () => {
    const m = new ModelManager(makeFiles({ 'ggml-tiny.en.bin': 77704715 }));
    expect(m.status('whisper-tiny')).toBe('wrong_variant');
    expect(m.getWhisperPath('tiny')).toBeNull();
  });

  it('prefers the right build when both are present', () => {
    const m = new ModelManager(makeFiles({ 'ggml-tiny.en.bin': 77704715, [tiny.fileName]: tiny.sizeBytes }));
    expect(m.status('whisper-tiny')).toBe('installed');
  });

  it('picks the file for the selected Whisper size', () => {
    const m = new ModelManager(makeFiles({ [tiny.fileName]: tiny.sizeBytes }));
    expect(m.getWhisperPath('tiny')).not.toBeNull();
    expect(m.getWhisperPath('base')).toBeNull();
    expect(whisperModelId('tiny')).toBe('whisper-tiny');
    expect(whisperModelId('base')).toBe('whisper-base');
  });

  describe('readiness', () => {
    it('needs only Whisper in fast mode', () => {
      const m = new ModelManager(makeFiles({ [tiny.fileName]: tiny.sizeBytes }));
      expect(m.readiness({ whisperModel: 'tiny', llmEnabled: false })).toEqual({ ready: true, blocking: [] });
    });

    it('also needs Qwen when the LLM is enabled', () => {
      const m = new ModelManager(makeFiles({ [tiny.fileName]: tiny.sizeBytes }));
      expect(m.readiness({ whisperModel: 'tiny', llmEnabled: true })).toEqual({
        ready: false,
        blocking: [{ id: 'qwen3-0.6b', status: 'missing' }],
      });
    });

    it('lists every blocking model with its reason', () => {
      const m = new ModelManager(makeFiles({ 'ggml-base.en.bin': 147964211, [qwen.fileName]: 5 * 1024 * 1024 }));
      expect(m.readiness({ whisperModel: 'base', llmEnabled: true })).toEqual({
        ready: false,
        blocking: [
          { id: 'whisper-base', status: 'wrong_variant' },
          { id: 'qwen3-0.6b', status: 'incomplete' },
        ],
      });
    });

    it('is ready when everything required is installed', () => {
      const m = new ModelManager(makeFiles({ [base.fileName]: base.sizeBytes, [qwen.fileName]: qwen.sizeBytes }));
      expect(m.readiness({ whisperModel: 'base', llmEnabled: true }).ready).toBe(true);
    });
  });
});
