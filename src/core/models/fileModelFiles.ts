import { Directory, File, FileMode, Paths } from 'expo-file-system';

import type { ModelFileOps, ModelTransfer } from './download';

/**
 * Models live in `<document dir>/models` (the document directory is not
 * cleared by the system, unlike cache). Uses the SDK 57 File/Directory API,
 * including its download task. Native, so not unit-tested: verify on a device,
 * in particular that the Hugging Face redirect to its CDN is followed.
 */
export function createFileModelFiles(folderName = 'models'): ModelFileOps & ModelTransfer {
  const directory = new Directory(Paths.document, folderName);
  const fileOf = (fileName: string) => new File(directory, fileName);

  return {
    directory: directory.uri,

    stat(fileName) {
      const file = fileOf(fileName);
      return file.exists ? { exists: true, size: file.size } : { exists: false, size: 0 };
    },

    ensure() {
      directory.create({ idempotent: true, intermediates: true });
    },

    remove(fileName) {
      const file = fileOf(fileName);
      if (file.exists) file.delete();
    },

    rename(fromName, toName) {
      fileOf(fromName).rename(toName);
    },

    async readChunks(fileName, chunkSize, onChunk) {
      const handle = fileOf(fileName).open(FileMode.ReadOnly);
      try {
        const size = handle.size ?? 0;
        let offset = handle.offset ?? 0;
        while (offset < size) {
          const chunk = handle.readBytes(Math.min(chunkSize, size - offset));
          if (chunk.length === 0) break;
          offset += chunk.length;
          await onChunk(chunk);
        }
      } finally {
        handle.close();
      }
    },

    async download(url, fileName, onProgress, signal) {
      const task = File.createDownloadTask(url, fileOf(fileName), {
        onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes),
        ...(signal ? { signal } : {}),
      });
      const result = await task.downloadAsync();
      // null means the task was paused; we never pause, so treat it as a failure.
      if (!result) throw new Error('Download was interrupted before it finished');
    },
  };
}
