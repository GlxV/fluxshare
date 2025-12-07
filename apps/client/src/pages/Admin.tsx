import { useCallback, useMemo, useState } from "react";
import { open } from "@tauri-apps/api/shell";
import { nanoid } from "nanoid";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge, type BadgeProps } from "../components/ui/Badge";
import { getEnv } from "../utils/env";
import { SignalingClient } from "../lib/signaling";
import PeerManager from "../lib/rtc/PeerManager";
import TransferService, { type TransferSource } from "../lib/transfer/TransferService";
import { useTunnelStore } from "../state/useTunnelStore";
import { useUpdateStore } from "../state/useUpdateStore";

interface TestContext {
  log(message: string): void;
}

type TestStatus = "idle" | "running" | "success" | "error";

interface TestResult {
  status: TestStatus;
  logs: string[];
  error?: string;
}

interface AdminTestDefinition {
  id: string;
  name: string;
  run(ctx: TestContext): Promise<void>;
}

const STATUS_BADGE: Record<TestStatus, BadgeProps["variant"]> = {
  idle: "neutral",
  running: "accent",
  success: "success",
  error: "danger",
};

const STATUS_LABEL: Record<TestStatus, string> = {
  idle: "Aguardando",
  running: "Executando",
  success: "Sucesso",
  error: "Falhou",
};

function formatLogEntry(message: string) {
  const time = new Date().toLocaleTimeString();
  return `[${time}] ${message}`;
}

class LocalSignaling {
  readonly peerId: string;
  private listeners = new Set<(payload: { from: string; to: string; data: unknown }) => void>();
  private partner: LocalSignaling | null = null;

  constructor(peerId: string) {
    this.peerId = peerId;
  }

  connect(partner: LocalSignaling) {
    this.partner = partner;
  }

  on(event: "signal", handler: (payload: { from: string; to: string; data: unknown }) => void) {
    if (event !== "signal") {
      return () => undefined;
    }
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  sendSignal(target: string, data: unknown) {
    if (!this.partner || target !== this.partner.peerId) return;
    this.partner.dispatchSignal(this.peerId, target, data);
  }

  private dispatchSignal(from: string, to: string, data: unknown) {
    this.listeners.forEach((listener) => {
      listener({ from, to, data });
    });
  }
}

async function waitForChannelReady(channel: RTCDataChannel, label: string, ctx: TestContext) {
  if (channel.readyState === "open") {
    ctx.log(`Canal ${label} aberto`);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Timeout aguardando canal ${label}`));
    }, 8000);
    const handleOpen = () => {
      window.clearTimeout(timer);
      ctx.log(`Canal ${label} aberto`);
      channel.removeEventListener("open", handleOpen);
      channel.removeEventListener("error", handleError);
      resolve();
    };
    const handleError = (event: Event) => {
      window.clearTimeout(timer);
      channel.removeEventListener("open", handleOpen);
      channel.removeEventListener("error", handleError);
      reject(new Error(`Erro no canal ${label}: ${String(event)}`));
    };
    channel.addEventListener("open", handleOpen);
    channel.addEventListener("error", handleError);
  });
}

async function createPeerPair(ctx: TestContext) {
  const signalingA = new LocalSignaling("admin-peer-a");
  const signalingB = new LocalSignaling("admin-peer-b");
  signalingA.connect(signalingB);
  signalingB.connect(signalingA);

  const managerA = new PeerManager(signalingA as unknown as SignalingClient);
  const managerB = new PeerManager(signalingB as unknown as SignalingClient);

  const remoteChannelPromise = new Promise<RTCDataChannel>((resolve) => {
    managerB.on("data-channel", ({ channel }) => {
      ctx.log("Canal recebido pelo peer remoto");
      channel.binaryType = "arraybuffer";
      channel.addEventListener("message", (event) => {
        channel.send(event.data);
      });
      resolve(channel);
    });
  });

  const localChannel = await managerA.connectTo("admin-peer-b");
  const remoteChannel = await remoteChannelPromise;

  await waitForChannelReady(localChannel, "local", ctx);
  await waitForChannelReady(remoteChannel, "remoto", ctx);

  return { managerA, managerB, localChannel, remoteChannel };
}

function compareArrays(expected: Uint8Array, received: Uint8Array) {
  if (expected.byteLength !== received.byteLength) {
    return false;
  }
  for (let index = 0; index < expected.byteLength; index += 1) {
    if (expected[index] !== received[index]) {
      return false;
    }
  }
  return true;
}

async function runThemeTest(ctx: TestContext) {
  ctx.log("Validando variáveis de tema escuro...");
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const tokens: Record<string, string> = {
    "--bg": "#0e0a1f",
    "--surface": "#151233",
    "--surface-2": "#1c1842",
    "--border": "#2b265a",
    "--primary": "#8b5cf6",
    "--primary-foreground": "#0b0a16",
    "--ring": "rgba(139, 92, 246, 0.35)",
    "--text": "#e8e8f0",
    "--muted": "#a3a3b2",
  };
  Object.entries(tokens).forEach(([token, expected]) => {
    const value = styles.getPropertyValue(token).trim().toLowerCase();
    ctx.log(`${token}: ${value}`);
    if (!value) {
      throw new Error(`Token ${token} não definido`);
    }
    if (value !== expected) {
      throw new Error(`Token ${token} esperado ${expected} mas encontrado ${value}`);
    }
  });
  ctx.log("Tema escuro validado com sucesso.");
}

async function runSignalingTest(ctx: TestContext) {
  const { signalingUrl } = getEnv();
  ctx.log(`Conectando ao servidor de sinalização: ${signalingUrl}`);
  const roomId = `ADMIN-${nanoid(6)}`;
  const client = new SignalingClient({ room: roomId, displayName: "AdminTest" });
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timeout aguardando conexão de sinalização"));
    }, 10000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      unsubscribeOpen();
      unsubscribePeers();
      unsubscribeError();
      client.disconnect();
    };

    const unsubscribeOpen = client.on("open", () => {
      ctx.log("WebSocket conectado");
    });

    const unsubscribePeers = client.on("peers", (peers) => {
      ctx.log(`Sala ${roomId} ativa (${peers.length} peers)`);
      cleanup();
      resolve();
    });

    const unsubscribeError = client.on("error", ({ error }) => {
      cleanup();
      reject(error);
    });

    client.connect();
  });
  ctx.log("Signaling OK.");
}

async function runWebRtcTest(ctx: TestContext) {
  const { managerA, managerB, localChannel, remoteChannel } = await createPeerPair(ctx);
  try {
    const payload = crypto.getRandomValues(new Uint8Array(5 * 1024));
    ctx.log("Enviando carga de 5 KiB e aguardando eco...");
    const echoed = await new Promise<Uint8Array>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("Timeout aguardando eco do canal"));
      }, 10000);
      function handleMessage(event: MessageEvent<unknown>) {
        window.clearTimeout(timer);
        localChannel.removeEventListener("message", handleMessage);
        resolve(new Uint8Array(event.data as ArrayBuffer));
      }
      localChannel.addEventListener("message", handleMessage);
      localChannel.send(payload);
    });
    if (!compareArrays(payload, echoed)) {
      throw new Error("Dados recebidos não correspondem ao payload enviado");
    }
    ctx.log("Echo validado com sucesso.");
  } finally {
    localChannel.close();
    remoteChannel.close();
    managerA.dispose();
    managerB.dispose();
  }
}

async function runTransferTest(ctx: TestContext) {
  const { managerA, managerB, localChannel, remoteChannel } = await createPeerPair(ctx);
  const transferA = new TransferService();
  const transferB = new TransferService();
  try {
    transferA.registerPeer("admin-peer-b", localChannel);
    transferB.registerPeer("admin-peer-a", remoteChannel);
    const data = crypto.getRandomValues(new Uint8Array(5 * 1024));
    ctx.log("Iniciando transferência simulada de 5 KiB...");
    const source: TransferSource = {
      name: "admin-test.bin",
      size: data.byteLength,
      createChunk: async (start, length) => data.slice(start, start + length).buffer,
    };

    const received = await new Promise<Uint8Array>((resolve, reject) => {
      const unsubscribeComplete = transferB.on("transfer-completed", async (event) => {
        if (event.direction === "receive" && event.blob) {
          const buffer = new Uint8Array(await event.blob.arrayBuffer());
          unsubscribeComplete();
          unsubscribeError();
          resolve(buffer);
        }
      });
      const unsubscribeError = transferB.on("transfer-error", ({ error }) => {
        unsubscribeComplete();
        unsubscribeError();
        reject(error);
      });
      void transferA.sendToPeer("admin-peer-b", source, 1024).catch(reject);
    });

    if (!compareArrays(data, received)) {
      throw new Error("Integridade do arquivo transferido não confere");
    }
    ctx.log("Transferência concluída com sucesso.");
  } finally {
    transferA.dispose();
    transferB.dispose();
    localChannel.close();
    remoteChannel.close();
    managerA.dispose();
    managerB.dispose();
  }
}

async function runTunnelTest(ctx: TestContext) {
  const store = useTunnelStore.getState();
  ctx.log("Garantindo que nenhum túnel esteja ativo...");
  try {
    await store.stop();
  } catch (error) {
    ctx.log(`Aviso ao parar túnel existente: ${String(error)}`);
  }
  ctx.log("Iniciando tunnel via Cloudflare...");
  await store.start();
  const current = useTunnelStore.getState();
  if (!current.url) {
    throw new Error("Nenhuma URL pública retornada pelo túnel");
  }
  ctx.log(`URL retornada: ${current.url}`);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(current.url, { signal: controller.signal });
    ctx.log(`Resposta HTTP: ${response.status}`);
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`Status inesperado: ${response.status}`);
    }
  } finally {
    window.clearTimeout(timeout);
    await store.stop().catch((error) => {
      ctx.log(`Aviso ao finalizar túnel: ${String(error)}`);
    });
  }
  ctx.log("Tunnel verificado com sucesso.");
}

const TEST_DEFINITIONS: AdminTestDefinition[] = [
  { id: "theme", name: "Tema", run: runThemeTest },
  { id: "signaling", name: "Signaling", run: runSignalingTest },
  { id: "webrtc", name: "WebRTC / DataChannel", run: runWebRtcTest },
  { id: "transfer", name: "Transferências", run: runTransferTest },
  { id: "tunnel", name: "Tunnel", run: runTunnelTest },
];

export default function AdminPage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, TestResult>>(() => {
    const initial: Record<string, TestResult> = {};
    TEST_DEFINITIONS.forEach((test) => {
      initial[test.id] = { status: "idle", logs: [] };
    });
    return initial;
  });
  const updateInfo = useUpdateStore((state) => state.updateInfo);
  const isCheckingUpdate = useUpdateStore((state) => state.isChecking);
  const updateError = useUpdateStore((state) => state.error);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);

  const runTests = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      for (const test of TEST_DEFINITIONS) {
        setResults((prev) => ({
          ...prev,
          [test.id]: { status: "running", logs: [], error: undefined },
        }));
        const append = (message: string) =>
          setResults((prev) => {
            const current = prev[test.id];
            return {
              ...prev,
              [test.id]: {
                ...current,
                logs: [...current.logs, formatLogEntry(message)],
              },
            };
          });
        try {
          await test.run({ log: append });
          setResults((prev) => ({
            ...prev,
            [test.id]: { ...prev[test.id], status: "success" },
          }));
        } catch (error) {
          const message = typeof error === "string" ? error : (error as Error).message;
          append(`Erro: ${message}`);
          setResults((prev) => ({
            ...prev,
            [test.id]: { ...prev[test.id], status: "error", error: message },
          }));
        }
      }
    } finally {
      setRunning(false);
    }
  }, [running]);

  const allSuccess = useMemo(() => TEST_DEFINITIONS.every((test) => results[test.id]?.status === "success"), [results]);

  const handleOpenRelease = useCallback(async () => {
    if (!updateInfo?.releaseUrl) return;
    try {
      await open(updateInfo.releaseUrl);
    } catch {
      if (typeof window !== "undefined") {
        window.open(updateInfo.releaseUrl, "_blank", "noopener,noreferrer");
      }
    }
  }, [updateInfo?.releaseUrl]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-[var(--text)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Painel Admin / Testes</h1>
          <p className="text-sm text-[var(--muted)]">
            Execute verificações automatizadas de conectividade e integrações principais do FluxShare.
          </p>
        </div>
        <Button onClick={runTests} disabled={running}>
          {running ? "Executando..." : "Rodar testes"}
        </Button>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-[var(--text)]">Atualizações</p>
          <p className="text-sm text-[var(--muted)]">
            {isCheckingUpdate
              ? "Verificando atualizações..."
              : updateInfo?.hasUpdate
                ? `Nova versão disponível: v${updateInfo.latestVersion}`
                : updateInfo
                  ? `FluxShare está atualizado (v${updateInfo.latestVersion})`
                  : "Verifique se há uma nova versão no GitHub."}
          </p>
          {updateError ? (
            <p className="text-xs text-[color-mix(in srgb,var(--primary) 65%,var(--muted) 35%)]">
              Erro: {updateError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void checkForUpdates();
            }}
            disabled={isCheckingUpdate}
          >
            {isCheckingUpdate ? "Verificando..." : "Verificar atualizações"}
          </Button>
          {updateInfo?.hasUpdate ? (
            <Button size="sm" onClick={handleOpenRelease}>
              Ver no GitHub
            </Button>
          ) : null}
        </div>
      </Card>

      {allSuccess ? (
        <Card className="border border-[color-mix(in srgb,var(--primary) 35%,var(--border) 65%)] bg-[color-mix(in srgb,var(--surface) 80%,transparent)] p-4">
          <p className="text-sm">Todos os testes passaram com sucesso.</p>
        </Card>
      ) : null}

      <div className="space-y-4">
        {TEST_DEFINITIONS.map((test) => {
          const result = results[test.id];
          const badgeVariant = STATUS_BADGE[result?.status ?? "idle"];
          return (
            <Card key={test.id} className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{test.name}</h2>
                  <p className="text-sm text-[var(--muted)]">ID: {test.id}</p>
                </div>
                <Badge variant={badgeVariant}>{STATUS_LABEL[result?.status ?? "idle"]}</Badge>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-xs">
                {result?.logs?.length ? (
                  <ul className="space-y-1">
                    {result.logs.map((entry, index) => (
                      <li key={`${entry}-${index}`} className="whitespace-pre-wrap break-words text-[var(--text)]">
                        {entry}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[var(--muted)]">Nenhum log registrado.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
