import { nanoid } from "@/utils/nanoid";
import {
  SignalingClientMessage,
  SignalingHeartbeat,
  SignalingPeer,
  SignalingServerMessage,
  signalingServerMessageSchema,
} from "../types/protocol";
import { getEnv } from "../utils/env";

export type SignalingEventMap = {
  open: void;
  close: { willReconnect: boolean };
  peers: SignalingPeer[];
  "peer-joined": SignalingPeer;
  "peer-left": { peerId: string };
  signal: { from: string; to: string; data: unknown };
  error: { error: Error };
};

export type SignalingEvent = keyof SignalingEventMap;

const HEARTBEAT_INTERVAL = 10_000;
const RECONNECT_DELAY = 2_000;

class TypedEventEmitter {
  private listeners = new Map<SignalingEvent, Set<(payload: any) => void>>();

  on<T extends SignalingEvent>(event: T, handler: (payload: SignalingEventMap[T]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as any);
    return () => this.off(event, handler as any);
  }

  off<T extends SignalingEvent>(event: T, handler: (payload: SignalingEventMap[T]) => void) {
    this.listeners.get(event)?.delete(handler as any);
  }

  emit<T extends SignalingEvent>(event: T, payload: SignalingEventMap[T]) {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error("fluxshare:signaling:listener", error);
      }
    });
  }
}

export interface SignalingClientOptions {
  room: string;
  peerId?: string;
  displayName: string;
}

export class SignalingClient {
  private readonly url: string;
  private readonly room: string;
  private readonly displayName: string;
  private readonly emitter = new TypedEventEmitter();
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private manualClose = false;
  public readonly peerId: string;

  constructor(options: SignalingClientOptions) {
    const { signalingUrl } = getEnv();
    this.url = signalingUrl;
    this.room = options.room;
    this.displayName = options.displayName;
    this.peerId = options.peerId ?? nanoid(10);
  }

  on = this.emitter.on.bind(this.emitter);
  off = this.emitter.off.bind(this.emitter);

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.manualClose = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      console.log("fluxshare:signaling", "connected");
      this.send({
        type: "join",
        room: this.room,
        peerId: this.peerId,
        displayName: this.displayName,
      });
      this.startHeartbeat();
      this.emitter.emit("open", undefined);
    });

    ws.addEventListener("close", () => {
      console.log("fluxshare:signaling", "closed");
      this.stopHeartbeat();
      const shouldReconnect = !this.manualClose;
      if (shouldReconnect) {
        this.scheduleReconnect();
      }
      this.emitter.emit("close", { willReconnect: shouldReconnect });
    });

    ws.addEventListener("error", (event) => {
      console.error("fluxshare:signaling", "error", event);
      this.emitter.emit("error", { error: new Error("signaling socket error") });
    });

    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data.toString());
        const parsed: SignalingServerMessage = signalingServerMessageSchema.parse(payload);
        this.handleServerMessage(parsed);
      } catch (error) {
        console.error("fluxshare:signaling", "invalid payload", error);
      }
    });
  }

  disconnect() {
    this.manualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "leave", room: this.room, peerId: this.peerId });
    }
    this.ws?.close();
    this.ws = null;
  }

  sendSignal(to: string, data: unknown) {
    this.send({ type: "signal", room: this.room, from: this.peerId, to, data });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      const heartbeat: SignalingHeartbeat = { type: "heartbeat", peerId: this.peerId };
      this.send(heartbeat);
    }, HEARTBEAT_INTERVAL) as unknown as number;
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(message: SignalingClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("fluxshare:signaling", "socket not ready, dropping", message.type);
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  private handleServerMessage(message: SignalingServerMessage) {
    switch (message.type) {
      case "peers":
        this.emitter.emit("peers", message.peers);
        break;
      case "peer-joined":
        this.emitter.emit("peer-joined", message.peer);
        break;
      case "peer-left":
        this.emitter.emit("peer-left", { peerId: message.peerId });
        break;
      case "signal":
        this.emitter.emit("signal", {
          from: message.from,
          to: message.to,
          data: message.data,
        });
        break;
      default:
        break;
    }
  }
}
