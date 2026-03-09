import { create } from "zustand";

export interface ExplorerShareRequest {
  id: number;
  paths: string[];
  source: string;
  receivedAt: number;
  claimed?: boolean;
}

interface ExplorerShareStoreState {
  requests: ExplorerShareRequest[];
  enqueueRequests(requests: ExplorerShareRequest[]): void;
  markClaimed(id: number): void;
  remove(id: number): void;
  clear(): void;
}

function dedupeRequests(existing: ExplorerShareRequest[], incoming: ExplorerShareRequest[]) {
  const next = [...existing];
  for (const request of incoming) {
    if (next.some((entry) => entry.id === request.id)) {
      continue;
    }
    next.push(request);
  }
  next.sort((left, right) => left.receivedAt - right.receivedAt);
  return next;
}

export const useExplorerShareStore = create<ExplorerShareStoreState>((set) => ({
  requests: [],
  enqueueRequests: (requests) =>
    set((state) => ({
      requests: dedupeRequests(state.requests, requests),
    })),
  markClaimed: (id) =>
    set((state) => ({
      requests: state.requests.map((request) =>
        request.id === id ? { ...request, claimed: true } : request,
      ),
    })),
  remove: (id) =>
    set((state) => ({
      requests: state.requests.filter((request) => request.id !== id),
    })),
  clear: () => set({ requests: [] }),
}));
