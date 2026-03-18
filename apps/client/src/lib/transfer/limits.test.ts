import { describe, expect, it } from "vitest";
import { validateTransferMeta } from "./limits";

describe("validateTransferMeta", () => {
  it("rejects absurd chunk counts before allocation", () => {
    expect(() =>
      validateTransferMeta({
        id: "x",
        name: "huge.bin",
        size: 1024,
        chunkSize: 64 * 1024,
        totalChunks: 9_999_999,
      }),
    ).toThrow(/chunk count/i);
  });

  it("rejects inconsistent metadata", () => {
    expect(() =>
      validateTransferMeta({
        id: "x",
        name: "bad.bin",
        size: 1024,
        chunkSize: 16 * 1024,
        totalChunks: 2,
      }),
    ).toThrow(/inconsistent/i);
  });
});
