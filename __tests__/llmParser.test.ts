import { LlmParser } from '@/core/intents/llmParser';
import { INTENT_GRAMMAR } from '@/core/intents/grammar';

const mockCompletion = jest.fn();
const mockClearCache = jest.fn();
const mockRelease = jest.fn();
const mockInitLlama = jest.fn();

jest.mock('llama.rn', () => ({
  initLlama: (...args: unknown[]) => mockInitLlama(...args),
}));

const OUTPUT = '{"intent":"tell_time","target":null,"reply":"Checking the time"}';

beforeEach(() => {
  jest.clearAllMocks();
  mockCompletion.mockResolvedValue({ text: OUTPUT });
  mockClearCache.mockResolvedValue(undefined);
  mockRelease.mockResolvedValue(undefined);
  mockInitLlama.mockResolvedValue({
    completion: mockCompletion,
    clearCache: mockClearCache,
    release: mockRelease,
  });
});

describe('LlmParser', () => {
  it('throws a clear error when the model is not installed', async () => {
    const parser = new LlmParser({ getModelPath: () => null });
    await expect(parser.run('anong oras na')).rejects.toThrow(/run Setup/);
    expect(mockInitLlama).not.toHaveBeenCalled();
  });

  it('loads, completes with the grammar and greedy decoding, then releases', async () => {
    const parser = new LlmParser({ getModelPath: () => '/models/qwen.gguf' });
    const text = await parser.run('anong oras na');

    expect(text).toBe(OUTPUT);
    expect(mockInitLlama).toHaveBeenCalledWith(
      expect.objectContaining({ model: '/models/qwen.gguf', n_ctx: 2048, n_parallel: 1 }),
    );
    const params = mockCompletion.mock.calls[0][0];
    expect(params.grammar).toBe(INTENT_GRAMMAR);
    expect(params.temperature).toBe(0);
    expect(params.n_predict).toBe(64);
    expect(params.enable_thinking).toBe(false);
    expect(params.messages[params.messages.length - 1]).toEqual({
      role: 'user',
      content: 'anong oras na /no_think',
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('releases even when the completion fails', async () => {
    mockCompletion.mockRejectedValueOnce(new Error('native crash'));
    const parser = new LlmParser({ getModelPath: () => '/models/qwen.gguf' });
    await expect(parser.run('hello')).rejects.toThrow('native crash');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('keepLoaded reuses the context and clears the cache each time', async () => {
    const parser = new LlmParser({ getModelPath: () => '/models/qwen.gguf', keepLoaded: true });
    await parser.run('one');
    await parser.run('two');

    expect(mockInitLlama).toHaveBeenCalledTimes(1);
    expect(mockClearCache).toHaveBeenCalledTimes(2);
    expect(mockRelease).not.toHaveBeenCalled();

    await parser.release();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('port() plugs into the dispatcher shape', async () => {
    const parser = new LlmParser({ getModelPath: () => '/models/qwen.gguf' });
    await expect(parser.port()('anong oras na')).resolves.toBe(OUTPUT);
  });
});
