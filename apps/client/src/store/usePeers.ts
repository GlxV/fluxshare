import { create } from "zustand";

export type PeerConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export interface PeerInfo {
  peerId: string;
  displayName: string;
  status: PeerConnectionStatus;
  iceState?: RTCIceConnectionState;
  lastUpdated: number;
}

interface PeersState {
  peers: Record<string, PeerInfo>;
  setPeers: (peers: PeerInfo[]) => void;
  upsertPeer: (peer: PeerInfo) => void;
  updatePeerState: (peerId: string, patch: Partial<PeerInfo>) => void;
  removePeer: (peerId: string) => void;
  reset: () => void;
}

export const usePeersStore = create<PeersState>((set) => ({
  peers: {},
  setPeers: (peers) =>
    set(() => ({
      peers: Object.fromEntries(peers.map((peer) => [peer.peerId, peer])),
    })),
  upsertPeer: (peer) =>
    set((state) => ({
      peers: {
        ...state.peers,
        [peer.peerId]: peer,
      },
    })),
  updatePeerState: (peerId, patch) =>
    set((state) => {
      const existing = state.peers[peerId];
      if (!existing) return state;
      return {
        peers: {
          ...state.peers,
          [peerId]: {
            ...existing,
            ...patch,
            lastUpdated: Date.now(),
          },
        },
      };
    }),
  removePeer: (peerId) =>
    set((state) => {
      const { [peerId]: _removed, ...rest } = state.peers;
      return { peers: rest };
    }),
  reset: () => set({ peers: {} }),
}));
