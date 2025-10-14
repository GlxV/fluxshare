import { describe, expect, it } from "vitest";
import { clientMessageSchema, serverMessageSchema } from "./index";

describe("client message schema", () => {
  it("accepts join message", () => {
    const msg = {
      type: "join",
      room: "AB12CD",
      peerId: "alice",
      displayName: "Alice",
    } as const;
    expect(() => clientMessageSchema.parse(msg)).not.toThrow();
  });

  it("rejects malformed signal", () => {
    const msg = { type: "signal", room: "", from: "a", to: "", data: {} };
    expect(() => clientMessageSchema.parse(msg)).toThrow();
  });
});

describe("server message schema", () => {
  it("accepts peers payload", () => {
    const msg = {
      type: "peers",
      room: "AB12CD",
      peers: [{ peerId: "p1", displayName: "Alice" }],
    } as const;
    expect(() => serverMessageSchema.parse(msg)).not.toThrow();
  });

  it("rejects peer-left without id", () => {
    const msg = { type: "peer-left" };
    expect(() => serverMessageSchema.parse(msg)).toThrow();
  });
});
