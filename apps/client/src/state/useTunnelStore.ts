import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/persist/tauri";
import { notify } from "../lib/notify";
import { type TunnelProvider } from "../types/tunnel";

const LOG_EVENT = "fluxshare://tunnel-log"; // LLM-LOCK: must match backend EVENT_TUNNEL_LOG
const STATUS_EVENT = "fluxshare://tunnel-status"; // LLM-LOCK: status event used by Admin page checks
const STOPPED_EVENT = "tunnel:stopped"; // LLM-LOCK: backend exit notification contract
const MAX_ADVANCED_LOGS = 400;
const MAX_SIMPLE_LOGS = 120;

type TunnelLifecycle = "RUNNING" | "STOPPED";

type HostedFileSummary = {
  id: number;
  name: string;
  size: number;
};

type TunnelStatusPayload = {
  running: boolean;
  url?: string | null;
  localPort?: number | null;
  hostedFiles?: HostedFileSummary[];
};

type TunnelLogPayload = {
  line: string;
};

export interface TunnelStoreState {
  status: TunnelLifecycle;
  url: string | null;
  localUrl: string | null;
  hostedFiles: HostedFileSummary[];
  logs: string[]; // advanced/raw
  simpleLogs: string[];
  loading: boolean;
  error?: string;
  missingBinary: boolean;
  autoStopAt: number | null;
  start(options?: StartOptions): Promise<void>;
  host(files: string[], provider?: TunnelProvider): Promise<void>;
  stop(manual?: boolean): Promise<void>;
  refresh(): Promise<void>;
  clear(): void;
  testConnectivity(target?: string | null): Promise<{ ok: boolean; message: string }>;
}

export interface StartOptions {
  provider?: TunnelProvider;
  fallbackProvider?: TunnelProvider;
  autoStopMinutes?: number | null;
  localOnly?: boolean;
}

function formatLog(message: string) {
  const time = new Date().toLocaleTimeString();
  return `[${time}] ${message}`;
}

function appendLog(logs: string[], message: string, limit: number) {
  const next = [...logs, formatLog(message)];
  if (next.length > limit) {
    return next.slice(next.length - limit);
  }
  return next;
}

type HostSessionInfo = {
  localUrl: string;
  publicUrl?: string | null;
  files: HostedFileSummary[];
};

let autoStopHandle: ReturnType<typeof setTimeout> | null = null;

export const useTunnelStore = create<TunnelStoreState>((set, get) => {
  if (isTauri()) {
    listen<TunnelLogPayload>(LOG_EVENT, (event) => {
      const line = event.payload?.line ?? "";
      if (!line) return;
      set((state) => ({ logs: appendLog(state.logs, line, MAX_ADVANCED_LOGS) }));
    }).catch(() => undefined);

    listen<TunnelStatusPayload>(STATUS_EVENT, (event) => {
      const payload = event.payload ?? { running: false, url: null };
      set(() => ({
        status: payload.running ? "RUNNING" : "STOPPED",
        url: payload.url ?? null,
      }));
    }).catch(() => undefined);

    listen<number>(STOPPED_EVENT, (event) => {
      const rawCode = event.payload;
      const code = typeof rawCode === "number" ? rawCode : -1;
      set((state) => ({
        logs: appendLog(
          state.logs,
          `[Tunnel] Parado (code ${code}) — processo Cloudflare finalizado.`,
          MAX_ADVANCED_LOGS,
        ),
        simpleLogs: appendLog(
          state.simpleLogs,
          "Tunnel encerrado pelo processo do sistema.",
          MAX_SIMPLE_LOGS,
        ),
        status: "STOPPED",
        url: null,
        autoStopAt: null,
      }));
      if (autoStopHandle) {
        clearTimeout(autoStopHandle);
        autoStopHandle = null;
      }
    }).catch(() => undefined);

    void (async () => {
      try {
        const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
        set((state) => ({
          status: status.running ? "RUNNING" : "STOPPED",
          url: status.url ?? null,
          logs: status.running ? appendLog(state.logs, "Tunnel ativo.", MAX_ADVANCED_LOGS) : state.logs,
        }));
      } catch {
        // ignore initial status errors
      }
    })();
  }

  async function tryStartProvider(provider: TunnelProvider) {
    if (provider === "cloudflare") {
      const response = (await invoke("start_tunnel")) as { public_url: string };
      return { url: response.public_url, localUrl: null as string | null };
    }
    // Mock provider: simula URL local para fallback
    const url = `https://mock-tunnel.local/${Date.now().toString(36)}`;
    set((state) => ({
      status: "RUNNING",
      simpleLogs: appendLog(state.simpleLogs, "Fallback mock iniciado.", MAX_SIMPLE_LOGS),
    }));
    return { url, localUrl: url };
  }

  function scheduleAutoStop(minutes: number | null) {
    if (autoStopHandle) {
      clearTimeout(autoStopHandle);
      autoStopHandle = null;
    }
    if (!minutes || minutes <= 0) {
      set({ autoStopAt: null });
      return;
    }
    const ms = minutes * 60 * 1000;
    const stopAt = Date.now() + ms;
    set({ autoStopAt: stopAt });
    autoStopHandle = setTimeout(async () => {
      autoStopHandle = null;
      await get().stop(false);
      await notify({ title: "Tunnel encerrado", body: "Timer de auto-stop expirou." });
    }, ms);
  }

  return {
    status: "STOPPED",
    url: null,
    localUrl: null,
    hostedFiles: [],
    logs: [],
    simpleLogs: [],
    loading: false,
    error: undefined,
    missingBinary: false,
    autoStopAt: null,
    async start(options = {}) {
      const { provider = "cloudflare", fallbackProvider = "mock", autoStopMinutes = null, localOnly = false } = options;
      if (!isTauri()) {
        set((state) => ({
          logs: appendLog(state.logs, "Tunnel disponível apenas no app desktop.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Tunnel não suportado neste ambiente.", MAX_SIMPLE_LOGS),
          status: "STOPPED",
        }));
        return;
      }
      if (localOnly) {
        set((state) => ({
          simpleLogs: appendLog(state.simpleLogs, "Modo local ativo: não iniciar túnel externo.", MAX_SIMPLE_LOGS),
          status: "STOPPED",
        }));
        return;
      }
      set({ loading: true, error: undefined });
      let started = false;
      try {
        const primary = await tryStartProvider(provider);
        set((state) => ({
          loading: false,
          status: "RUNNING",
          url: primary.url,
          localUrl: primary.localUrl ?? state.localUrl,
          hostedFiles: state.hostedFiles,
          logs: appendLog(state.logs, `Tunnel (${provider}) iniciado: ${primary.url}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, `Tunnel iniciado (${provider}).`, MAX_SIMPLE_LOGS),
          missingBinary: false,
        }));
        started = true;
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          status: "STOPPED",
          logs: appendLog(state.logs, `Erro (${provider}): ${message}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, `Erro ao iniciar ${provider}.`, MAX_SIMPLE_LOGS),
          error: message,
          missingBinary: /cloudflared/i.test(message),
        }));
        if (fallbackProvider && fallbackProvider !== provider) {
          try {
            const fallback = await tryStartProvider(fallbackProvider);
            set((state) => ({
              status: "RUNNING",
              url: fallback.url,
              localUrl: fallback.localUrl ?? state.localUrl,
              logs: appendLog(
                appendLog(state.logs, `Fallback ${fallbackProvider} acionado.`, MAX_ADVANCED_LOGS),
                `Tunnel (${fallbackProvider}) iniciado: ${fallback.url}`,
                MAX_ADVANCED_LOGS,
              ),
              simpleLogs: appendLog(state.simpleLogs, `Fallback ${fallbackProvider} iniciado.`, MAX_SIMPLE_LOGS),
              loading: false,
              error: undefined,
            }));
            started = true;
          } catch (fallbackError) {
            const msg = typeof fallbackError === "string" ? fallbackError : (fallbackError as Error).message;
            set((state) => ({
              logs: appendLog(state.logs, `Fallback falhou: ${msg}`, MAX_ADVANCED_LOGS),
              simpleLogs: appendLog(state.simpleLogs, "Fallback falhou.", MAX_SIMPLE_LOGS),
              error: msg,
              status: "STOPPED",
            }));
          }
        } else {
          throw error;
        }
      } finally {
        scheduleAutoStop(started ? autoStopMinutes : null);
      }
    },
    async host(files, provider = "cloudflare") {
      if (!isTauri()) {
        set((state) => ({
          logs: appendLog(state.logs, "Hospedagem disponível apenas no app desktop.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Hospedagem requer app desktop.", MAX_SIMPLE_LOGS),
          error: "Hospedagem disponível apenas no app desktop.",
        }));
        return;
      }
      if (!files || files.length === 0) {
        set((state) => ({
          logs: appendLog(state.logs, "Selecione ao menos um arquivo para hospedar.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Nenhum arquivo selecionado para hospedagem.", MAX_SIMPLE_LOGS),
          error: "Nenhum arquivo selecionado.",
        }));
        return;
      }
      set({ loading: true, error: undefined });
      try {
        if (provider === "mock") {
          set((state) => ({
            loading: false,
            status: "RUNNING",
            url: state.url ?? "https://mock-tunnel.local",
            localUrl: state.localUrl ?? "http://127.0.0.1:8787/",
            hostedFiles: files.map((name, idx) => ({ id: idx, name: name.split(/[\\/]/).pop() ?? name, size: 0 })),
            logs: appendLog(state.logs, "Hospedagem mock iniciada.", MAX_ADVANCED_LOGS),
            simpleLogs: appendLog(state.simpleLogs, "Hospedagem mock ativa.", MAX_SIMPLE_LOGS),
          }));
          return;
        }
        const response = (await invoke("start_host", { files, cfMode: "cloudflared" })) as HostSessionInfo;
        set((state) => ({
          loading: false,
          status: response.publicUrl ? "RUNNING" : state.status,
          url: response.publicUrl ?? state.url,
          localUrl: response.localUrl,
          hostedFiles: response.files ?? [],
          logs: appendLog(
            state.logs,
            `Hospedagem iniciada com ${response.files.length} arquivo(s).`,
            MAX_ADVANCED_LOGS,
          ),
          simpleLogs: appendLog(state.simpleLogs, "Hospedagem iniciada.", MAX_SIMPLE_LOGS),
          missingBinary: false,
        }));
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          logs: appendLog(state.logs, `Erro ao hospedar: ${message}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Erro ao hospedar.", MAX_SIMPLE_LOGS),
          error: message,
        }));
        throw error;
      }
    },
    async stop(manual = true) {
      if (autoStopHandle) {
        clearTimeout(autoStopHandle);
        autoStopHandle = null;
      }
      set({ autoStopAt: null });
      if (!isTauri()) {
        set((state) => ({
          logs: appendLog(state.logs, "Nenhum túnel ativo.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Tunnel já parado.", MAX_SIMPLE_LOGS),
          status: "STOPPED",
        }));
        return;
      }
      set({ loading: true });
      try {
        await invoke("stop_host");
        set((state) => ({
          loading: false,
          status: "STOPPED",
          url: null,
          localUrl: null,
          hostedFiles: [],
          logs: appendLog(state.logs, "Tunnel parado.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, manual ? "Tunnel encerrado manualmente." : "Tunnel encerrado.", MAX_SIMPLE_LOGS),
        }));
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          logs: appendLog(state.logs, `Erro ao parar: ${message}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Erro ao parar tunnel.", MAX_SIMPLE_LOGS),
          error: message,
        }));
        throw error;
      }
    },
    async refresh() {
      if (!isTauri()) return;
      try {
        const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
        set((state) => ({
          status: status.running ? "RUNNING" : "STOPPED",
          url: status.url ?? null,
          localUrl:
            typeof status.localPort === "number"
              ? `http://127.0.0.1:${status.localPort}/`
              : status.running
                ? state.localUrl
                : null,
          hostedFiles: status.hostedFiles ?? state.hostedFiles,
          missingBinary: state.missingBinary,
        }));
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          logs: appendLog(state.logs, `Erro ao consultar status: ${message}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Erro ao consultar status.", MAX_SIMPLE_LOGS),
          error: message,
        }));
      }
    },
    clear() {
      set({ logs: [], simpleLogs: [] });
    },
    async testConnectivity(target) {
      const state = get();
      const endpoint = target ?? state.url ?? state.localUrl;
      if (!endpoint) {
        return { ok: false, message: "Nenhum endpoint do túnel disponível." };
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const response = await fetch(endpoint, { method: "HEAD", mode: "no-cors", signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok || response.type === "opaque") {
          set((s) => ({
            simpleLogs: appendLog(s.simpleLogs, "Conectividade OK.", MAX_SIMPLE_LOGS),
          }));
          return { ok: true, message: "Conectividade OK." };
        }
        return { ok: false, message: `Resposta inesperada (${response.status}).` };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set((s) => ({
          simpleLogs: appendLog(s.simpleLogs, `Teste falhou: ${message}`, MAX_SIMPLE_LOGS),
        }));
        return { ok: false, message };
      }
    },
  };
});
