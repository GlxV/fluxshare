import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type TransferDirection = "send" | "receive";

export interface SelectedFileMeta {
  fileId: string;
  name: string;
  size: number;
  mime?: string;
  lastModified?: number;
  source: "web" | "tauri";
  handleKey: string;
}

export interface TransferState {
  fileId: string;
  peerId: string;
  direction: TransferDirection;
  bytesTransferred: number;
  totalBytes: number;
  status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
  startedAt: number;
  updatedAt: number;
  error?: string;
  targetHandleKey?: string;
  fileName?: string;
}

interface TransfersStore {
  selectedFile: SelectedFileMeta | null;
  transfers: Record<string, TransferState>;
  setSelectedFile(meta: SelectedFileMeta | null): void;
  upsertTransfer(transfer: TransferState): void;
  updateTransfer(fileId: string, patch: Partial<TransferState>): void;
  removeTransfer(fileId: string): void;
  reset(): void;
}

function broadcastState(state: Pick<TransfersStore, "selectedFile" | "transfers">) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("fluxshare");
  channel.postMessage({ type: "transfers-update", state });
  channel.close();
}

type PersistedTransfersState = Pick<TransfersStore, "selectedFile" | "transfers">;

const storage = createJSONStorage<PersistedTransfersState>(() => {
  if (typeof window === "undefined" || !window.localStorage) {
    const noopStorage: Storage = {
      length: 0,
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      removeItem: () => undefined,
      setItem: () => undefined,
    };
    return noopStorage;
  }
  return window.localStorage;
});

export const useTransfersStore = create<TransfersStore>()(
  persist(
    (set, get) => ({
      selectedFile: null,
      transfers: {},
      setSelectedFile: (meta) => {
        set({ selectedFile: meta });
        broadcastState({ selectedFile: meta, transfers: get().transfers });
      },
      upsertTransfer: (transfer) => {
        set((state) => ({
          transfers: { ...state.transfers, [transfer.fileId]: transfer },
        }));
        broadcastState({ selectedFile: get().selectedFile, transfers: get().transfers });
      },
      updateTransfer: (fileId, patch) => {
        set((state) => {
          const existing = state.transfers[fileId];
          if (!existing) return state;
          const next = {
            ...existing,
            ...patch,
            updatedAt: Date.now(),
          };
          return {
            transfers: { ...state.transfers, [fileId]: next },
          };
        });
        broadcastState({ selectedFile: get().selectedFile, transfers: get().transfers });
      },
      removeTransfer: (fileId) => {
        set((state) => {
          const { [fileId]: _removed, ...rest } = state.transfers;
          return { transfers: rest };
        });
        broadcastState({ selectedFile: get().selectedFile, transfers: get().transfers });
      },
      reset: () => {
        set({ selectedFile: null, transfers: {} });
        broadcastState({ selectedFile: null, transfers: {} });
      },
    }),
    {
      name: "fluxshare-transfers",
      storage,
      partialize: (state) => ({
        selectedFile: state.selectedFile,
        transfers: state.transfers,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        broadcastState({ selectedFile: state.selectedFile, transfers: state.transfers });
      },
    },
  ),
);

if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel("fluxshare");
  channel.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "transfers-update") return;
    const { selectedFile, transfers } = event.data.state as Pick<TransfersStore, "selectedFile" | "transfers">;
    const store = useTransfersStore.getState();
    useTransfersStore.setState({
      selectedFile,
      transfers,
    });
  });
}
