interface InitMessage {
  type: "init";
  fileId: string;
  chunkSize: number;
  handle?: FileSystemFileHandle;
  file?: File;
}

interface ChunkRequest {
  type: "chunk";
  fileId: string;
  index: number;
}

interface ReleaseMessage {
  type: "release";
  fileId: string;
}

type WorkerRequest = InitMessage | ChunkRequest | ReleaseMessage;

type FileContext = {
  handle?: FileSystemFileHandle;
  file?: File;
  chunkSize: number;
  size: number;
  totalChunks: number;
};

type FileReaderWorkerScope = typeof globalThis & {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

declare const self: FileReaderWorkerScope;

const files = new Map<string, FileContext>();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  switch (message.type) {
    case "init": {
      let sourceFile = message.file ?? null;
      if (!sourceFile && message.handle) {
        sourceFile = await message.handle.getFile();
      }
      if (!sourceFile) {
        self.postMessage({
          type: "error",
          fileId: message.fileId,
          error: "no-file-source",
        });
        return;
      }
      files.set(message.fileId, {
        handle: message.handle,
        file: message.file ?? sourceFile,
        chunkSize: message.chunkSize,
        size: sourceFile.size,
        totalChunks: Math.ceil(sourceFile.size / message.chunkSize),
      });
      self.postMessage({
        type: "ready",
        fileId: message.fileId,
        size: sourceFile.size,
        totalChunks: Math.ceil(sourceFile.size / message.chunkSize),
      });
      break;
    }
    case "chunk": {
      const ctx = files.get(message.fileId);
      if (!ctx) {
        self.postMessage({ type: "error", fileId: message.fileId, error: "file not initialized" });
        return;
      }
      const file = ctx.file ?? (ctx.handle ? await ctx.handle.getFile() : null);
      if (!file) {
        self.postMessage({ type: "error", fileId: message.fileId, error: "file not available" });
        return;
      }
      const start = message.index * ctx.chunkSize;
      const end = Math.min(start + ctx.chunkSize, ctx.size);
      const blob = file.slice(start, end);
      const buffer = await blob.arrayBuffer();
      self.postMessage({ type: "chunk", fileId: message.fileId, index: message.index, buffer }, [buffer]);
      break;
    }
    case "release": {
      files.delete(message.fileId);
      break;
    }
    default:
      break;
  }
};

export default {} as typeof Worker & { new (): Worker };
