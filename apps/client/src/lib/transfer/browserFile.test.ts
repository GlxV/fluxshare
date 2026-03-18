import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../persist/tauri", () => ({
  createTransferTempFile: vi.fn(async () => ({
    handleId: "temp-handle",
    path: "C:/temp/large.bin",
  })),
  writeFileRange: vi.fn(async () => undefined),
  deleteTransferTempFile: vi.fn(async () => undefined),
}));

import { createTransferTempFile, deleteTransferTempFile, writeFileRange } from "../persist/tauri";
import { copyBrowserFileInChunks, stageBrowserFileForTauri } from "./browserFile";

describe("copyBrowserFileInChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams file data without calling arrayBuffer", async () => {
    let arrayBufferCalled = false;
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
    const file = {
      name: "large.bin",
      size: 5,
      stream() {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            chunks.forEach((chunk) => controller.enqueue(chunk));
            controller.close();
          },
        });
      },
      async arrayBuffer() {
        arrayBufferCalled = true;
        throw new Error("arrayBuffer should not be used");
      },
    } as unknown as File;

    const writes: Array<{ offset: number; bytes: number[] }> = [];
    await copyBrowserFileInChunks(file, async (chunk, offset) => {
      writes.push({ offset, bytes: Array.from(chunk) });
    });

    expect(arrayBufferCalled).toBe(false);
    expect(writes).toEqual([
      { offset: 0, bytes: [1, 2, 3] },
      { offset: 3, bytes: [4, 5] },
    ]);
  });

  it("cleans staged temp files if chunked staging fails", async () => {
    vi.mocked(writeFileRange).mockRejectedValueOnce(new Error("disk full"));
    const file = {
      name: "large.bin",
      size: 3,
      stream() {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        });
      },
    } as unknown as File;

    await expect(stageBrowserFileForTauri(file)).rejects.toThrow("disk full");
    expect(createTransferTempFile).toHaveBeenCalledWith("large.bin", 3);
    expect(deleteTransferTempFile).toHaveBeenCalledWith("temp-handle");
  });
});
