import { nanoid } from "nanoid";
import {
  createTransferTempFile,
  deleteTransferTempFile,
  extractReceivedArchive,
  isTauri,
  persistReceivedFile,
  writeFileRange,
} from "../persist/tauri";
import { translateInstant } from "../../i18n/translate";
import {
  DEFAULT_MAX_TRANSFER_SIZE,
  MAX_TRANSFER_CHUNK_SIZE,
  validateTransferMeta,
  type TransferMetaLike,
} from "./limits";

export const DEFAULT_CHUNK_SIZE = 64 * 1024;
const BUFFERED_AMOUNT_LOW = DEFAULT_CHUNK_SIZE * 8;
const BUFFERED_AMOUNT_HIGH = DEFAULT_CHUNK_SIZE * 32;

const tError = (key: string, params?: Record<string, string | number>) =>
  translateInstant(key as any, params);

export type TransferDirection = "send" | "receive";

export interface TransferMeta extends TransferMetaLike {
  mime?: string;
  isArchive?: boolean;
  archiveRoot?: string;
}

export interface TransferSource {
  id?: string;
  name: string;
  size: number;
  mime?: string;
  file?: File;
  createChunk?: (start: number, length: number) => Promise<ArrayBuffer>;
  onDispose?: () => void;
  isArchive?: boolean;
  archiveRoot?: string;
}

interface ControlMetaMessage extends TransferMeta {
  type: "meta";
}

interface ControlAckMessage {
  type: "ack";
  id: string;
  ready: boolean;
}

interface ControlEofMessage {
  type: "eof";
  id: string;
}

interface ControlCancelMessage {
  type: "cancel";
  id: string;
  reason?: string;
}

export type ControlMessage = ControlMetaMessage | ControlAckMessage | ControlEofMessage | ControlCancelMessage;

export interface TransferLifecycleEvent {
  peerId: string;
  direction: TransferDirection;
  meta: TransferMeta;
  transferId: string;
  startedAt: number;
}

export interface TransferProgressEvent extends TransferLifecycleEvent {
  bytesTransferred: number;
  totalBytes: number;
  chunkIndex: number;
  updatedAt: number;
}

export interface TransferCompletedEvent extends TransferLifecycleEvent {
  blob?: Blob;
  fileUrl?: string;
  savePath?: string;
}

export interface TransferCancelledEvent extends TransferLifecycleEvent {
  reason?: string;
}

export interface TransferErrorEvent extends TransferLifecycleEvent {
  error: Error;
}

export type TransferServiceEventMap = {
  "transfer-started": TransferLifecycleEvent;
  "transfer-progress": TransferProgressEvent;
  "transfer-completed": TransferCompletedEvent;
  "transfer-cancelled": TransferCancelledEvent;
  "transfer-error": TransferErrorEvent;
};

export type TransferServiceEvent = keyof TransferServiceEventMap;

class EventEmitter {
  private listeners = new Map<TransferServiceEvent, Set<(payload: any) => void>>();

  on<T extends TransferServiceEvent>(event: T, handler: (payload: TransferServiceEventMap[T]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as any);
    return () => this.off(event, handler as any);
  }

  off<T extends TransferServiceEvent>(event: T, handler: (payload: TransferServiceEventMap[T]) => void) {
    this.listeners.get(event)?.delete(handler as any);
  }

  emit<T extends TransferServiceEvent>(event: T, payload: TransferServiceEventMap[T]) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("fluxshare:transfer", "listener error", error);
      }
    });
  }
}

interface SendSession {
  meta: TransferMeta;
  source: TransferSource;
  nextChunk: number;
  startedAt: number;
  bytesSent: number;
  cancelled: boolean;
}

interface TauriReceiveStorage {
  kind: "tauri";
  handleId: string;
}

interface MemoryReceiveStorage {
  kind: "memory";
  chunks: ArrayBuffer[];
}

type ReceiveStorage = TauriReceiveStorage | MemoryReceiveStorage;

interface ReceiveSession {
  meta: TransferMeta;
  storage: ReceiveStorage;
  nextChunk: number;
  bytesReceived: number;
  startedAt: number;
  cancelled: boolean;
}

function validateChunkSize(chunkSize: number) {
  if (chunkSize <= 0 || chunkSize > MAX_TRANSFER_CHUNK_SIZE) {
    throw new Error("Unsupported transfer chunk size.");
  }
}

class PeerChannelController {
  private readonly peerId: string;
  private readonly channel: RTCDataChannel;
  private readonly emitter: EventEmitter;
  private pendingMessages: Promise<void> = Promise.resolve();
  private sendSession: SendSession | null = null;
  private receiveSession: ReceiveSession | null = null;

  constructor(peerId: string, channel: RTCDataChannel, emitter: EventEmitter) {
    this.peerId = peerId;
    this.channel = channel;
    this.emitter = emitter;
    this.channel.binaryType = "arraybuffer";
    this.channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW;
    this.channel.addEventListener("message", (event) => {
      this.pendingMessages = this.pendingMessages
        .then(() => this.handleMessage(event.data))
        .catch((error) => {
          console.error("fluxshare:transfer", "message handler failed", error);
          this.handleProcessingError(error);
        });
    });
    this.channel.addEventListener("close", () => {
      this.cancelActiveSessions("Canal fechado");
    });
    this.channel.addEventListener("error", (event) => {
      console.error("fluxshare:transfer", "datachannel error", event);
      this.cancelActiveSessions("Erro no canal");
    });
  }

  async sendFile(source: TransferSource, chunkSize = DEFAULT_CHUNK_SIZE) {
    if (this.sendSession) {
      throw new Error(tError("error.peerBusy"));
    }
    validateChunkSize(chunkSize);
    const meta = this.createMeta(source, chunkSize);
    this.sendSession = {
      meta,
      source,
      nextChunk: 0,
      startedAt: Date.now(),
      bytesSent: 0,
      cancelled: false,
    };
    this.sendControl({ type: "meta", ...meta });
  }

  cancelTransfer(transferId: string, reason?: string) {
    if (this.sendSession && this.sendSession.meta.id === transferId) {
      this.sendSession.cancelled = true;
      this.sendControl({ type: "cancel", id: transferId, reason });
      this.emitter.emit("transfer-cancelled", {
        peerId: this.peerId,
        direction: "send",
        meta: this.sendSession.meta,
        transferId,
        startedAt: this.sendSession.startedAt,
        reason,
      });
      this.cleanupSend();
    }
    if (this.receiveSession && this.receiveSession.meta.id === transferId) {
      this.receiveSession.cancelled = true;
      this.sendControl({ type: "cancel", id: transferId, reason });
      this.emitter.emit("transfer-cancelled", {
        peerId: this.peerId,
        direction: "receive",
        meta: this.receiveSession.meta,
        transferId,
        startedAt: this.receiveSession.startedAt,
        reason,
      });
      this.cleanupReceive();
    }
  }

  dispose() {
    this.cancelActiveSessions("Encerrado");
    this.channel.close();
  }

  private createMeta(source: TransferSource, chunkSize: number): TransferMeta {
    if (source.size < 0 || source.size > DEFAULT_MAX_TRANSFER_SIZE) {
      throw new Error("Transfer source size exceeds the supported limit.");
    }

    const id = source.id ?? nanoid(12);
    const totalChunks = source.size === 0 ? 0 : Math.ceil(source.size / chunkSize);
    const meta: TransferMeta = {
      id,
      name: source.name,
      size: source.size,
      mime: source.mime,
      chunkSize,
      totalChunks,
      isArchive: source.isArchive,
      archiveRoot: source.archiveRoot,
    };
    validateTransferMeta(meta);
    return meta;
  }

  private async handleMessage(data: unknown) {
    if (typeof data === "string") {
      const control = this.parseControlMessage(data);
      if (!control) return;
      switch (control.type) {
        case "meta":
          await this.prepareReceive(control);
          break;
        case "ack":
          if (control.ready) {
            void this.startSendingChunks().catch((error) => {
              this.handleSendError(error);
            });
          } else {
            this.cancelTransfer(control.id, tError("error.peerCannotReceive"));
          }
          break;
        case "eof":
          await this.finalizeReceive(control.id);
          break;
        case "cancel":
          this.handleCancel(control.id, control.reason);
          break;
        default:
          break;
      }
      return;
    }
    if (data instanceof ArrayBuffer) {
      await this.handleChunk(data);
      return;
    }
    if (data instanceof Blob) {
      if (data.size > MAX_TRANSFER_CHUNK_SIZE + 4) {
        throw new Error("Received binary payload exceeds the chunk size limit.");
      }
      const buffer = await data.arrayBuffer();
      await this.handleChunk(buffer);
    }
  }

  private parseControlMessage(raw: string): ControlMessage | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
        return null;
      }
      switch (parsed.type) {
        case "meta":
          return parsed as ControlMetaMessage;
        case "ack":
          return typeof parsed.id === "string" && typeof parsed.ready === "boolean"
            ? (parsed as ControlAckMessage)
            : null;
        case "eof":
          return typeof parsed.id === "string" ? (parsed as ControlEofMessage) : null;
        case "cancel":
          return typeof parsed.id === "string" &&
            (typeof parsed.reason === "undefined" || typeof parsed.reason === "string")
            ? (parsed as ControlCancelMessage)
            : null;
        default:
          return null;
      }
    } catch (error) {
      console.warn("fluxshare:transfer", "invalid control message", error);
      return null;
    }
  }

  private async prepareReceive(meta: TransferMeta) {
    if (this.receiveSession) {
      this.cancelTransfer(this.receiveSession.meta.id, tError("error.transferReplaced"));
    }

    try {
      validateTransferMeta(meta);
      const sessionStorage: ReceiveStorage = isTauri()
        ? {
            kind: "tauri",
            handleId: (await createTransferTempFile(meta.name, meta.size)).handleId,
          }
        : {
            kind: "memory",
            chunks: [],
          };

      const session: ReceiveSession = {
        meta,
        storage: sessionStorage,
        nextChunk: 0,
        bytesReceived: 0,
        startedAt: Date.now(),
        cancelled: false,
      };
      this.receiveSession = session;
      this.emitter.emit("transfer-started", {
        peerId: this.peerId,
        direction: "receive",
        meta,
        transferId: meta.id,
        startedAt: session.startedAt,
      });
      this.sendControl({ type: "ack", id: meta.id, ready: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("fluxshare:transfer", "rejected transfer metadata", message);
      this.sendControl({ type: "ack", id: meta.id, ready: false });
    }
  }

  private async startSendingChunks() {
    const session = this.sendSession;
    if (!session || session.cancelled) return;
    const { meta } = session;
    this.emitter.emit("transfer-started", {
      peerId: this.peerId,
      direction: "send",
      meta,
      transferId: meta.id,
      startedAt: session.startedAt,
    });
    while (session.nextChunk < meta.totalChunks) {
      if (session.cancelled) {
        return;
      }
      const chunk = await this.readChunk(session.source, session.nextChunk, meta.chunkSize, meta.size);
      const expectedSize = Math.min(meta.chunkSize, meta.size - session.nextChunk * meta.chunkSize);
      if (chunk.byteLength !== expectedSize) {
        throw new Error("Transfer source returned an unexpected chunk size.");
      }
      await this.waitForBackpressure();
      const payload = new Uint8Array(4 + chunk.byteLength);
      new DataView(payload.buffer).setUint32(0, session.nextChunk, false);
      payload.set(new Uint8Array(chunk), 4);
      this.channel.send(payload.buffer);
      session.bytesSent = Math.min(meta.size, session.bytesSent + chunk.byteLength);
      this.emitter.emit("transfer-progress", {
        peerId: this.peerId,
        direction: "send",
        meta,
        transferId: meta.id,
        startedAt: session.startedAt,
        bytesTransferred: session.bytesSent,
        totalBytes: meta.size,
        chunkIndex: session.nextChunk,
        updatedAt: Date.now(),
      });
      session.nextChunk += 1;
    }
    this.sendControl({ type: "eof", id: meta.id });
    this.emitter.emit("transfer-completed", {
      peerId: this.peerId,
      direction: "send",
      meta,
      transferId: meta.id,
      startedAt: session.startedAt,
    });
    this.cleanupSend();
  }

  private async handleChunk(buffer: ArrayBuffer) {
    const session = this.receiveSession;
    if (!session || session.cancelled) return;
    if (buffer.byteLength < 4) {
      throw new Error("Received chunk header is truncated.");
    }

    const view = new DataView(buffer);
    const index = view.getUint32(0, false);
    if (index !== session.nextChunk) {
      throw new Error("Received out-of-order chunk.");
    }

    const chunk = new Uint8Array(buffer, 4);
    const offset = index * session.meta.chunkSize;
    const remaining = Math.max(0, session.meta.size - offset);
    const expectedSize = remaining === 0 ? 0 : Math.min(session.meta.chunkSize, remaining);
    if (chunk.byteLength !== expectedSize) {
      throw new Error("Received chunk size does not match the announced metadata.");
    }

    if (session.storage.kind === "tauri") {
      await writeFileRange(session.storage.handleId, offset, chunk);
    } else {
      session.storage.chunks.push(buffer.slice(4));
    }

    session.nextChunk += 1;
    session.bytesReceived = Math.min(session.meta.size, session.bytesReceived + chunk.byteLength);
    this.emitter.emit("transfer-progress", {
      peerId: this.peerId,
      direction: "receive",
      meta: session.meta,
      transferId: session.meta.id,
      startedAt: session.startedAt,
      bytesTransferred: session.bytesReceived,
      totalBytes: session.meta.size,
      chunkIndex: index,
      updatedAt: Date.now(),
    });
  }

  private async finalizeReceive(transferId: string) {
    const session = this.receiveSession;
    if (!session || session.meta.id !== transferId) return;
    if (session.cancelled) {
      this.cleanupReceive();
      return;
    }

    let storageConsumed = false;
    try {
      if (session.nextChunk !== session.meta.totalChunks || session.bytesReceived !== session.meta.size) {
        throw new Error("Transfer ended before all announced chunks were received.");
      }

      if (session.storage.kind === "tauri") {
        const savePath = session.meta.isArchive
          ? await extractReceivedArchive(session.storage.handleId, session.meta.archiveRoot)
          : await persistReceivedFile(session.storage.handleId, session.meta.name);
        storageConsumed = true;
        this.emitter.emit("transfer-completed", {
          peerId: this.peerId,
          direction: "receive",
          meta: session.meta,
          transferId: session.meta.id,
          startedAt: session.startedAt,
          savePath,
        });
      } else {
        const blob = new Blob(session.storage.chunks, {
          type: session.meta.mime ?? "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        this.triggerDownload(session.meta.name, url);
        this.emitter.emit("transfer-completed", {
          peerId: this.peerId,
          direction: "receive",
          meta: session.meta,
          transferId: session.meta.id,
          startedAt: session.startedAt,
          blob,
          fileUrl: url,
        });
      }
    } catch (error) {
      this.emitter.emit("transfer-error", {
        peerId: this.peerId,
        direction: "receive",
        meta: session.meta,
        transferId: session.meta.id,
        startedAt: session.startedAt,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    this.cleanupReceive(storageConsumed);
  }

  private handleCancel(transferId: string, reason?: string) {
    if (this.sendSession && this.sendSession.meta.id === transferId) {
      const session = this.sendSession;
      this.sendSession = null;
      this.emitter.emit("transfer-cancelled", {
        peerId: this.peerId,
        direction: "send",
        meta: session.meta,
        transferId,
        startedAt: session.startedAt,
        reason,
      });
      session.source.onDispose?.();
      return;
    }
    if (this.receiveSession && this.receiveSession.meta.id === transferId) {
      const session = this.receiveSession;
      this.emitter.emit("transfer-cancelled", {
        peerId: this.peerId,
        direction: "receive",
        meta: session.meta,
        transferId,
        startedAt: session.startedAt,
        reason,
      });
      this.cleanupReceive();
    }
  }

  private async readChunk(source: TransferSource, index: number, chunkSize: number, totalSize: number) {
    const start = index * chunkSize;
    const remaining = totalSize - start;
    const size = Math.min(chunkSize, remaining);
    if (size <= 0) {
      return new ArrayBuffer(0);
    }
    if (source.createChunk) {
      return source.createChunk(start, size);
    }
    if (source.file) {
      const slice = source.file.slice(start, start + size);
      return slice.arrayBuffer();
    }
    throw new Error(tError("error.invalidSource"));
  }

  private waitForBackpressure(): Promise<void> {
    if (this.channel.bufferedAmount <= BUFFERED_AMOUNT_HIGH) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const listener = () => {
        if (this.channel.bufferedAmount <= BUFFERED_AMOUNT_LOW) {
          this.channel.removeEventListener("bufferedamountlow", listener);
          resolve();
        }
      };
      this.channel.addEventListener("bufferedamountlow", listener);
    });
  }

  private sendControl(message: ControlMessage) {
    try {
      this.channel.send(JSON.stringify(message));
    } catch (error) {
      console.error("fluxshare:transfer", "failed to send control", error);
    }
  }

  private handleProcessingError(error: unknown) {
    const session = this.receiveSession;
    if (!session) {
      return;
    }
    this.sendControl({
      type: "cancel",
      id: session.meta.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    this.emitter.emit("transfer-error", {
      peerId: this.peerId,
      direction: "receive",
      meta: session.meta,
      transferId: session.meta.id,
      startedAt: session.startedAt,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    this.cleanupReceive();
  }

  private handleSendError(error: unknown) {
    const session = this.sendSession;
    if (!session) {
      return;
    }
    this.sendControl({
      type: "cancel",
      id: session.meta.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    this.emitter.emit("transfer-error", {
      peerId: this.peerId,
      direction: "send",
      meta: session.meta,
      transferId: session.meta.id,
      startedAt: session.startedAt,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    this.cleanupSend();
  }

  private cancelActiveSessions(reason?: string) {
    if (this.sendSession) {
      const session = this.sendSession;
      this.emitter.emit("transfer-cancelled", {
        peerId: this.peerId,
        direction: "send",
        meta: session.meta,
        transferId: session.meta.id,
        startedAt: session.startedAt,
        reason,
      });
      this.cleanupSend();
    }
    if (this.receiveSession) {
      const session = this.receiveSession;
      this.emitter.emit("transfer-cancelled", {
        peerId: this.peerId,
        direction: "receive",
        meta: session.meta,
        transferId: session.meta.id,
        startedAt: session.startedAt,
        reason,
      });
      this.cleanupReceive();
    }
  }

  private cleanupSend() {
    if (!this.sendSession) return;
    this.sendSession.source.onDispose?.();
    this.sendSession = null;
  }

  private cleanupReceive(storageConsumed = false) {
    if (!this.receiveSession) {
      return;
    }
    const session = this.receiveSession;
    this.receiveSession = null;
    if (!storageConsumed && session.storage.kind === "tauri") {
      void deleteTransferTempFile(session.storage.handleId).catch((error) => {
        console.warn("fluxshare:transfer", "failed to clean temp receive file", error);
      });
    }
  }

  private triggerDownload(filename: string, url: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export class TransferService {
  private readonly emitter = new EventEmitter();
  private readonly peers = new Map<string, PeerChannelController>();

  on = this.emitter.on.bind(this.emitter);
  off = this.emitter.off.bind(this.emitter);

  registerPeer(peerId: string, channel: RTCDataChannel) {
    this.unregisterPeer(peerId);
    const controller = new PeerChannelController(peerId, channel, this.emitter);
    this.peers.set(peerId, controller);
    return controller;
  }

  unregisterPeer(peerId: string) {
    const existing = this.peers.get(peerId);
    if (existing) {
      existing.dispose();
      this.peers.delete(peerId);
    }
  }

  async sendToPeer(peerId: string, source: TransferSource, chunkSize = DEFAULT_CHUNK_SIZE) {
    const controller = this.peers.get(peerId);
    if (!controller) {
      throw new Error(tError("error.peerNotRegistered", { peerId }));
    }
    await controller.sendFile(source, chunkSize);
  }

  cancel(peerId: string, transferId: string, reason?: string) {
    const controller = this.peers.get(peerId);
    controller?.cancelTransfer(transferId, reason);
  }

  dispose() {
    this.peers.forEach((controller) => controller.dispose());
    this.peers.clear();
  }
}

export default TransferService;
