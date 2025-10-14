interface InitMessage {
  type: "init";
  fileId: string;
  handle: FileSystemFileHandle;
  chunkSize: number;
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
  handle: FileSystemFileHandle;
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
      const file = await message.handle.getFile();
      files.set(message.fileId, {
        handle: message.handle,
        chunkSize: message.chunkSize,
        size: file.size,
        totalChunks: Math.ceil(file.size / message.chunkSize),
      });
      self.postMessage({
        type: "ready",
        fileId: message.fileId,
        size: file.size,
        totalChunks: Math.ceil(file.size / message.chunkSize),
      });
      break;
    }
    case "chunk": {
      const ctx = files.get(message.fileId);
      if (!ctx) {
        self.postMessage({ type: "error", fileId: message.fileId, error: "file not initialized" });
        return;
      }
      const file = await ctx.handle.getFile();
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
