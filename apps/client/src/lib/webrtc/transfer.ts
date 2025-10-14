export const CHUNK_SIZE = 16_384;
export const BACKPRESSURE_HIGH = 8_000_000;
export const BACKPRESSURE_LOW = 1_000_000;

export type TransferManifest = {
  type: "MANIFEST";
  fileId: string;
  name: string;
  size: number;
  mime?: string;
  chunkSize: number;
  totalChunks: number;
};

export type TransferAck = { type: "ACK"; nextChunkIndex: number };
export type TransferDone = { type: "DONE" };
export type TransferCancel = { type: "CANCEL"; reason?: string };
export type TransferResumeRequest = {
  type: "RESUME_REQ";
  fileId: string;
  haveUntilChunk: number;
};
export type TransferResumeOk = { type: "RESUME_OK"; startFrom: number };

export type ControlMessage =
  | TransferManifest
  | TransferAck
  | TransferDone
  | TransferCancel
  | TransferResumeRequest
  | TransferResumeOk;

export type TransferEventMap = {
  progress: { fileId: string; bytesSent: number; totalBytes: number; chunkIndex: number };
  completed: { fileId: string };
  cancelled: { fileId: string; reason?: string };
  error: { fileId: string; error: Error };
  "chunk-received": { fileId: string; chunkIndex: number; chunk: ArrayBuffer };
  manifest: { manifest: TransferManifest };
};

export type TransferEvent = keyof TransferEventMap;

class TransferEmitter {
  private listeners = new Map<TransferEvent, Set<(payload: any) => void>>();

  on<T extends TransferEvent>(event: T, handler: (payload: TransferEventMap[T]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as any);
    return () => this.off(event, handler as any);
  }

  off<T extends TransferEvent>(event: T, handler: (payload: TransferEventMap[T]) => void) {
    this.listeners.get(event)?.delete(handler as any);
  }

  emit<T extends TransferEvent>(event: T, payload: TransferEventMap[T]) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("fluxshare:transfer:listener", error);
      }
    });
  }
}

export interface ChunkProvider {
  getChunk(index: number): Promise<ArrayBuffer>;
}

export interface ChunkWriter {
  (index: number, chunk: ArrayBuffer): Promise<void> | void;
}

export class FileSender {
  private readonly channel: RTCDataChannel;
  private readonly emitter = new TransferEmitter();
  private manifest: TransferManifest | null = null;
  private provider: ChunkProvider | null = null;
  private nextIndex = 0;
  private sending = false;

  constructor(channel: RTCDataChannel) {
    this.channel = channel;
    this.channel.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        const message = parseControlMessage(event.data);
        if (message) {
          this.handleControl(message);
        }
      }
    });
  }

  on = this.emitter.on.bind(this.emitter);
  off = this.emitter.off.bind(this.emitter);

  async start(manifest: TransferManifest, provider: ChunkProvider) {
    this.manifest = manifest;
    this.provider = provider;
    this.nextIndex = 0;
    this.sending = true;
    this.sendControl(manifest);
  }

  cancel(reason?: string) {
    this.sendControl({ type: "CANCEL", reason });
    this.sending = false;
  }

  private async handleControl(message: ControlMessage) {
    if (!this.manifest) {
      return;
    }
    switch (message.type) {
      case "ACK": {
        this.nextIndex = message.nextChunkIndex;
        await this.sendChunks();
        break;
      }
      case "CANCEL": {
        this.sending = false;
        this.emitter.emit("cancelled", { fileId: this.manifest.fileId, reason: message.reason });
        break;
      }
      case "RESUME_REQ": {
        this.nextIndex = message.haveUntilChunk;
        this.sendControl({ type: "RESUME_OK", startFrom: this.nextIndex });
        await this.sendChunks();
        break;
      }
      default:
        break;
    }
  }

  private async sendChunks() {
    if (!this.manifest || !this.provider || !this.sending) return;
    for (let index = this.nextIndex; index < this.manifest.totalChunks; index += 1) {
      if (!this.sending) {
        this.nextIndex = index;
        return;
      }
      const chunk = await this.provider.getChunk(index);
      await this.waitForBackpressure();
      this.channel.send(chunk);
      this.emitter.emit("progress", {
        fileId: this.manifest.fileId,
        bytesSent: Math.min((index + 1) * this.manifest.chunkSize, this.manifest.size),
        totalBytes: this.manifest.size,
        chunkIndex: index,
      });
      this.nextIndex = index + 1;
    }
    this.sendControl({ type: "DONE" });
    this.emitter.emit("completed", { fileId: this.manifest.fileId });
    this.sending = false;
  }

  private waitForBackpressure(): Promise<void> {
    if (this.channel.bufferedAmount <= BACKPRESSURE_HIGH) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const listener = () => {
        if (this.channel.bufferedAmount <= BACKPRESSURE_LOW) {
          this.channel.removeEventListener("bufferedamountlow", listener);
          resolve();
        }
      };
      this.channel.addEventListener("bufferedamountlow", listener);
    });
  }

  private sendControl(message: ControlMessage) {
    this.channel.send(JSON.stringify(message));
  }
}

export class FileReceiver {
  private readonly channel: RTCDataChannel;
  private readonly emitter = new TransferEmitter();
  private writer: ChunkWriter | null = null;
  private manifest: TransferManifest | null = null;
  private chunkCounter = 0;
  private bytesReceived = 0;

  constructor(channel: RTCDataChannel) {
    this.channel = channel;
    this.channel.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        const control = parseControlMessage(event.data);
        if (control) {
          this.handleControl(control);
        }
      } else if (event.data instanceof ArrayBuffer) {
        this.handleChunk(event.data);
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buffer) => this.handleChunk(buffer));
      }
    });
  }

  on = this.emitter.on.bind(this.emitter);
  off = this.emitter.off.bind(this.emitter);

  async setWriter(writer: ChunkWriter) {
    this.writer = writer;
  }

  private async handleControl(message: ControlMessage) {
    switch (message.type) {
      case "MANIFEST": {
        this.manifest = message;
        this.chunkCounter = 0;
        this.bytesReceived = 0;
        this.emitter.emit("manifest", { manifest: message });
        this.sendControl({ type: "ACK", nextChunkIndex: 0 });
        break;
      }
      case "DONE": {
        if (this.manifest) {
          this.emitter.emit("completed", { fileId: this.manifest.fileId });
        }
        break;
      }
      case "CANCEL": {
        if (this.manifest) {
          this.emitter.emit("cancelled", { fileId: this.manifest.fileId, reason: message.reason });
        }
        break;
      }
      case "RESUME_OK": {
        this.chunkCounter = message.startFrom;
        this.bytesReceived = message.startFrom * (this.manifest?.chunkSize ?? 0);
        break;
      }
      default:
        break;
    }
  }

  private async handleChunk(chunk: ArrayBuffer) {
    if (!this.manifest) return;
    const index = this.chunkCounter;
    this.chunkCounter += 1;
    this.bytesReceived += chunk.byteLength;
    if (this.writer) {
      await this.writer(index, chunk);
    }
    this.emitter.emit("chunk-received", {
      fileId: this.manifest.fileId,
      chunkIndex: index,
      chunk,
    });
    if (this.chunkCounter % 128 === 0 || this.chunkCounter >= this.manifest.totalChunks) {
      this.sendControl({ type: "ACK", nextChunkIndex: this.chunkCounter });
    }
    if (this.chunkCounter >= this.manifest.totalChunks) {
      this.sendControl({ type: "DONE" });
      this.emitter.emit("completed", { fileId: this.manifest.fileId });
    }
  }

  requestResume(haveUntilChunk: number) {
    if (!this.manifest) return;
    this.sendControl({ type: "RESUME_REQ", fileId: this.manifest.fileId, haveUntilChunk });
  }

  cancel(reason?: string) {
    if (!this.manifest) return;
    this.sendControl({ type: "CANCEL", reason });
  }

  private sendControl(message: ControlMessage) {
    this.channel.send(JSON.stringify(message));
  }
}

function parseControlMessage(data: string): ControlMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed.type !== "string") {
      return null;
    }
    return parsed as ControlMessage;
  } catch (error) {
    console.error("fluxshare:transfer", "invalid control message", error);
    return null;
  }
}
