import { describe, expect, it } from "vitest";
import { messageSchema } from "./index";

describe("message schema", () => {
  it("accepts valid offer", () => {
    const msg = {
      type: "offer",
      from: "alice",
      to: "bob",
      sdp: "v=0...",
    };
    expect(() => messageSchema.parse(msg)).not.toThrow();
  });

  it("rejects invalid register", () => {
    const msg = { type: "register", id: "" };
    expect(() => messageSchema.parse(msg)).toThrow();
  });
});
