import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import PeersPanel, { type PeerViewModel } from "../components/PeersPanel";
import TransferBox from "../components/TransferBox";
import SessionPanel from "../components/SessionPanel";
import { useRoom, useRoomStore, type RoomPeer } from "../state/useRoomStore";
import { useTransfersStore, type TransferState } from "../store/useTransfers";
import { SignalingClient } from "../lib/signaling";
import PeerManager, { type PeerConnectionState } from "../lib/rtc/PeerManager";
import TransferService, { type TransferSource } from "../lib/transfer/TransferService";
import { isTauri, readFileRange } from "../lib/persist/tauri";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { notify } from "../lib/notify";
import { pickTauriFile, pickWebFile, pickTauriFolder, type SelectedItem } from "../lib/transfer/selectFile";
import { useI18n } from "../i18n/LanguageProvider";

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

function mapConnectionState(
  state: PeerConnectionState,
  transfer: TransferState | undefined,
  t: ReturnType<typeof useI18n>["t"],
): { label: string; variant: "accent" | "accentSecondary" | "success" | "danger" | "neutral" } {
  if (transfer && transfer.status === "transferring") {
    return { label: t("transfer.status.transferring"), variant: "accent" };
  }
  switch (state) {
    case "connected":
      return { label: t("connection.connected"), variant: "success" };
    case "connecting":
      return { label: t("connection.connecting"), variant: "accentSecondary" };
    case "new":
      return { label: t("connection.new"), variant: "neutral" };
    case "failed":
    case "disconnected":
    case "closed":
      return { label: t("connection.disconnected"), variant: "danger" };
    default:
      return { label: state, variant: "neutral" };
  }
}

function buildTransferSource(file: SelectedItem, peerId: string): TransferSource {
  const id = `${file.id}-${peerId}-${Date.now()}`;
  const source: TransferSource = {
    id,
    name: file.name,
    size: file.size,
    mime: file.mime,
    isArchive: file.kind === "folder",
    archiveRoot: file.archiveRoot,
  };
  if (file.source === "web" && file.file) {
    source.file = file.file;
  } else if ((file.source === "tauri" || file.source === "tauri-folder") && file.path) {
    source.createChunk = (start, length) => readFileRange(file.path!, start, length);
  }
  if (file.cleanup) {
    source.onDispose = () => void file.cleanup?.();
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
  const { t } = useI18n();
  const transfers = useTransfersStore((state) => state.transfers);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedItem | null>(null);
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);
  const displayName = useMemo(() => generateDisplayName(), []);

  const signalingRef = useRef<SignalingClient | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const transferServiceRef = useRef<TransferService | null>(null);
  const registeredPeersRef = useRef(new Set<string>());
  const pendingSendsRef = useRef(new Map<string, TransferSource[]>());
  const connectionStateRef = useRef(new Map<string, PeerConnectionState>());

  useEffect(() => {
    if (selectedPeerId && !peers.some((peer) => peer.peerId === selectedPeerId)) {
      setSelectedPeerId(null);
    }
  }, [peers, selectedPeerId]);

  useEffect(() => {
    const code = params.code;
    if (!code) {
      navigate("/p2p");
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
        const previous = connectionStateRef.current.get(peerId);
        connectionStateRef.current.set(peerId, state);
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
        if (state === "connected" && previous && previous !== "connected") {
          void notify({
            title: t("room.peer.connected"),
            body: t("room.peer.reconnected", { peer: existing?.displayName ?? peerId }),
          });
        }
        if ((state === "failed" || state === "disconnected" || state === "closed") && previous === "connected") {
          void notify({
            title: t("room.peer.disconnected"),
            body: existing?.displayName ?? peerId,
          });
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
        void notify({
          title: event.direction === "receive" ? t("room.transfer.received") : t("transfer.status.completed"),
          body: event.meta.name,
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
        void notify({
          title: t("transfer.status.error"),
          body: event.error.message,
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
  }, [displayName, roomId, t]);

  const determineTargets = useCallback(
    ({ overridePeerId }: PeerTargetsOptions = {}): string[] => {
      if (overridePeerId) return [overridePeerId];
      if (selectedPeerId) return [selectedPeerId];
      return peers.filter((peer) => peer.peerId !== selfPeerId).map((peer) => peer.peerId);
    },
    [peers, selectedPeerId, selfPeerId],
  );

  const queueSendToPeer = useCallback(
    (peerId: string, file: SelectedItem) => {
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
    (file: SelectedItem, options: PeerTargetsOptions = {}) => {
      const targets = determineTargets(options);
      if (targets.length === 0) {
        return;
      }
      targets.forEach((peerId) => queueSendToPeer(peerId, file));
    },
    [determineTargets, queueSendToPeer],
  );

  const handlePickFile = useCallback(
    async (overridePeerId?: string) => {
      const file = isTauri() ? await pickTauriFile() : await pickWebFile();
      if (!file) return;
      setSelectedFile(file);
      sendFileToTargets(file, { overridePeerId });
    },
    [sendFileToTargets],
  );

  const handlePickFolder = useCallback(
    async (overridePeerId?: string) => {
      const folder = await pickTauriFolder(t);
      if (!folder) return;
      setSelectedFile(folder);
      sendFileToTargets(folder, { overridePeerId });
    },
    [sendFileToTargets, t],
  );

  const latestTransfersByPeer = useMemo(() => getLatestTransferByPeer(transfers), [transfers]);

  const peerItems: PeerViewModel[] = useMemo(() => {
    return peers
      .filter((peer) => peer.peerId !== selfPeerId)
      .map((peer) => {
        const connection = peerConnections[peer.peerId];
        const transfer = latestTransfersByPeer.get(peer.peerId);
        const badge = mapConnectionState(connection?.state ?? "new", transfer ?? undefined, t);
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
  }, [latestTransfersByPeer, peerConnections, peers, selfPeerId, t]);

  const hasConnectedPeers = useMemo(
    () => peers.some((peer) => (peerConnections[peer.peerId]?.state ?? "new") === "connected"),
    [peerConnections, peers],
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
      const directionLabel = transferForDisplay.direction === "send" ? t("room.transfer.to") : t("room.transfer.from");
      const fallbackName =
        transferForDisplay.direction === "receive" ? t("room.transfer.received") : t("room.transfer.file");
      return {
        id: transferForDisplay.fileId,
        name: transferForDisplay.fileName ?? selectedFile?.name ?? fallbackName,
        size: transferForDisplay.totalBytes,
        mime: transferForDisplay.mime,
        targetLabel: `${directionLabel} ${peerDisplay}`,
      };
    }
    return selectedFile;
  }, [peerItems, selectedFile, t, transferForDisplay]);

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
    transferServiceRef.current?.cancel(peerId, transfer.fileId, t("room.transfer.cancelReason"));
    if (activeTransferId === transfer.fileId) {
      setActiveTransferId(null);
    }
  }, [activeTransferId, latestTransfersByPeer, t]);

  const handleCancelTransfer = useCallback(
    (peerId: string, transferId: string) => {
      transferServiceRef.current?.cancel(peerId, transferId, t("room.transfer.cancelReason"));
      if (activeTransferId === transferId) {
        setActiveTransferId(null);
      }
    },
    [activeTransferId, t],
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
    navigate("/p2p");
  }, [leaveRoom, navigate]);

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-[var(--text)]">
            {t("room.title", { code: roomId ?? params.code ?? "--" })}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {t("room.connectedAs", { name: displayName, id: selfPeerId || "--" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copyInviteLink()}>
            {t("room.copyLink")}
          </Button>
          <Button variant="danger" onClick={handleLeaveRoom}>
            {t("room.leave")}
          </Button>
        </div>
      </Card>

      <SessionPanel transfers={transfers} />

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <TransferBox
          file={transferBoxFile}
          transfer={transferBoxTransfer}
          onPickFile={() => handlePickFile()}
          onPickFolder={() => handlePickFolder()}
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
