import { LOG_FILE, triggerLogger } from '../src/core/system/triggerLogger';

jest.mock('expo-file-system', () => {
  return {
    Paths: { document: 'mock-doc-dir' },
    File: jest.fn().mockImplementation((dir, name) => {
      let fileExists = false;
      let fileContent = '';

      return {
        get exists() { return fileExists; },
        create: jest.fn().mockImplementation(() => { fileExists = true; }),
        write: jest.fn().mockImplementation((text, opts) => {
          if (opts?.append) {
            fileContent += text;
          } else {
            fileContent = text;
          }
        }),
        textSync: jest.fn().mockImplementation(() => fileContent),
        delete: jest.fn().mockImplementation(() => { fileExists = false; fileContent = ''; }),
        
        // Test helpers
        _mockSetExists: (v: boolean) => { fileExists = v; },
        _mockSetContent: (v: string) => { fileContent = v; },
        _mockGetContent: () => fileContent,
      };
    })
  };
});

describe('triggerLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (LOG_FILE as any)._mockSetExists(false);
    (LOG_FILE as any)._mockSetContent('');
  });

  it('creates file if it does not exist', async () => {
    await triggerLogger.log({ result: 'handled', transcript: 'test', command: 'test', intent: 'test', reply: 'test' }, 100);
    
    expect(LOG_FILE!.create).toHaveBeenCalledWith({ intermediates: true });
    expect((LOG_FILE as any)._mockGetContent()).toContain('"result":"handled"');
  });

  it('appends to file if it exists', async () => {
    (LOG_FILE as any)._mockSetExists(true);
    (LOG_FILE as any)._mockSetContent('{"old":"log"}\n');
    await triggerLogger.log({ result: 'ignored_busy' }, 50);
    
    expect(LOG_FILE!.write).toHaveBeenCalled();
    expect((LOG_FILE as any)._mockGetContent()).toMatch(/\{"old":"log"\}\n\{.*"result":"ignored_busy".*\}/);
  });

  it('reads logs correctly', async () => {
    (LOG_FILE as any)._mockSetExists(true);
    (LOG_FILE as any)._mockSetContent('{"result":"a"}\n{"result":"b"}\n');
    
    const logs = await triggerLogger.readLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].result).toBe('a');
    expect(logs[1].result).toBe('b');
  });

  it('clears logs', async () => {
    (LOG_FILE as any)._mockSetExists(true);
    await triggerLogger.clearLogs();
    expect(LOG_FILE!.delete).toHaveBeenCalled();
  });
});
