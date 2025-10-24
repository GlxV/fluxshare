import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import PeersPanel, { type PeerViewModel } from "../components/PeersPanel";
import TransferBox from "../components/TransferBox";
import { useRoom, useRoomStore, type RoomPeer } from "../state/useRoomStore";
import { useTransfersStore, type TransferState } from "../store/useTransfers";
import { SignalingClient } from "../lib/signaling";
import PeerManager, { type PeerConnectionState } from "../lib/rtc/PeerManager";
import TransferService, { type TransferSource } from "../lib/transfer/TransferService";
import { isTauri, getFileInfo, readFileRange } from "../lib/persist/tauri";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

interface SelectedFile {
  id: string;
  name: string;
  size: number;
  mime?: string;
  source: "web" | "tauri";
  file?: File;
  path?: string;
}

interface PeerTargetsOptions {
  overridePeerId?: string;
}

function generateDisplayName() {
  const key = "fluxshare-display-name";
  if (typeof window !== "undefined" && window.localStorage) {
    const stored = window.localStorage.getItem(key);
    if (stored) return stored;
    const generated = `Peer-${nanoid(6)}`;
    window.localStorage.setItem(key, generated);
    return generated;
  }
  return `Peer-${nanoid(6)}`;
}

async function computeFileId(name: string, size: number, lastModified: number) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${name}:${size}:${lastModified}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function mapConnectionState(
  state: PeerConnectionState,
  transfer?: TransferState,
): { label: string; variant: "accent" | "accentSecondary" | "success" | "danger" | "neutral" } {
  if (transfer && transfer.status === "transferring") {
    return { label: "Transferindo", variant: "accent" };
  }
  switch (state) {
    case "connected":
      return { label: "Conectado", variant: "success" };
    case "connecting":
    case "new":
      return { label: "Conectando", variant: "accentSecondary" };
    case "failed":
    case "disconnected":
    case "closed":
      return { label: "Desconectado", variant: "danger" };
    default:
      return { label: state, variant: "neutral" };
  }
}

function buildTransferSource(file: SelectedFile, peerId: string): TransferSource {
  const id = `${file.id}-${peerId}-${Date.now()}`;
  const source: TransferSource = {
    id,
    name: file.name,
    size: file.size,
    mime: file.mime,
  };
  if (file.source === "web" && file.file) {
    source.file = file.file;
  } else if (file.source === "tauri" && file.path) {
    source.createChunk = (start, length) => readFileRange(file.path!, start, length);
  }
  return source;
}

function getLatestTransferByPeer(transfers: Record<string, TransferState>): Map<string, TransferState> {
  const map = new Map<string, TransferState>();
  Object.values(transfers).forEach((transfer) => {
    const existing = map.get(transfer.peerId);
    if (!existing || existing.updatedAt < transfer.updatedAt) {
      map.set(transfer.peerId, transfer);
    }
  });
  return map;
}

export function RoomPage() {
  const params = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { roomId, selfPeerId, peers, peerConnections, joinRoom, leaveRoom, copyInviteLink } = useRoom();
  const transfers = useTransfersStore((state) => state.transfers);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);
  const displayName = useMemo(() => generateDisplayName(), []);

  const signalingRef = useRef<SignalingClient | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const transferServiceRef = useRef<TransferService | null>(null);
  const registeredPeersRef = useRef(new Set<string>());
  const pendingSendsRef = useRef(new Map<string, TransferSource[]>());

  useEffect(() => {
    if (selectedPeerId && !peers.some((peer) => peer.peerId === selectedPeerId)) {
      setSelectedPeerId(null);
    }
  }, [peers, selectedPeerId]);

  useEffect(() => {
    const code = params.code;
    if (!code) {
      navigate("/");
      return;
    }
    joinRoom(code);
  }, [joinRoom, navigate, params.code]);

  useEffect(() => {
    if (!roomId) return;
    const myPeerId = useRoomStore.getState().ensureSelfPeerId();
    const signaling = new SignalingClient({ room: roomId, displayName, peerId: myPeerId });
    const peerManager = new PeerManager(signaling);
    const transferService = new TransferService();
    signalingRef.current = signaling;
    peerManagerRef.current = peerManager;
    transferServiceRef.current = transferService;

    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
      signaling.on("peers", (peerList) => {
        const store = useRoomStore.getState();
        const otherPeers = peerList.filter((peer) => peer.peerId !== signaling.peerId);
        const mapped: RoomPeer[] = otherPeers.map((peer) => ({
          peerId: peer.peerId,
          displayName: peer.displayName,
          status: "idle",
          joinedAt: Date.now(),
        }));
        store.setPeers(mapped);
      }),
    );

    unsubscribers.push(
      signaling.on("peer-joined", (peer) => {
        const store = useRoomStore.getState();
        store.upsertPeer({
          peerId: peer.peerId,
          displayName: peer.displayName,
          status: "idle",
          joinedAt: Date.now(),
        });
      }),
    );

    unsubscribers.push(
      signaling.on("peer-left", ({ peerId }) => {
        const store = useRoomStore.getState();
        store.removePeer(peerId);
        store.removePeerConnection(peerId);
        registeredPeersRef.current.delete(peerId);
        pendingSendsRef.current.delete(peerId);
        transferService.unregisterPeer(peerId);
      }),
    );

    const peerUnsubs: Array<() => void> = [];

    peerUnsubs.push(
      peerManager.on("connection-state", ({ peerId, state }) => {
        const store = useRoomStore.getState();
        const existing = store.peers.find((peer) => peer.peerId === peerId);
        store.upsertPeer({
          peerId,
          displayName: existing?.displayName ?? peerId,
          status: state,
          iceState: existing?.iceState,
          joinedAt: existing?.joinedAt ?? Date.now(),
        });
        store.setPeerConnection(peerId, {
          peerId,
          state,
          iceState: existing?.iceState,
          updatedAt: Date.now(),
        });
        if (state === "connected") {
          const queue = pendingSendsRef.current.get(peerId);
          if (queue && queue.length > 0) {
            pendingSendsRef.current.delete(peerId);
            queue.forEach((source) => {
              transferService.sendToPeer(peerId, source).catch((error) => {
                console.error("fluxshare:transfer", "failed queued send", error);
                useTransfersStore.getState().upsertTransfer({
                  fileId: source.id!,
                  peerId,
                  direction: "send",
                  bytesTransferred: 0,
                  totalBytes: source.size,
                  status: "error",
                  startedAt: Date.now(),
                  updatedAt: Date.now(),
                  error: error instanceof Error ? error.message : String(error),
                  fileName: source.name,
                  mime: source.mime,
                });
              });
            });
          }
        }
        if (state === "failed" || state === "disconnected" || state === "closed") {
          registeredPeersRef.current.delete(peerId);
        }
      }),
    );

    peerUnsubs.push(
      peerManager.on("ice-connection-state", ({ peerId, state }) => {
        const store = useRoomStore.getState();
        const existing = store.peers.find((peer) => peer.peerId === peerId);
        if (existing) {
          store.upsertPeer({
            peerId,
            displayName: existing.displayName,
            status: existing.status,
            iceState: state,
            joinedAt: existing.joinedAt,
          });
        }
        const connection = store.peerConnections[peerId];
        store.setPeerConnection(peerId, {
          peerId,
          state: connection?.state ?? "new",
          iceState: state,
          updatedAt: Date.now(),
        });
      }),
    );

    peerUnsubs.push(
      peerManager.on("data-channel", ({ peerId, channel }) => {
        transferService.registerPeer(peerId, channel);
        registeredPeersRef.current.add(peerId);
        const queue = pendingSendsRef.current.get(peerId);
        if (queue && queue.length > 0) {
          pendingSendsRef.current.delete(peerId);
          queue.forEach((source) => {
            transferService.sendToPeer(peerId, source).catch((error) => {
              console.error("fluxshare:transfer", "failed queued send", error);
              useTransfersStore.getState().upsertTransfer({
                fileId: source.id!,
                peerId,
                direction: "send",
                bytesTransferred: 0,
                totalBytes: source.size,
                status: "error",
                startedAt: Date.now(),
                updatedAt: Date.now(),
                error: error instanceof Error ? error.message : String(error),
                fileName: source.name,
                mime: source.mime,
              });
            });
          });
        }
      }),
    );

    peerUnsubs.push(
      peerManager.on("peer-removed", ({ peerId }) => {
        transferService.unregisterPeer(peerId);
        registeredPeersRef.current.delete(peerId);
        const store = useRoomStore.getState();
        store.removePeerConnection(peerId);
      }),
    );

    const transferUnsubs: Array<() => void> = [];

    transferUnsubs.push(
      transferService.on("transfer-started", (event) => {
        useTransfersStore.getState().upsertTransfer({
          fileId: event.transferId,
          peerId: event.peerId,
          direction: event.direction,
          bytesTransferred: 0,
          totalBytes: event.meta.size,
          status: "transferring",
          startedAt: event.startedAt,
          updatedAt: event.startedAt,
          fileName: event.meta.name,
          mime: event.meta.mime,
        });
      }),
    );

    transferUnsubs.push(
      transferService.on("transfer-progress", (event) => {
        useTransfersStore.getState().updateTransfer(event.transferId, {
          bytesTransferred: event.bytesTransferred,
          totalBytes: event.totalBytes,
        });
      }),
    );

    transferUnsubs.push(
      transferService.on("transfer-completed", (event) => {
        useTransfersStore.getState().updateTransfer(event.transferId, {
          status: "completed",
          downloadUrl: event.fileUrl,
          savePath: event.savePath,
        });
      }),
    );

    transferUnsubs.push(
      transferService.on("transfer-cancelled", (event) => {
        useTransfersStore.getState().updateTransfer(event.transferId, {
          status: "cancelled",
          error: event.reason,
        });
      }),
    );

    transferUnsubs.push(
      transferService.on("transfer-error", (event) => {
        useTransfersStore.getState().updateTransfer(event.transferId, {
          status: "error",
          error: event.error.message,
        });
      }),
    );

    signaling.connect();

    return () => {
      transferUnsubs.forEach((fn) => fn());
      peerUnsubs.forEach((fn) => fn());
      unsubscribers.forEach((fn) => fn());
      transferService.dispose();
      peerManager.dispose();
      signaling.disconnect();
      transferServiceRef.current = null;
      peerManagerRef.current = null;
      signalingRef.current = null;
      registeredPeersRef.current.clear();
      pendingSendsRef.current.clear();
    };
  }, [displayName, roomId]);

  const determineTargets = useCallback(
    ({ overridePeerId }: PeerTargetsOptions = {}): string[] => {
      if (overridePeerId) return [overridePeerId];
      if (selectedPeerId) return [selectedPeerId];
      return peers.filter((peer) => peer.peerId !== selfPeerId).map((peer) => peer.peerId);
    },
    [peers, selectedPeerId, selfPeerId],
  );

  const queueSendToPeer = useCallback(
    (peerId: string, file: SelectedFile) => {
      const transferService = transferServiceRef.current;
      const peerManager = peerManagerRef.current;
      if (!transferService || !peerManager) return;
      const source = buildTransferSource(file, peerId);
      setActiveTransferId(source.id ?? null);
      if (registeredPeersRef.current.has(peerId)) {
        transferService
          .sendToPeer(peerId, source)
          .catch((error) => {
            console.error("fluxshare:transfer", "send failed", error);
            useTransfersStore.getState().upsertTransfer({
              fileId: source.id!,
              peerId,
              direction: "send",
              bytesTransferred: 0,
              totalBytes: source.size,
              status: "error",
              startedAt: Date.now(),
              updatedAt: Date.now(),
              error: error instanceof Error ? error.message : String(error),
              fileName: source.name,
              mime: source.mime,
            });
          });
      } else {
        const queue = pendingSendsRef.current.get(peerId) ?? [];
        queue.push(source);
        pendingSendsRef.current.set(peerId, queue);
        peerManager
          .connectTo(peerId)
          .catch((error) => console.error("fluxshare:peer-manager", "connect failed", error));
      }
    },
    [],
  );

  const sendFileToTargets = useCallback(
    (file: SelectedFile, options: PeerTargetsOptions = {}) => {
      const targets = determineTargets(options);
      if (targets.length === 0) {
        return;
      }
      targets.forEach((peerId) => queueSendToPeer(peerId, file));
    },
    [determineTargets, queueSendToPeer],
  );

  const pickWebFile = useCallback(
    () =>
      new Promise<SelectedFile | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = false;
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          const id = await computeFileId(file.name, file.size, file.lastModified);
          resolve({
            id,
            name: file.name,
            size: file.size,
            mime: file.type || undefined,
            source: "web",
            file,
          });
        });
        input.click();
      }),
    [],
  );

  const pickTauriFile = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/api/dialog");
      const selection = await open({ multiple: false });
      if (!selection || Array.isArray(selection)) {
        return null;
      }
      const path = selection;
      const info = await getFileInfo(path);
      const size = info.size ?? 0;
      const name = path.split(/[\\/]/).pop() ?? "arquivo";
      const id = await computeFileId(name, size, Date.now());
      return {
        id,
        name,
        size,
        mime: undefined,
        source: "tauri",
        path,
      } satisfies SelectedFile;
    } catch (error) {
      console.error("fluxshare:file", "tauri picker failed", error);
      return null;
    }
  }, []);

  const handlePickFile = useCallback(
    async (overridePeerId?: string) => {
      const file = isTauri() ? await pickTauriFile() : await pickWebFile();
      if (!file) return;
      setSelectedFile(file);
      sendFileToTargets(file, { overridePeerId });
    },
    [pickTauriFile, pickWebFile, sendFileToTargets],
  );

  const latestTransfersByPeer = useMemo(() => getLatestTransferByPeer(transfers), [transfers]);

  const peerItems: PeerViewModel[] = useMemo(() => {
    return peers
      .filter((peer) => peer.peerId !== selfPeerId)
      .map((peer) => {
        const connection = peerConnections[peer.peerId];
        const transfer = latestTransfersByPeer.get(peer.peerId);
        const badge = mapConnectionState(connection?.state ?? "new", transfer ?? undefined);
        const transferInfo = transfer
          ? {
              status: transfer.status,
              direction: transfer.direction,
              bytesTransferred: transfer.bytesTransferred,
              totalBytes: transfer.totalBytes,
              updatedAt: transfer.updatedAt,
            }
          : undefined;
        return {
          peerId: peer.peerId,
          displayName: peer.displayName,
          connectionState: badge.label,
          badgeVariant: badge.variant,
          transfer: transferInfo,
        } satisfies PeerViewModel;
      });
  }, [latestTransfersByPeer, peerConnections, peers, selfPeerId]);

  const hasConnectedPeers = useMemo(
    () => peerItems.some((item) => item.connectionState === "Conectado" || item.connectionState === "Transferindo"),
    [peerItems],
  );

  const activeTransfer = activeTransferId ? transfers[activeTransferId] ?? null : null;
  const selectedPeerTransfer = selectedPeerId ? latestTransfersByPeer.get(selectedPeerId) ?? null : null;
  const transferForDisplay = activeTransfer ?? selectedPeerTransfer ?? null;
  const transferBoxTransfer = transferForDisplay
    ? {
        id: transferForDisplay.fileId,
        status: transferForDisplay.status,
        direction: transferForDisplay.direction,
        bytesTransferred: transferForDisplay.bytesTransferred,
        totalBytes: transferForDisplay.totalBytes,
        startedAt: transferForDisplay.startedAt,
        updatedAt: transferForDisplay.updatedAt,
        peerId: transferForDisplay.peerId,
      }
    : null;

  const transferBoxFile = useMemo(() => {
    if (transferForDisplay) {
      const peerDisplay =
        peerItems.find((item) => item.peerId === transferForDisplay.peerId)?.displayName ??
        transferForDisplay.peerId;
      const directionLabel = transferForDisplay.direction === "send" ? "Para" : "De";
      const fallbackName =
        transferForDisplay.direction === "receive" ? "Arquivo recebido" : "Arquivo";
      return {
        id: transferForDisplay.fileId,
        name: transferForDisplay.fileName ?? selectedFile?.name ?? fallbackName,
        size: transferForDisplay.totalBytes,
        mime: transferForDisplay.mime,
        targetLabel: `${directionLabel} ${peerDisplay}`,
      };
    }
    return selectedFile;
  }, [peerItems, selectedFile, transferForDisplay]);

  const handleConnectPeer = useCallback((peerId: string) => {
    peerManagerRef.current?.connectTo(peerId).catch((error) => {
      console.error("fluxshare:peer-manager", "connect error", error);
    });
  }, []);

  const handleDisconnectPeer = useCallback((peerId: string) => {
    peerManagerRef.current?.disconnect(peerId);
    transferServiceRef.current?.unregisterPeer(peerId);
    registeredPeersRef.current.delete(peerId);
  }, []);

  const handleSendToPeer = useCallback(
    async (peerId: string) => {
      if (selectedFile) {
        queueSendToPeer(peerId, selectedFile);
        return;
      }
      setSelectedPeerId(peerId);
      await handlePickFile(peerId);
    },
    [handlePickFile, queueSendToPeer, selectedFile],
  );

  const handleCancelForPeer = useCallback((peerId: string) => {
    const transfer = latestTransfersByPeer.get(peerId);
    if (!transfer) return;
    transferServiceRef.current?.cancel(peerId, transfer.fileId, "Cancelado pelo usuário");
    if (activeTransferId === transfer.fileId) {
      setActiveTransferId(null);
    }
  }, [activeTransferId, latestTransfersByPeer]);

  const handleCancelTransfer = useCallback(
    (peerId: string, transferId: string) => {
      transferServiceRef.current?.cancel(peerId, transferId, "Cancelado pelo usuário");
      if (activeTransferId === transferId) {
        setActiveTransferId(null);
      }
    },
    [activeTransferId],
  );

  const handleLeaveRoom = useCallback(async () => {
    transferServiceRef.current?.dispose();
    peerManagerRef.current?.dispose();
    signalingRef.current?.disconnect();
    transferServiceRef.current = null;
    peerManagerRef.current = null;
    signalingRef.current = null;
    registeredPeersRef.current.clear();
    pendingSendsRef.current.clear();
    setSelectedFile(null);
    setActiveTransferId(null);
    useTransfersStore.getState().reset();
    leaveRoom();
    navigate("/");
  }, [leaveRoom, navigate]);

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Sala {roomId ?? params.code ?? "--"}</h1>
          <p className="text-sm text-[var(--muted)]">
            Você está conectado como <span className="font-medium text-[var(--text)]">{displayName}</span> ({selfPeerId || "--"})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copyInviteLink()}>
            Copiar link da sala
          </Button>
          <Button variant="danger" onClick={handleLeaveRoom}>
            Sair da sala
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <TransferBox
          file={transferBoxFile}
          transfer={transferBoxTransfer}
          onPickFile={() => handlePickFile()}
          onCancel={handleCancelTransfer}
          activeTransferId={activeTransferId}
          hasConnectedPeers={hasConnectedPeers}
        />
        <PeersPanel
          selfPeerId={selfPeerId ?? "--"}
          peers={peerItems}
          selectedPeerId={selectedPeerId}
          onSelect={(peerId) => setSelectedPeerId(peerId)}
          onConnect={handleConnectPeer}
          onDisconnect={handleDisconnectPeer}
          onSend={handleSendToPeer}
          onCancel={handleCancelForPeer}
        />
      </div>
    </div>
  );
}

export default RoomPage;
