import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemeMode = "dark" | "light";

export type PeerConnectionLifecycle =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export interface RoomPeer {
  peerId: string;
  displayName: string;
  joinedAt: number;
  status: PeerConnectionLifecycle | "idle";
  iceState?: RTCIceConnectionState;
}

export interface PeerConnectionSnapshot {
  peerId: string;
  state: PeerConnectionLifecycle;
  channelState?: RTCDataChannelState;
  iceState?: RTCIceConnectionState;
  updatedAt: number;
}

interface RoomStoreState {
  roomId: string | null;
  selfPeerId: string | null;
  peers: RoomPeer[];
  peerConnections: Record<string, PeerConnectionSnapshot>;
  theme: ThemeMode;
  setTheme(theme: ThemeMode): void;
  ensureSelfPeerId(): string;
  setRoomId(roomId: string | null): void;
  setPeers(peers: RoomPeer[]): void;
  upsertPeer(peer: RoomPeer): void;
  removePeer(peerId: string): void;
  clearPeers(): void;
  setPeerConnection(peerId: string, snapshot: PeerConnectionSnapshot): void;
  removePeerConnection(peerId: string): void;
  clearPeerConnections(): void;
  resetRoomState(): void;
}

const fallbackStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const storage = createJSONStorage<Pick<RoomStoreState, "roomId" | "selfPeerId" | "peers" | "peerConnections" | "theme">>(() => {
  if (typeof window === "undefined") {
    return fallbackStorage;
  }
  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn("fluxshare:room-store", "sessionStorage unavailable", error);
    return fallbackStorage;
  }
});

const defaultTheme: ThemeMode = "dark"; // LLM-LOCK: default theme must remain dark to comply with official palette

export const useRoomStore = create<RoomStoreState>()(
  persist(
    (set, get) => ({
      roomId: null,
      selfPeerId: null,
      peers: [],
      peerConnections: {},
      theme: defaultTheme,
      setTheme: (theme) => set({ theme }),
      ensureSelfPeerId: () => {
        const existing = get().selfPeerId;
        if (existing) {
          return existing;
        }
        const next = nanoid(10).toUpperCase();
        set({ selfPeerId: next });
        return next;
      },
      setRoomId: (roomId) => set({ roomId }),
      setPeers: (peers) => set({ peers }),
      upsertPeer: (peer) =>
        set((state) => {
          const peers = state.peers.filter((entry) => entry.peerId !== peer.peerId);
          return { peers: [...peers, peer] };
        }),
      removePeer: (peerId) =>
        set((state) => ({ peers: state.peers.filter((peer) => peer.peerId !== peerId) })),
      clearPeers: () => set({ peers: [] }),
      setPeerConnection: (peerId, snapshot) =>
        set((state) => ({
          peerConnections: {
            ...state.peerConnections,
            [peerId]: { ...snapshot, peerId, updatedAt: Date.now() },
          },
        })),
      removePeerConnection: (peerId) =>
        set((state) => {
          const { [peerId]: _removed, ...rest } = state.peerConnections;
          return { peerConnections: rest };
        }),
      clearPeerConnections: () => set({ peerConnections: {} }),
      resetRoomState: () =>
        set((state) => ({
          roomId: null,
          peers: [],
          peerConnections: {},
          selfPeerId: state.selfPeerId ?? null,
        })),
    }),
    {
      name: "fluxshare-room",
      storage,
      partialize: (state) => ({
        roomId: state.roomId,
        selfPeerId: state.selfPeerId,
        peers: state.peers,
        peerConnections: state.peerConnections,
        theme: state.theme,
      }),
    },
  ),
);

type CopyInviteResult = { url: string | null; copied: boolean };

function normalizeRoomId(roomId: string | null | undefined): string | null {
  if (!roomId) return null;
  const trimmed = roomId.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function buildInviteUrl(roomId: string | null): string | null {
  if (!roomId) return null;
  if (typeof window === "undefined") return null;
  const origin = window.location?.origin ?? "";
  if (!origin) return null;
  return `${origin.replace(/\/$/, "")}/room/${roomId}`;
}

export function useRoom() {
  const roomId = useRoomStore((state) => state.roomId);
  const selfPeerId = useRoomStore((state) => state.selfPeerId);
  const peers = useRoomStore((state) => state.peers);
  const peerConnections = useRoomStore((state) => state.peerConnections);
  const theme = useRoomStore((state) => state.theme);
  const setTheme = useRoomStore((state) => state.setTheme);

  const createRoom = () => {
    const state = useRoomStore.getState();
    const normalizedSelf = state.ensureSelfPeerId();
    const newRoom = nanoid(6).toUpperCase();
    state.clearPeers();
    state.clearPeerConnections();
    state.setRoomId(newRoom);
    return { roomId: newRoom, selfPeerId: normalizedSelf };
  };

  const joinRoom = (targetRoomId: string): { roomId: string; selfPeerId: string } | null => {
    const normalized = normalizeRoomId(targetRoomId);
    if (!normalized) {
      return null;
    }
    const state = useRoomStore.getState();
    const self = state.ensureSelfPeerId();
    if (state.roomId !== normalized) {
      state.clearPeers();
      state.clearPeerConnections();
    }
    state.setRoomId(normalized);
    return { roomId: normalized, selfPeerId: self };
  };

  const leaveRoom = () => {
    const state = useRoomStore.getState();
    state.resetRoomState();
  };

  const copyInviteLink = async (): Promise<CopyInviteResult> => {
    const state = useRoomStore.getState();
    const currentRoom = normalizeRoomId(state.roomId);
    const url = buildInviteUrl(currentRoom);
    if (!url) {
      return { url: null, copied: false };
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(url);
        return { url, copied: true };
      } catch (error) {
        console.warn("fluxshare:room-store", "copy failed", error);
        return { url, copied: false };
      }
    }
    return { url, copied: false };
  };

  return {
    roomId,
    selfPeerId,
    peers,
    peerConnections,
    theme,
    setTheme,
    createRoom,
    joinRoom,
    leaveRoom,
    copyInviteLink,
  };
}

export type UseRoomReturn = ReturnType<typeof useRoom>;
