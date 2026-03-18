import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { clientMessageSchema, createSignalingServer, serverMessageSchema } from "./index";

const TEST_ROOM = "ROOM-123";

async function startServer() {
  const instance = createSignalingServer();
  await new Promise<void>((resolve) => {
    instance.server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = instance.server.address() as AddressInfo;
  return {
    ...instance,
    url: `ws://127.0.0.1:${address.port}/ws`,
  };
}

async function connect(url: string) {
  return await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function closeSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }
  await new Promise<void>((resolve) => {
    socket.once("close", () => resolve());
    socket.close();
  });
}

async function waitForJson(socket: WebSocket, timeoutMs = 2_000) {
  return await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
    socket.once("message", (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

async function waitForMessageType(socket: WebSocket, type: string, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const message = await waitForJson(socket, timeoutMs);
    if (message?.type === type) {
      return message;
    }
  }
  throw new Error(`timed out waiting for ${type}`);
}

async function drainMessages(socket: WebSocket, durationMs = 50) {
  await new Promise<void>((resolve) => {
    const listener = () => undefined;
    socket.on("message", listener);
    setTimeout(() => {
      socket.off("message", listener);
      resolve();
    }, durationMs);
  });
}

function sendJson(socket: WebSocket, payload: unknown) {
  socket.send(JSON.stringify(payload));
}

async function join(socket: WebSocket, peerId: string, displayName = peerId) {
  sendJson(socket, {
    type: "join",
    room: TEST_ROOM,
    peerId,
    displayName,
  });
  await waitForMessageType(socket, "peers");
}

describe("client message schema", () => {
  it("accepts join message", () => {
    const msg = {
      type: "join",
      room: TEST_ROOM,
      peerId: "alice",
      displayName: "Alice",
    } as const;
    expect(() => clientMessageSchema.parse(msg)).not.toThrow();
  });

  it("rejects malformed signal", () => {
    const msg = { type: "signal", room: "", from: "a", to: "", data: {} };
    expect(() => clientMessageSchema.parse(msg)).toThrow();
  });

  it("rejects oversized signaling fields and payloads", () => {
    expect(() =>
      clientMessageSchema.parse({
        type: "join",
        room: "r".repeat(65),
        peerId: "alice",
        displayName: "Alice",
      }),
    ).toThrow();

    expect(() =>
      clientMessageSchema.parse({
        type: "signal",
        room: TEST_ROOM,
        from: "alice",
        to: "bob",
        data: { blob: "x".repeat(30_000) },
      }),
    ).toThrow();
  });
});

describe("signaling server security", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) {
        await next();
      }
    }
  });

  it("rejects spoofed signals from a mismatched peer id", async () => {
    const instance = await startServer();
    cleanup.push(() => instance.close());
    const alice = await connect(instance.url);
    const bob = await connect(instance.url);
    cleanup.push(() => closeSocket(alice));
    cleanup.push(() => closeSocket(bob));

    await join(alice, "alice", "Alice");
    await join(bob, "bob", "Bob");
    await waitForMessageType(alice, "peer-joined");
    await drainMessages(alice);
    await drainMessages(bob);

    sendJson(bob, {
      type: "signal",
      room: TEST_ROOM,
      from: "alice",
      to: "bob",
      data: { candidate: "fake" },
    });

    const error = await waitForJson(bob);
    expect(error.message).toContain("spoofed signal rejected");
  });

  it("rejects forged leave messages for another peer", async () => {
    const instance = await startServer();
    cleanup.push(() => instance.close());
    const alice = await connect(instance.url);
    const bob = await connect(instance.url);
    cleanup.push(() => closeSocket(alice));
    cleanup.push(() => closeSocket(bob));

    await join(alice, "alice", "Alice");
    await join(bob, "bob", "Bob");
    await waitForMessageType(alice, "peer-joined");
    await drainMessages(alice);
    await drainMessages(bob);

    sendJson(bob, {
      type: "leave",
      room: TEST_ROOM,
      peerId: "alice",
    });

    const error = await waitForJson(bob);
    expect(error.message).toContain("forged leave rejected");

    sendJson(alice, {
      type: "signal",
      room: TEST_ROOM,
      from: "alice",
      to: "bob",
      data: { hello: "world" },
    });

    const forwarded = await waitForMessageType(bob, "signal");
    expect(forwarded.from).toBe("alice");
  });

  it("rejects fake heartbeats for another peer", async () => {
    const instance = await startServer();
    cleanup.push(() => instance.close());
    const alice = await connect(instance.url);
    const bob = await connect(instance.url);
    cleanup.push(() => closeSocket(alice));
    cleanup.push(() => closeSocket(bob));

    await join(alice, "alice", "Alice");
    await join(bob, "bob", "Bob");
    await waitForMessageType(alice, "peer-joined");
    await drainMessages(alice);
    await drainMessages(bob);

    sendJson(bob, {
      type: "heartbeat",
      peerId: "alice",
    });

    const error = await waitForJson(bob);
    expect(error.message).toContain("spoofed heartbeat rejected");
  });

  it("rejects duplicate peer ids without evicting the live peer", async () => {
    const instance = await startServer();
    cleanup.push(() => instance.close());
    const first = await connect(instance.url);
    const duplicate = await connect(instance.url);
    cleanup.push(() => closeSocket(first));

    await join(first, "alice", "Alice");

    sendJson(duplicate, {
      type: "join",
      room: TEST_ROOM,
      peerId: "alice",
      displayName: "Mallory",
    });

    const closePromise = new Promise<{ code: number }>((resolve) => {
      duplicate.once("close", (code) => resolve({ code }));
    });
    const error = await waitForJson(duplicate);
    expect(error.message).toContain("peer id already in use");
    const closed = await closePromise;
    expect(closed.code).toBe(1008);

    await drainMessages(first);
    const bob = await connect(instance.url);
    cleanup.push(() => closeSocket(bob));
    await join(bob, "bob", "Bob");
    const peerJoined = await waitForMessageType(first, "peer-joined");
    expect(peerJoined.peer.peerId).toBe("bob");
  });

  it("closes oversized websocket frames early", async () => {
    const instance = await startServer();
    cleanup.push(() => instance.close());
    const socket = await connect(instance.url);

    const closed = new Promise<{ code: number }>((resolve) => {
      socket.once("close", (code) => resolve({ code }));
    });

    socket.send("x".repeat(40_000));
    const result = await closed;
    expect(result.code).toBe(1009);
  });
});

describe("server message schema", () => {
  it("accepts peers payload", () => {
    const msg = {
      type: "peers",
      room: TEST_ROOM,
      peers: [{ peerId: "p1", displayName: "Alice" }],
    } as const;
    expect(() => serverMessageSchema.parse(msg)).not.toThrow();
  });

  it("rejects peer-left without id", () => {
    const msg = { type: "peer-left" };
    expect(() => serverMessageSchema.parse(msg)).toThrow();
  });
});
