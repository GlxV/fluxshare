import { SignalingClient } from "../signaling";
import { getEnv } from "../../utils/env";

export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export type PeerManagerEventMap = {
  "connection-state": { peerId: string; state: PeerConnectionState };
  "ice-connection-state": { peerId: string; state: RTCIceConnectionState };
  "data-channel": { peerId: string; channel: RTCDataChannel };
  "peer-removed": { peerId: string };
};

export type PeerManagerEvent = keyof PeerManagerEventMap;

export type PeerSignal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

interface PeerConnectionEntry {
  peerId: string;
  connection: RTCPeerConnection;
  channel: RTCDataChannel | null;
  isOffering: boolean;
  reconnectAttempts: number;
  reconnectTimer: number | null;
}

class EventEmitter {
  private listeners = new Map<PeerManagerEvent, Set<(payload: any) => void>>();

  on<T extends PeerManagerEvent>(event: T, handler: (payload: PeerManagerEventMap[T]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as any);
    return () => this.off(event, handler as any);
  }

  off<T extends PeerManagerEvent>(event: T, handler: (payload: PeerManagerEventMap[T]) => void) {
    this.listeners.get(event)?.delete(handler as any);
  }

  emit<T extends PeerManagerEvent>(event: T, payload: PeerManagerEventMap[T]) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("fluxshare:peer-manager:listener", error);
      }
    });
  }
}

const RECONNECT_DELAY = 2_000;
const MAX_RECONNECT_ATTEMPTS = 3;

export interface PeerManagerOptions {
  reconnect?: boolean;
}

export class PeerManager {
  private readonly signaling: SignalingClient;
  private readonly emitter = new EventEmitter();
  private readonly peers = new Map<string, PeerConnectionEntry>();
  private readonly reconnectEnabled: boolean;
  private unsubscribeSignal: (() => void) | null = null;

  constructor(signaling: SignalingClient, options: PeerManagerOptions = {}) {
    this.signaling = signaling;
    this.reconnectEnabled = options.reconnect ?? true;
    this.unsubscribeSignal = this.signaling.on("signal", ({ from, data }) => {
      this.handleSignal(from, data as PeerSignal);
    });
  }

  on = this.emitter.on.bind(this.emitter);
  off = this.emitter.off.bind(this.emitter);

  async connectTo(peerId: string) {
    const entry = this.ensurePeer(peerId);
    entry.isOffering = true;
    const channel = entry.connection.createDataChannel("fluxshare", { ordered: true });
    this.prepareDataChannel(peerId, channel);
    const offer = await entry.connection.createOffer();
    await entry.connection.setLocalDescription(offer);
    this.signaling.sendSignal(peerId, { type: "offer", sdp: offer });
    return channel;
  }

  dispose() {
    this.unsubscribeSignal?.();
    this.unsubscribeSignal = null;
    this.peers.forEach((entry) => {
      entry.connection.onicecandidate = null;
      entry.connection.onconnectionstatechange = null;
      entry.connection.oniceconnectionstatechange = null;
      entry.connection.ondatachannel = null;
      entry.connection.close();
      if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
      }
    });
    this.peers.clear();
  }

  disconnect(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.connection.close();
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
    }
    this.peers.delete(peerId);
    this.emitter.emit("peer-removed", { peerId });
  }

  private async handleSignal(from: string, signal: PeerSignal) {
    const entry = this.ensurePeer(from);
    switch (signal.type) {
      case "offer": {
        entry.isOffering = false;
        await entry.connection.setRemoteDescription(signal.sdp);
        const answer = await entry.connection.createAnswer();
        await entry.connection.setLocalDescription(answer);
        this.signaling.sendSignal(from, { type: "answer", sdp: answer });
        break;
      }
      case "answer": {
        await entry.connection.setRemoteDescription(signal.sdp);
        break;
      }
      case "candidate": {
        if (signal.candidate) {
          try {
            await entry.connection.addIceCandidate(signal.candidate);
          } catch (error) {
            console.error("fluxshare:peer-manager", "failed to add ICE", error);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private ensurePeer(peerId: string): PeerConnectionEntry {
    const existing = this.peers.get(peerId);
    if (existing) {
      return existing;
    }

    const { iceServers } = getEnv();
    const connection = new RTCPeerConnection({ iceServers });
    const entry: PeerConnectionEntry = {
      peerId,
      connection,
      channel: null,
      isOffering: false,
      reconnectAttempts: 0,
      reconnectTimer: null,
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendSignal(peerId, { type: "candidate", candidate: event.candidate.toJSON() });
      }
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState as PeerConnectionState;
      this.emitter.emit("connection-state", { peerId, state });
      if (state === "failed" || state === "disconnected") {
        this.scheduleReconnect(peerId);
      }
      if (state === "closed") {
        this.disconnect(peerId);
      }
    };

    connection.oniceconnectionstatechange = () => {
      this.emitter.emit("ice-connection-state", {
        peerId,
        state: connection.iceConnectionState,
      });
    };

    connection.ondatachannel = (event) => {
      const channel = event.channel;
      this.prepareDataChannel(peerId, channel);
    };

    this.peers.set(peerId, entry);
    return entry;
  }

  private prepareDataChannel(peerId: string, channel: RTCDataChannel) {
    const entry = this.ensurePeer(peerId);
    if (entry.channel && entry.channel !== channel) {
      entry.channel.close();
    }
    entry.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      entry.reconnectAttempts = 0;
      this.emitter.emit("data-channel", { peerId, channel });
    };
    channel.onclose = () => {
      if (this.reconnectEnabled) {
        this.scheduleReconnect(peerId);
      }
    };
    channel.onerror = (event) => {
      console.error("fluxshare:peer-manager", "datachannel error", event);
    };
  }

  private scheduleReconnect(peerId: string) {
    if (!this.reconnectEnabled) return;
    const entry = this.peers.get(peerId);
    if (!entry) return;
    if (entry.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }
    if (entry.reconnectTimer) {
      return;
    }
    entry.reconnectAttempts += 1;
    entry.reconnectTimer = window.setTimeout(() => {
      entry.reconnectTimer = null;
      this.restartPeer(peerId).catch((error) => {
        console.error("fluxshare:peer-manager", "reconnect failed", error);
      });
    }, RECONNECT_DELAY);
  }

  private async restartPeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    try {
      entry.connection.onicecandidate = null;
      entry.connection.onconnectionstatechange = null;
      entry.connection.oniceconnectionstatechange = null;
      entry.connection.ondatachannel = null;
      entry.connection.close();
    } catch (error) {
      console.warn("fluxshare:peer-manager", "error closing connection", error);
    }
    this.peers.delete(peerId);
    const channel = await this.connectTo(peerId);
    if (channel.readyState === "open") {
      this.emitter.emit("data-channel", { peerId, channel });
    }
  }
}

export default PeerManager;
