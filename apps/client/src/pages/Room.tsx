import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import PeersPanel from "../components/PeersPanel";
import TransferBox from "../components/TransferBox";
import { usePeersStore, PeerConnectionStatus } from "../store/usePeers";
import { useTransfersStore } from "../store/useTransfers";
import { SignalingClient } from "../lib/signaling";
import { PeerManager } from "../lib/webrtc/PeerManager";
import { FileReceiver, FileSender, TransferManifest, CHUNK_SIZE } from "../lib/webrtc/transfer";
import { getFileHandle, saveFileHandle, saveCheckpoint, getCheckpoint, clearCheckpoint } from "../lib/persist/indexeddb";
import { isTauri, getFileInfo, readFileRange, writeFileRange } from "../lib/persist/tauri";
import type { ChunkProvider } from "../lib/webrtc/transfer";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { AppOutletContext } from "../App";

import FileReaderWorker from "../workers/fileReader.worker?worker";

interface PeerControllers {
  channel: RTCDataChannel;
  sender: FileSender;
  receiver: FileReceiver;
  provider?: ChunkProvider & { dispose?: () => void };
}

type DownloadWriter =
  | { type: "web"; writer: FileSystemWritableFileStream; handle: FileSystemFileHandle }
  | { type: "tauri"; path: string };

function generateDisplayName() {
  const key = "fluxshare-display-name";
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const generated = `Peer-${nanoid(6)}`;
    localStorage.setItem(key, generated);
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

function useRoomCode() {
  const params = useParams<{ code: string }>();
  return params.code ?? "";
}

function createWebChunkProvider(fileId: string, handle: FileSystemFileHandle, chunkSize: number) {
  const worker = new FileReaderWorker();
  worker.postMessage({ type: "init", fileId, handle, chunkSize });
  const pending = new Map<number, { resolve: (buffer: ArrayBuffer) => void; reject: (err: Error) => void }>();

  worker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (!data) return;
    if (data.type === "chunk" && data.fileId === fileId) {
      const resolver = pending.get(data.index);
      if (resolver) {
        pending.delete(data.index);
        resolver.resolve(data.buffer as ArrayBuffer);
      }
    }
    if (data.type === "error" && data.fileId === fileId) {
      const err = new Error(data.error ?? "unknown error");
      pending.forEach((entry) => entry.reject(err));
      pending.clear();
    }
  });

  const provider: ChunkProvider & { dispose: () => void } = {
    async getChunk(index: number) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        pending.set(index, { resolve, reject });
        worker.postMessage({ type: "chunk", fileId, index });
      });
    },
    dispose() {
      worker.postMessage({ type: "release", fileId });
      worker.terminate();
      pending.clear();
    },
  };

  return provider;
}

function createTauriChunkProvider(path: string, chunkSize: number) {
  const provider: ChunkProvider = {
    async getChunk(index: number) {
      const start = index * chunkSize;
      return readFileRange(path, start, chunkSize);
    },
  };
  return provider;
}

export function RoomPage() {
  const code = useRoomCode();
  const navigate = useNavigate();
  const [displayName] = useState(() => generateDisplayName());
  const selectedFile = useTransfersStore((state) => state.selectedFile);
  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const controllersRef = useRef(new Map<string, PeerControllers>());
  const pendingSendRef = useRef(new Map<string, { manifest: TransferManifest; provider: ChunkProvider & { dispose?: () => void } }>());
  const handlesRef = useRef(new Map<string, FileSystemFileHandle>());
  const downloadWritersRef = useRef(new Map<string, DownloadWriter>());

  useEffect(() => {
    if (!code) {
      navigate("/");
      return;
    }
    const signaling = new SignalingClient({ room: code, displayName });
    signalingRef.current = signaling;
    const peerManager = new PeerManager(signaling);
    peerManagerRef.current = peerManager;
    usePeersStore.getState().reset();

    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
      signaling.on("peers", (peers) => {
        const items = peers.map((peer) => ({
          peerId: peer.peerId,
          displayName: peer.displayName,
          status: "idle" as const,
          lastUpdated: Date.now(),
        }));
        usePeersStore.getState().setPeers(items);
      }),
    );

    unsubscribers.push(
      signaling.on("peer-joined", (peer) => {
        usePeersStore.getState().upsertPeer({
          peerId: peer.peerId,
          displayName: peer.displayName,
          status: "idle",
          lastUpdated: Date.now(),
        });
      }),
    );

    unsubscribers.push(
      signaling.on("peer-left", ({ peerId }) => {
        usePeersStore.getState().removePeer(peerId);
        const controller = controllersRef.current.get(peerId);
        if (controller) {
          controller.provider?.dispose?.();
          controllersRef.current.delete(peerId);
        }
      }),
    );

    unsubscribers.push(
      peerManager.on("connection-state", ({ peerId, state }) => {
        const statusMap: Record<string, PeerConnectionStatus> = {
          new: "connecting",
          connecting: "connecting",
          connected: "connected",
          disconnected: "disconnected",
          failed: "failed",
          closed: "disconnected",
        };
        usePeersStore.getState().updatePeerState(peerId, { status: statusMap[state] ?? "idle" });
      }),
    );

    unsubscribers.push(
      peerManager.on("data-channel", ({ peerId, channel }) => {
        setupPeerChannel(peerId, channel);
      }),
    );

    signaling.connect();

    return () => {
      unsubscribers.forEach((fn) => fn());
      signaling.disconnect();
      controllersRef.current.forEach((controller) => controller.provider?.dispose?.());
      controllersRef.current.clear();
      pendingSendRef.current.clear();
      handlesRef.current.clear();
      downloadWritersRef.current.forEach((writer) => {
        if (writer.type === "web") {
          void writer.writer.close();
        }
      });
      downloadWritersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, displayName]);

  useEffect(() => {
    const selected = selectedFile;
    if (!selected) return;
    if (selected.source === "web" && !handlesRef.current.has(selected.fileId)) {
      getFileHandle(selected.fileId).then((handle) => {
        if (handle) {
          handlesRef.current.set(selected.fileId, handle);
        }
      });
    }
  }, [selectedFile]);

  function setupPeerChannel(peerId: string, channel: RTCDataChannel) {
    const sender = new FileSender(channel);
    const receiver = new FileReceiver(channel);
    const entry: PeerControllers = { channel, sender, receiver };
    controllersRef.current.set(peerId, entry);

    sender.on("progress", ({ fileId, bytesSent, totalBytes }) => {
      useTransfersStore.getState().updateTransfer(fileId, {
        bytesTransferred: bytesSent,
        totalBytes,
        status: "transferring",
      });
    });

    sender.on("completed", ({ fileId }) => {
      useTransfersStore.getState().updateTransfer(fileId, {
        status: "completed",
        bytesTransferred: useTransfersStore.getState().transfers[fileId]?.totalBytes ?? 0,
      });
      pendingSendRef.current.delete(peerId);
      entry.provider?.dispose?.();
    });

    sender.on("cancelled", ({ fileId }) => {
      useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
      entry.provider?.dispose?.();
    });

    receiver.on("manifest", async ({ manifest }) => {
      const checkpoint = await getCheckpoint(manifest.fileId).catch(() => undefined);
      const existing = useTransfersStore.getState().transfers[manifest.fileId];
      let targetHandleKey = existing?.targetHandleKey;
      let startBytes = checkpoint?.receivedBytes ?? 0;

      if (isTauri()) {
        if (!targetHandleKey) {
          const { save } = await import("@tauri-apps/api/dialog");
          const target = await save({ defaultPath: manifest.name });
          if (!target) {
            receiver.cancel("receiver-declined");
            useTransfersStore.getState().updateTransfer(manifest.fileId, { status: "cancelled" });
            return;
          }
          targetHandleKey = target;
        }
        downloadWritersRef.current.set(manifest.fileId, { type: "tauri", path: targetHandleKey });
      } else {
        if (!("showSaveFilePicker" in window)) {
          alert("Seu navegador não suporta salvar arquivos");
          receiver.cancel("unsupported");
          return;
        }
        const key = targetHandleKey ?? `${manifest.fileId}:recv`;
        let handle = await getFileHandle(key);
        if (!handle) {
          handle = await (window as any).showSaveFilePicker({ suggestedName: manifest.name });
          if (!handle) {
            receiver.cancel("no-handle");
            return;
          }
          await saveFileHandle(key, handle);
        }
        const writer = await handle.createWritable({ keepExistingData: true });
        if (startBytes > 0) {
          await writer.truncate(startBytes);
          await writer.seek(startBytes);
        }
        downloadWritersRef.current.set(manifest.fileId, { type: "web", writer, handle });
        targetHandleKey = key;
      }

      useTransfersStore.getState().upsertTransfer({
        fileId: manifest.fileId,
        peerId,
        direction: "receive",
        bytesTransferred: startBytes,
        totalBytes: manifest.size,
        status: "transferring",
        startedAt: Date.now(),
        updatedAt: Date.now(),
        targetHandleKey,
        fileName: manifest.name,
      });

      if (checkpoint && checkpoint.nextChunkIndex > 0) {
        receiver.requestResume(checkpoint.nextChunkIndex);
      }
    });

    receiver.on("chunk-received", async ({ fileId, chunkIndex, chunk }) => {
      const writer = downloadWritersRef.current.get(fileId);
      if (writer?.type === "web") {
        await writer.writer.write(chunk);
      } else if (writer?.type === "tauri") {
        await writeFileRange(writer.path, chunkIndex * CHUNK_SIZE, new Uint8Array(chunk));
      }

      const transfer = useTransfersStore.getState().transfers[fileId];
      const nextBytes = transfer ? Math.min(transfer.totalBytes, (chunkIndex + 1) * CHUNK_SIZE) : (chunkIndex + 1) * CHUNK_SIZE;
      useTransfersStore.getState().updateTransfer(fileId, {
        bytesTransferred: nextBytes,
      });
      await saveCheckpoint({
        fileId,
        nextChunkIndex: chunkIndex + 1,
        receivedBytes: nextBytes,
        updatedAt: Date.now(),
      });
    });

    receiver.on("completed", async ({ fileId }) => {
      await finalizeDownload(fileId);
      useTransfersStore.getState().updateTransfer(fileId, { status: "completed" });
      await clearCheckpoint(fileId).catch(() => undefined);
    });

    receiver.on("cancelled", ({ fileId }) => {
      finalizeDownload(fileId);
      useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
      clearCheckpoint(fileId).catch(() => undefined);
    });

    const pending = pendingSendRef.current.get(peerId);
    if (pending) {
      pendingSendRef.current.delete(peerId);
      sender.start(pending.manifest, pending.provider);
      entry.provider = pending.provider;
    }
  }

  async function ensureHandle() {
    const selected = useTransfersStore.getState().selectedFile;
    if (selected?.source !== "web") return;
    const fileId = selected.fileId;
    if (handlesRef.current.has(fileId)) return;
    const handle = await getFileHandle(fileId);
    if (handle) {
      handlesRef.current.set(fileId, handle);
    }
  }

  async function handlePickFile() {
    if (isTauri()) {
      const { open } = await import("@tauri-apps/api/dialog");
      const selection = await open({ multiple: false });
      if (!selection || Array.isArray(selection)) return;
      const path = selection;
      const name = path.split(/[\\/]/).pop() ?? "arquivo";
      const info = await getFileInfo(path);
      const fileId = await computeFileId(name, info.size, info.createdAt ?? Date.now());
    useTransfersStore.getState().setSelectedFile({
      fileId,
      name,
      size: info.size,
      source: "tauri",
      handleKey: path,
    });
    useTransfersStore.getState().upsertTransfer({
      fileId,
      peerId: "",
      direction: "send",
      bytesTransferred: 0,
      totalBytes: info.size,
      status: "idle",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      fileName: name,
    });
      return;
    }

    if (!("showOpenFilePicker" in window)) {
      alert("Seu navegador não suporta File System Access API");
      return;
    }

    const [handle] = await (window as any).showOpenFilePicker({ multiple: false });
    if (!handle) return;
    const file = await handle.getFile();
    const fileId = await computeFileId(file.name, file.size, file.lastModified);
    handlesRef.current.set(fileId, handle);
    await saveFileHandle(fileId, handle);
    useTransfersStore.getState().setSelectedFile({
      fileId,
      name: file.name,
      size: file.size,
      mime: file.type,
      lastModified: file.lastModified,
      source: "web",
      handleKey: fileId,
    });
    useTransfersStore.getState().upsertTransfer({
      fileId,
      peerId: "",
      direction: "send",
      bytesTransferred: 0,
      totalBytes: file.size,
      status: "idle",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      fileName: file.name,
    });
  }

  async function handleConnect(peerId: string) {
    const peerManager = peerManagerRef.current;
    if (!peerManager) return;
    usePeersStore.getState().updatePeerState(peerId, { status: "connecting" });
    await peerManager.connectTo(peerId);
  }

  function handleDisconnect(peerId: string) {
    peerManagerRef.current?.disconnect(peerId);
    usePeersStore.getState().updatePeerState(peerId, { status: "disconnected" });
    const controller = controllersRef.current.get(peerId);
    if (controller) {
      controller.provider?.dispose?.();
      controllersRef.current.delete(peerId);
    }
  }

  async function finalizeDownload(fileId: string) {
    const writer = downloadWritersRef.current.get(fileId);
    if (writer?.type === "web") {
      await writer.writer.close();
    }
    downloadWritersRef.current.delete(fileId);
  }

  async function startSendToPeer(peerId: string) {
    const selected = useTransfersStore.getState().selectedFile;
    if (!selected) {
      alert("Selecione um arquivo primeiro");
      return;
    }
    await ensureHandle();

    let provider: ChunkProvider & { dispose?: () => void };
    let manifest: TransferManifest;

    if (selected.source === "web") {
      const handle = handlesRef.current.get(selected.fileId);
      if (!handle) {
        alert("Não foi possível acessar o arquivo selecionado");
        return;
      }
      const file = await handle.getFile();
      manifest = {
        type: "MANIFEST",
        fileId: selected.fileId,
        name: file.name,
        size: file.size,
        mime: file.type,
        chunkSize: CHUNK_SIZE,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      };
      provider = createWebChunkProvider(selected.fileId, handle, CHUNK_SIZE);
    } else {
      const path = selected.handleKey;
      const name = selected.name;
      manifest = {
        type: "MANIFEST",
        fileId: selected.fileId,
        name,
        size: selected.size,
        chunkSize: CHUNK_SIZE,
        totalChunks: Math.ceil(selected.size / CHUNK_SIZE),
      };
      provider = createTauriChunkProvider(path, CHUNK_SIZE);
    }

    const transferState = useTransfersStore.getState().transfers[selected.fileId];
    if (transferState) {
      useTransfersStore.getState().updateTransfer(selected.fileId, {
        status: "transferring",
        peerId,
        startedAt: transferState.startedAt || Date.now(),
      });
    } else {
      useTransfersStore.getState().upsertTransfer({
        fileId: selected.fileId,
        peerId,
        direction: "send",
        bytesTransferred: 0,
        totalBytes: manifest.size,
        status: "transferring",
        startedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const controller = controllersRef.current.get(peerId);
    if (controller) {
      controller.provider?.dispose?.();
      controller.provider = provider;
      controller.sender.start(manifest, provider);
    } else {
      pendingSendRef.current.set(peerId, { manifest, provider });
      peerManagerRef.current?.connectTo(peerId);
    }
  }

  function handlePeerCancel(peerId: string) {
    const controller = controllersRef.current.get(peerId);
    if (controller) {
      controller.sender.cancel("cancelled-by-user");
      controller.provider?.dispose?.();
      controllersRef.current.delete(peerId);
    }
  }

  function handleCancelFile(fileId: string) {
    const transfer = useTransfersStore.getState().transfers[fileId];
    if (!transfer) return;
    if (transfer.peerId) {
      handlePeerCancel(transfer.peerId);
    }
    useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
    clearCheckpoint(fileId).catch(() => undefined);
  }

  function handleResume(fileId: string) {
    const transfer = useTransfersStore.getState().transfers[fileId];
    if (!transfer || !transfer.peerId) return;
    startSendToPeer(transfer.peerId);
  }

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${code}`;
  }, [code]);

  const copyInvite = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(inviteUrl).catch(() => undefined);
    }
  }, [inviteUrl]);

  useEffect(() => {
    setHeaderInfo({
      roomCode: code,
      inviteUrl,
      onCopyInvite: copyInvite,
    });
    return () => setHeaderInfo({});
  }, [code, inviteUrl, copyInvite, setHeaderInfo]);

  return (
    <div className="space-y-8">
      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-[var(--text)]">Sala {code}</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Compartilhe o link abaixo para convidar novos peers.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={copyInvite}
            title="Copiar link de convite para a área de transferência"
          >
            Copiar convite
          </Button>
        </div>
        <button
          type="button"
          onClick={copyInvite}
          title="Copiar link de convite para a área de transferência"
          className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-left font-mono text-sm text-[var(--text)] transition hover:border-[var(--accent)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
        >
          {inviteUrl}
        </button>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <TransferBox onPickFile={handlePickFile} onResume={handleResume} onCancelFile={handleCancelFile} />
        <PeersPanel
          selfPeerId={signalingRef.current?.peerId ?? ""}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onSend={startSendToPeer}
          onCancel={handlePeerCancel}
        />
      </div>
    </div>
  );
}

export default RoomPage;
