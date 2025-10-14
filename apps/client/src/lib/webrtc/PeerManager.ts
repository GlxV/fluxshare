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
  "data-channel": { peerId: string; channel: RTCDataChannel };
  "ice-connection-state": { peerId: string; state: RTCIceConnectionState };
};

export type PeerManagerEvent = keyof PeerManagerEventMap;

export type PeerSignal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

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

interface PeerConnectionEntry {
  peerId: string;
  connection: RTCPeerConnection;
  channel: RTCDataChannel | null;
  isOffering: boolean;
}

export class PeerManager {
  private readonly signaling: SignalingClient;
  private readonly emitter = new EventEmitter();
  private readonly peers = new Map<string, PeerConnectionEntry>();

  constructor(signaling: SignalingClient) {
    this.signaling = signaling;
    this.signaling.on("signal", ({ from, data }) => {
      this.handleSignal(from, data as PeerSignal);
    });
  }

  on = this.emitter.on.bind(this.emitter);
  off = this.emitter.off.bind(this.emitter);

  async connectTo(peerId: string) {
    const entry = this.ensurePeer(peerId);
    entry.isOffering = true;
    const channel = entry.connection.createDataChannel("fluxshare", {
      ordered: true,
    });
    this.prepareDataChannel(peerId, channel);
    const offer = await entry.connection.createOffer();
    await entry.connection.setLocalDescription(offer);
    this.signaling.sendSignal(peerId, { type: "offer", sdp: offer });
    return channel;
  }

  async handleSignal(from: string, signal: PeerSignal) {
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

  disconnect(peerId: string) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.connection.close();
    this.peers.delete(peerId);
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
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendSignal(peerId, { type: "candidate", candidate: event.candidate.toJSON() });
      }
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState as PeerConnectionState;
      this.emitter.emit("connection-state", { peerId, state });
      if (state === "failed" || state === "closed" || state === "disconnected") {
        // leave data channel cleanup to consumer
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
    const entry = this.peers.get(peerId);
    if (!entry) return;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 1_000_000;
    entry.channel = channel;
    channel.addEventListener("open", () => {
      console.log("fluxshare:webrtc", `datachannel open with ${peerId}`);
      this.emitter.emit("data-channel", { peerId, channel });
    });
    channel.addEventListener("close", () => {
      console.log("fluxshare:webrtc", `datachannel closed with ${peerId}`);
    });
    channel.addEventListener("error", (event) => {
      console.error("fluxshare:webrtc", "datachannel error", event);
    });
  }
}
