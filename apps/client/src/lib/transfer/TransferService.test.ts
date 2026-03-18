import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../persist/tauri", () => ({
  isTauri: vi.fn(() => true),
  createTransferTempFile: vi.fn(async () => ({
    handleId: "recv-handle",
    path: "C:/temp/recv.bin",
  })),
  writeFileRange: vi.fn(async () => undefined),
  deleteTransferTempFile: vi.fn(async () => undefined),
  persistReceivedFile: vi.fn(async () => "C:/Users/Admin/Downloads/large.bin"),
  extractReceivedArchive: vi.fn(async () => "C:/Users/Admin/Downloads/folder"),
}));

import {
  createTransferTempFile,
  deleteTransferTempFile,
  persistReceivedFile,
  writeFileRange,
} from "../persist/tauri";
import TransferService from "./TransferService";

type Listener = (event: { data?: unknown }) => void;

class MockDataChannel {
  readyState = "open";
  binaryType = "arraybuffer";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  private readonly listeners = new Map<string, Set<Listener>>();
  peer: MockDataChannel | null = null;

  addEventListener(type: string, listener: Listener) {
    const bucket = this.listeners.get(type) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: unknown) {
    queueMicrotask(() => {
      this.peer?.emit("message", { data });
    });
  }

  close() {
    if (this.readyState === "closed") {
      return;
    }
    this.readyState = "closed";
    queueMicrotask(() => {
      this.emit("close", {});
      if (this.peer && this.peer.readyState !== "closed") {
        this.peer.readyState = "closed";
        this.peer.emit("close", {});
      }
    });
  }

  private emit(type: string, event: { data?: unknown }) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function createChannelPair() {
  const left = new MockDataChannel();
  const right = new MockDataChannel();
  left.peer = right;
  right.peer = left;
  return { left, right };
}

function createDeterministicPayload(size: number) {
  return Uint8Array.from({ length: size }, (_, index) => index % 251);
}

describe("TransferService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams desktop receives into temp storage instead of building a blob", async () => {
    const sender = new TransferService();
    const receiver = new TransferService();
    const { left, right } = createChannelPair();
    const payload = createDeterministicPayload(200_000);
    sender.registerPeer("peer-b", left as unknown as RTCDataChannel);
    receiver.registerPeer("peer-a", right as unknown as RTCDataChannel);

    const completed = new Promise<{ savePath?: string; blob?: Blob }>((resolve, reject) => {
      const offCompleted = receiver.on("transfer-completed", (event) => {
        if (event.direction === "receive") {
          offCompleted();
          offError();
          resolve({ savePath: event.savePath, blob: event.blob });
        }
      });
      const offError = receiver.on("transfer-error", ({ error }) => {
        offCompleted();
        offError();
        reject(error);
      });
    });

    await sender.sendToPeer(
      "peer-b",
      {
        name: "large.bin",
        size: payload.byteLength,
        createChunk: async (start, length) => payload.slice(start, start + length).buffer,
      },
      64 * 1024,
    );

    const result = await completed;
    const writes = vi.mocked(writeFileRange).mock.calls;

    expect(createTransferTempFile).toHaveBeenCalledWith("large.bin", payload.byteLength);
    expect(writes.length).toBe(Math.ceil(payload.byteLength / (64 * 1024)));
    expect(writes[0]?.[0]).toBe("recv-handle");
    expect(writes[0]?.[1]).toBe(0);
    expect(writes.reduce((total, [, , chunk]) => total + chunk.byteLength, 0)).toBe(payload.byteLength);
    expect(persistReceivedFile).toHaveBeenCalledWith("recv-handle", "large.bin");
    expect(deleteTransferTempFile).not.toHaveBeenCalled();
    expect(result.savePath).toBe("C:/Users/Admin/Downloads/large.bin");
    expect(result.blob).toBeUndefined();

    sender.dispose();
    receiver.dispose();
  });
});
