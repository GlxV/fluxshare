import { nanoid } from "nanoid";
import { isTauri } from "../persist/tauri";
import { extractArchiveToFolder } from "./folder";

export const DEFAULT_CHUNK_SIZE = 64 * 1024;
const BUFFERED_AMOUNT_LOW = DEFAULT_CHUNK_SIZE * 8;
const BUFFERED_AMOUNT_HIGH = DEFAULT_CHUNK_SIZE * 32;

async function writeArchiveToCache(meta: TransferMeta, blob: Blob): Promise<string | null> {
  try {
    const [{ appCacheDir, join }, { writeBinaryFile, createDir }] = await Promise.all([
      import("@tauri-apps/api/path"),
      import("@tauri-apps/api/fs"),
    ]);
    const cacheDir = await appCacheDir();
    const folder = await join(cacheDir, "fluxshare-archives");
    await createDir(folder, { recursive: true });
    const name = meta.name.endsWith(".zip") ? meta.name : `${meta.name}.zip`;
    const target = await join(folder, `recv-${Date.now()}-${name}`);
    const buffer = new Uint8Array(await blob.arrayBuffer());
    await writeBinaryFile({ path: target, contents: buffer });
    return target;
  } catch (error) {
    console.warn("fluxshare:transfer", "failed to write archive", error);
    return null;
  }
}

export type TransferDirection = "send" | "receive";

export interface TransferMeta {
  id: string;
  name: string;
  size: number;
  mime?: string;
  chunkSize: number;
  totalChunks: number;
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

interface ReceiveSession {
  meta: TransferMeta;
  chunks: Array<ArrayBuffer | null>;
  receivedChunks: number;
  bytesReceived: number;
  startedAt: number;
  cancelled: boolean;
}

class PeerChannelController {
  private readonly peerId: string;
  private readonly channel: RTCDataChannel;
  private readonly emitter: EventEmitter;
  private sendSession: SendSession | null = null;
  private receiveSession: ReceiveSession | null = null;

  constructor(peerId: string, channel: RTCDataChannel, emitter: EventEmitter) {
    this.peerId = peerId;
    this.channel = channel;
    this.emitter = emitter;
    this.channel.binaryType = "arraybuffer";
    this.channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW;
    this.channel.addEventListener("message", (event) => {
      this.handleMessage(event.data).catch((error) => {
        console.error("fluxshare:transfer", "message handler failed", error);
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
      throw new Error("Transferência em andamento para este peer");
    }
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
    const id = source.id ?? nanoid(12);
    const totalChunks = Math.ceil(source.size / chunkSize);
    return {
      id,
      name: source.name,
      size: source.size,
      mime: source.mime,
      chunkSize,
      totalChunks,
      isArchive: source.isArchive,
      archiveRoot: source.archiveRoot,
    };
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
            void this.startSendingChunks();
          } else {
            this.cancelTransfer(control.id, "Peer não pode receber");
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
      this.handleChunk(data);
      return;
    }
    if (data instanceof Blob) {
      const buffer = await data.arrayBuffer();
      this.handleChunk(buffer);
    }
  }

  private parseControlMessage(raw: string): ControlMessage | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as ControlMessage;
    } catch (error) {
      console.warn("fluxshare:transfer", "invalid control message", error);
      return null;
    }
  }

  private async prepareReceive(meta: TransferMeta) {
    if (this.receiveSession) {
      this.cancelTransfer(this.receiveSession.meta.id, "Sobrescrito por nova transferência");
    }
    const session: ReceiveSession = {
      meta,
      chunks: new Array(meta.totalChunks).fill(null),
      receivedChunks: 0,
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
      await this.waitForBackpressure();
      const payload = new Uint8Array(4 + chunk.byteLength);
      new DataView(payload.buffer).setUint32(0, session.nextChunk, false);
      payload.set(new Uint8Array(chunk), 4);
      this.channel.send(payload.buffer);
      session.bytesSent = Math.min(meta.size, session.bytesSent + chunk.byteLength);
      const progressEvent: TransferProgressEvent = {
        peerId: this.peerId,
        direction: "send",
        meta,
        transferId: meta.id,
        startedAt: session.startedAt,
        bytesTransferred: session.bytesSent,
        totalBytes: meta.size,
        chunkIndex: session.nextChunk,
        updatedAt: Date.now(),
      };
      this.emitter.emit("transfer-progress", progressEvent);
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

  private handleChunk(buffer: ArrayBuffer) {
    const session = this.receiveSession;
    if (!session || session.cancelled) return;
    const view = new DataView(buffer);
    const index = view.getUint32(0, false);
    if (index < 0 || index >= session.meta.totalChunks) {
      return;
    }
    const chunk = buffer.slice(4);
    if (session.chunks[index]) {
      return;
    }
    session.chunks[index] = chunk;
    session.receivedChunks += 1;
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
    try {
      const merged = this.mergeChunks(session);
      const blob = new Blob(merged, { type: session.meta.mime ?? "application/octet-stream" });
      let savePath: string | null = null;
      if (isTauri()) {
        if (session.meta.isArchive) {
          const archivePath = await writeArchiveToCache(session.meta, blob);
          if (archivePath) {
            const extracted = await extractArchiveToFolder(archivePath, session.meta.archiveRoot);
            savePath = extracted ?? archivePath;
          }
        } else {
          savePath = await this.saveWithTauri(session.meta, blob);
        }
      }
      if (savePath) {
        this.emitter.emit("transfer-completed", {
          peerId: this.peerId,
          direction: "receive",
          meta: session.meta,
          transferId: session.meta.id,
          startedAt: session.startedAt,
          savePath,
        });
      } else {
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
    this.cleanupReceive();
  }

  private mergeChunks(session: ReceiveSession) {
    const buffers: ArrayBuffer[] = [];
    for (let index = 0; index < session.meta.totalChunks; index += 1) {
      const chunk = session.chunks[index];
      if (!chunk) {
        throw new Error(`Chunk ${index} ausente`);
      }
      buffers.push(chunk);
    }
    return buffers;
  }

  private async saveWithTauri(meta: TransferMeta, blob: Blob) {
    try {
      const { save } = await import("@tauri-apps/api/dialog");
      const { writeBinaryFile } = await import("@tauri-apps/api/fs");
      const target = await save({ defaultPath: meta.name });
      if (!target) {
        return null;
      }
      const buffer = new Uint8Array(await blob.arrayBuffer());
      await writeBinaryFile({ path: target, contents: buffer });
      return target;
    } catch (error) {
      console.warn("fluxshare:transfer", "tauri save failed", error);
      return null;
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
      this.receiveSession = null;
      this.emitter.emit("transfer-cancelled", {
        peerId: this.peerId,
        direction: "receive",
        meta: session.meta,
        transferId,
        startedAt: session.startedAt,
        reason,
      });
      return;
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
    throw new Error("Fonte de arquivo inválida");
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

  private cleanupReceive() {
    this.receiveSession = null;
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
      throw new Error(`Peer ${peerId} não registrado`);
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
