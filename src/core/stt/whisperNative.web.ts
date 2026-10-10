import type { WhisperContext } from 'whisper.rn';

export type { WhisperContext };

/** whisper.rn is Android/iOS-only; on web there is no model file, so this is never reached. */
export function initWhisper(_options: { filePath: string }): Promise<WhisperContext> {
  return Promise.reject(new Error('Whisper is not supported on web'));
}
