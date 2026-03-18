import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";

type RoomCode = string;
type PeerId = string;

const log = (...args: unknown[]) => console.log("[signaling]", ...args);
const warn = (...args: unknown[]) => console.warn("[signaling]", ...args);

const HEARTBEAT_INTERVAL = 10_000;
const HEARTBEAT_TIMEOUT = 30_000;
const MAX_ROOM_LENGTH = 64;
const MAX_PEER_ID_LENGTH = 64;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_SIGNAL_DATA_BYTES = 24 * 1024;
const MAX_WS_PAYLOAD_BYTES = 32 * 1024;
const MAX_ROOM_PEERS = 32;
const MAX_CONNECTIONS = 256;
const MAX_CONNECTIONS_PER_IP_PER_MINUTE = 24;

function serializedSize(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const roomCodeSchema = z.string().min(1).max(MAX_ROOM_LENGTH);
const peerIdSchema = z.string().min(1).max(MAX_PEER_ID_LENGTH);
const displayNameSchema = z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH);

const baseMessageSchema = z.object({
  room: roomCodeSchema,
});

const clientMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("join"),
      peerId: peerIdSchema,
      displayName: displayNameSchema,
    })
    .merge(baseMessageSchema)
    .strict(),
  z
    .object({
      type: z.literal("signal"),
      from: peerIdSchema,
      to: peerIdSchema,
      data: z.unknown().refine((value) => serializedSize(value) <= MAX_SIGNAL_DATA_BYTES, {
        message: "signal payload too large",
      }),
    })
    .merge(baseMessageSchema)
    .strict(),
  z
    .object({
      type: z.literal("leave"),
      peerId: peerIdSchema,
    })
    .merge(baseMessageSchema)
    .strict(),
  z
    .object({
      type: z.literal("heartbeat"),
      peerId: peerIdSchema,
    })
    .strict(),
]);

const signalingPeerSchema = z.object({
  peerId: peerIdSchema,
  displayName: displayNameSchema,
});

const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("peers"),
    room: roomCodeSchema,
    peers: z.array(signalingPeerSchema).max(MAX_ROOM_PEERS),
  }),
  z.object({
    type: z.literal("signal"),
    from: peerIdSchema,
    to: peerIdSchema,
    data: z.unknown(),
  }),
  z.object({
    type: z.literal("peer-joined"),
    peer: signalingPeerSchema,
  }),
  z.object({
    type: z.literal("peer-left"),
    peerId: peerIdSchema,
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

interface BoundSocketIdentity {
  room: RoomCode;
  peerId: PeerId;
  displayName: string;
}

export interface SignalingServerInstance {
  app: express.Express;
  server: http.Server;
  wss: WebSocketServer;
  close(): Promise<void>;
}

function socketIp(request: http.IncomingMessage) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.split(",")[0]?.trim() ?? "unknown";
  }
  return request.socket.remoteAddress ?? "unknown";
}

export function createSignalingServer(): SignalingServerInstance {
  const app = express();
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const server = http.createServer(app);
  const rooms = new Map<RoomCode, Map<PeerId, RoomPeer>>();
  const socketIdentities = new WeakMap<WebSocket, BoundSocketIdentity>();
  const connectionAttemptsByIp = new Map<string, number[]>();

  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: MAX_WS_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });

  function recordConnectionAttempt(ip: string) {
    const now = Date.now();
    const recent = (connectionAttemptsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < 60_000);
    recent.push(now);
    connectionAttemptsByIp.set(ip, recent);
    return recent.length <= MAX_CONNECTIONS_PER_IP_PER_MINUTE;
  }

  function safeSend(socket: WebSocket, message: Record<string, unknown>) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function ensureRoom(room: RoomCode) {
    let peers = rooms.get(room);
    if (!peers) {
      peers = new Map();
      rooms.set(room, peers);
    }
    return peers;
  }

  function lookupIdentity(socket: WebSocket) {
    return socketIdentities.get(socket) ?? null;
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

  function handleLeave(room: RoomCode, peerId: PeerId, terminateSocket: boolean) {
    const peers = rooms.get(room);
    if (!peers) {
      return;
    }

    const existing = peers.get(peerId);
    if (!existing) {
      return;
    }

    peers.delete(peerId);
    socketIdentities.delete(existing.socket);

    if (terminateSocket && existing.socket.readyState !== WebSocket.CLOSED) {
      try {
        existing.socket.close(1000, "leaving");
      } catch (error) {
        warn("error closing socket", error);
      }
    }

    broadcast(room, peerId, { type: "peer-left", peerId });
    broadcastPeers(room);
    log(`peer ${peerId} left room ${room}`);

    if (peers.size === 0) {
      rooms.delete(room);
    }
  }

  function handleDisconnect(socket: WebSocket) {
    const identity = lookupIdentity(socket);
    if (!identity) {
      return;
    }
    handleLeave(identity.room, identity.peerId, false);
  }

  function handleJoin(socket: WebSocket, msg: Extract<ClientMessage, { type: "join" }>) {
    if (lookupIdentity(socket)) {
      safeSend(socket, { type: "error", message: "socket already joined" });
      socket.close(1008, "already joined");
      return;
    }

    const peers = ensureRoom(msg.room);
    if (peers.size >= MAX_ROOM_PEERS) {
      safeSend(socket, { type: "error", message: "room is full" });
      socket.close(1013, "room full");
      return;
    }

    const existing = peers.get(msg.peerId);
    if (existing && existing.socket.readyState === WebSocket.OPEN) {
      warn(`duplicate peer id ${msg.peerId} attempted for room ${msg.room}`);
      safeSend(socket, { type: "error", message: "peer id already in use" });
      socket.close(1008, "duplicate peer id");
      return;
    }

    const record: RoomPeer = {
      peerId: msg.peerId,
      displayName: msg.displayName,
      socket,
      lastSeen: Date.now(),
    };
    peers.set(msg.peerId, record);
    socketIdentities.set(socket, {
      room: msg.room,
      peerId: msg.peerId,
      displayName: msg.displayName,
    });

    safeSend(socket, {
      type: "peers",
      room: msg.room,
      peers: Array.from(peers.values())
        .filter((peer) => peer.peerId !== msg.peerId)
        .map(({ peerId, displayName }) => ({ peerId, displayName })),
    });

    broadcast(msg.room, msg.peerId, {
      type: "peer-joined",
      peer: { peerId: msg.peerId, displayName: msg.displayName },
    });
    broadcastPeers(msg.room);
    log(`peer ${msg.peerId} joined room ${msg.room}`);
  }

  function handleSignal(socket: WebSocket, msg: Extract<ClientMessage, { type: "signal" }>) {
    const identity = lookupIdentity(socket);
    if (!identity) {
      warn("rejecting signal from unbound socket");
      safeSend(socket, { type: "error", message: "join required before signaling" });
      return;
    }
    if (identity.room !== msg.room || identity.peerId !== msg.from) {
      warn(`rejecting spoofed signal from ${msg.from} on socket for ${identity.peerId}`);
      safeSend(socket, { type: "error", message: "spoofed signal rejected" });
      return;
    }

    const peers = rooms.get(identity.room);
    if (!peers) {
      warn(`room ${identity.room} not found for signal`);
      return;
    }

    const target = peers.get(msg.to);
    if (!target) {
      warn(`target ${msg.to} missing in room ${identity.room}`);
      return;
    }

    safeSend(target.socket, {
      type: "signal",
      from: identity.peerId,
      to: msg.to,
      data: msg.data,
    });
  }

  function refreshHeartbeat(socket: WebSocket, msg: Extract<ClientMessage, { type: "heartbeat" }>) {
    const identity = lookupIdentity(socket);
    if (!identity) {
      warn("rejecting heartbeat from unbound socket");
      safeSend(socket, { type: "error", message: "join required before heartbeat" });
      return;
    }
    if (msg.peerId !== identity.peerId) {
      warn(`rejecting spoofed heartbeat from ${msg.peerId} on socket for ${identity.peerId}`);
      safeSend(socket, { type: "error", message: "spoofed heartbeat rejected" });
      return;
    }

    const peers = rooms.get(identity.room);
    const peer = peers?.get(identity.peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
  }

  function handleLeaveMessage(socket: WebSocket, msg: Extract<ClientMessage, { type: "leave" }>) {
    const identity = lookupIdentity(socket);
    if (!identity) {
      warn("rejecting leave from unbound socket");
      safeSend(socket, { type: "error", message: "join required before leave" });
      return;
    }
    if (identity.room !== msg.room || identity.peerId !== msg.peerId) {
      warn(`rejecting forged leave for ${msg.peerId} on socket for ${identity.peerId}`);
      safeSend(socket, { type: "error", message: "forged leave rejected" });
      return;
    }

    handleLeave(identity.room, identity.peerId, true);
  }

  function handleMessage(socket: WebSocket, msg: ClientMessage) {
    switch (msg.type) {
      case "join":
        handleJoin(socket, msg);
        break;
      case "signal":
        handleSignal(socket, msg);
        break;
      case "leave":
        handleLeaveMessage(socket, msg);
        break;
      case "heartbeat":
        refreshHeartbeat(socket, msg);
        break;
      default:
        warn("unsupported message", msg);
    }
  }

  wss.on("connection", (socket, request) => {
    const ip = socketIp(request);
    if (wss.clients.size > MAX_CONNECTIONS) {
      warn(`rejecting connection from ${ip}: server at capacity`);
      socket.close(1013, "server busy");
      return;
    }
    if (!recordConnectionAttempt(ip)) {
      warn(`rejecting connection from ${ip}: rate limited`);
      socket.close(1013, "rate limited");
      return;
    }

    log(`new connection from ${ip}`);

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

  const interval = setInterval(() => {
    const now = Date.now();
    for (const [room, peers] of rooms.entries()) {
      for (const peer of peers.values()) {
        if (now - peer.lastSeen > HEARTBEAT_TIMEOUT) {
          warn(`peer ${peer.peerId} timed out in room ${room}`);
          handleLeave(room, peer.peerId, true);
        }
      }
    }
  }, HEARTBEAT_INTERVAL);
  interval.unref?.();

  return {
    app,
    server,
    wss,
    async close() {
      clearInterval(interval);
      for (const client of wss.clients) {
        try {
          client.close(1001, "server shutdown");
        } catch {
          // ignore shutdown races
        }
      }
      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          server.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }
            resolve();
          });
        });
      });
    },
  };
}

const instance = createSignalingServer();
const { app, server, wss } = instance;

export { app, clientMessageSchema, server, serverMessageSchema, wss };
