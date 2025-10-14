import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";

type RoomCode = string;
type PeerId = string;

const log = (...args: unknown[]) => console.log("[signaling]", ...args);
const warn = (...args: unknown[]) => console.warn("[signaling]", ...args);

const HEARTBEAT_INTERVAL = 10_000; // ms
const HEARTBEAT_TIMEOUT = 30_000; // ms

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const server = http.createServer(app);

const baseMessageSchema = z.object({
  room: z.string().min(1),
});

const clientMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("join"),
      peerId: z.string().min(1),
      displayName: z.string().min(1),
    })
    .merge(baseMessageSchema),
  z
    .object({
      type: z.literal("signal"),
      from: z.string().min(1),
      to: z.string().min(1),
      data: z.unknown(),
    })
    .merge(baseMessageSchema),
  z
    .object({
      type: z.literal("leave"),
      peerId: z.string().min(1),
    })
    .merge(baseMessageSchema),
  z.object({
    type: z.literal("heartbeat"),
    peerId: z.string().min(1),
  }),
]);

const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("peers"),
    room: z.string().min(1),
    peers: z.array(
      z.object({
        peerId: z.string().min(1),
        displayName: z.string().min(1),
      }),
    ),
  }),
  z.object({
    type: z.literal("signal"),
    from: z.string().min(1),
    to: z.string().min(1),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal("peer-joined"),
    peer: z.object({
      peerId: z.string().min(1),
      displayName: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("peer-left"),
    peerId: z.string().min(1),
  }),
]);

type ClientMessage = z.infer<typeof clientMessageSchema>;
type ServerMessage = z.infer<typeof serverMessageSchema>;

interface RoomPeer {
  peerId: PeerId;
  displayName: string;
  socket: WebSocket;
  lastSeen: number;
}

const rooms = new Map<RoomCode, Map<PeerId, RoomPeer>>();

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  log("new connection");

  socket.on("message", (raw) => {
    let parsed: ClientMessage;
    try {
      parsed = clientMessageSchema.parse(JSON.parse(raw.toString()));
    } catch (error) {
      warn("invalid message", error);
      safeSend(socket, { type: "error", message: "invalid payload" });
      return;
    }

    handleMessage(socket, parsed);
  });

  socket.on("close", () => {
    handleDisconnect(socket);
  });

  socket.on("error", (error) => {
    warn("socket error", error);
  });
});

function handleMessage(socket: WebSocket, msg: ClientMessage) {
  switch (msg.type) {
    case "join":
      handleJoin(socket, msg);
      break;
    case "signal":
      handleSignal(msg);
      break;
    case "leave":
      handleLeave(msg.room, msg.peerId);
      break;
    case "heartbeat":
      refreshHeartbeat(msg.peerId);
      break;
    default:
      warn("unsupported message", msg);
  }
}

function handleJoin(socket: WebSocket, msg: Extract<ClientMessage, { type: "join" }>) {
  const { room, peerId, displayName } = msg;
  const peers = ensureRoom(room);
  const existing = peers.get(peerId);
  if (existing) {
    log(`peer ${peerId} rejoining room ${room}`);
    existing.socket.terminate();
  }

  const record: RoomPeer = {
    peerId,
    displayName,
    socket,
    lastSeen: Date.now(),
  };
  peers.set(peerId, record);

  socket.once("close", () => {
    if (peers.get(peerId)?.socket === socket) {
      handleLeave(room, peerId);
    }
  });

  safeSend(socket, {
    type: "peers",
    room,
    peers: Array.from(peers.values())
      .filter((peer) => peer.peerId !== peerId)
      .map(({ peerId: id, displayName: name }) => ({ peerId: id, displayName: name })),
  });

  broadcast(room, peerId, {
    type: "peer-joined",
    peer: { peerId, displayName },
  });
  broadcastPeers(room);

  log(`peer ${peerId} joined room ${room}`);
}

function handleSignal(msg: Extract<ClientMessage, { type: "signal" }>) {
  const peers = rooms.get(msg.room);
  if (!peers) {
    warn(`room ${msg.room} not found for signal`);
    return;
  }
  const target = peers.get(msg.to);
  if (!target) {
    warn(`target ${msg.to} missing in room ${msg.room}`);
    return;
  }
  safeSend(target.socket, {
    type: "signal",
    from: msg.from,
    to: msg.to,
    data: msg.data,
  });
}

function ensureRoom(room: RoomCode) {
  let peers = rooms.get(room);
  if (!peers) {
    peers = new Map();
    rooms.set(room, peers);
  }
  return peers;
}

function handleLeave(room: RoomCode, peerId: PeerId) {
  const peers = rooms.get(room);
  if (!peers) {
    return;
  }
  const existing = peers.get(peerId);
  if (!existing) {
    return;
  }
  peers.delete(peerId);
  try {
    existing.socket.terminate();
  } catch (err) {
    warn("error terminating socket", err);
  }
  broadcast(room, peerId, { type: "peer-left", peerId });
  broadcastPeers(room);
  log(`peer ${peerId} left room ${room}`);
  if (peers.size === 0) {
    rooms.delete(room);
  }
}

function handleDisconnect(socket: WebSocket) {
  for (const [room, peers] of rooms.entries()) {
    for (const peer of peers.values()) {
      if (peer.socket === socket) {
        handleLeave(room, peer.peerId);
        return;
      }
    }
  }
}

function refreshHeartbeat(peerId: PeerId) {
  for (const peers of rooms.values()) {
    const peer = peers.get(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
  }
}

function broadcast(room: RoomCode, excludePeerId: PeerId, message: ServerMessage) {
  const peers = rooms.get(room);
  if (!peers) {
    return;
  }
  const payload = JSON.stringify(message);
  for (const peer of peers.values()) {
    if (peer.peerId === excludePeerId) {
      continue;
    }
    if (peer.socket.readyState === WebSocket.OPEN) {
      peer.socket.send(payload);
    }
  }
}

function broadcastPeers(room: RoomCode) {
  const peers = rooms.get(room);
  if (!peers) {
    return;
  }
  const payload: ServerMessage = {
    type: "peers",
    room,
    peers: Array.from(peers.values()).map(({ peerId, displayName }) => ({
      peerId,
      displayName,
    })),
  };
  const serialized = JSON.stringify(payload);
  for (const peer of peers.values()) {
    if (peer.socket.readyState === WebSocket.OPEN) {
      peer.socket.send(serialized);
    }
  }
}

function safeSend(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [room, peers] of rooms.entries()) {
    for (const peer of peers.values()) {
      if (now - peer.lastSeen > HEARTBEAT_TIMEOUT) {
        warn(`peer ${peer.peerId} timed out in room ${room}`);
        handleLeave(room, peer.peerId);
      }
    }
  }
}, HEARTBEAT_INTERVAL).unref?.();

export { app, server, wss, clientMessageSchema, serverMessageSchema };
