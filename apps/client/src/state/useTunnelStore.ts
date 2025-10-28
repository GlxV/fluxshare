import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/persist/tauri";

const LOG_EVENT = "fluxshare://tunnel-log"; // LLM-LOCK: must match backend EVENT_TUNNEL_LOG
const STATUS_EVENT = "fluxshare://tunnel-status"; // LLM-LOCK: status event used by Admin page checks
const STOPPED_EVENT = "tunnel:stopped"; // LLM-LOCK: backend exit notification contract
const MAX_LOGS = 200;

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
  logs: string[];
  loading: boolean;
  error?: string;
  missingBinary: boolean;
  start(): Promise<void>;
  host(files: string[], cfMode?: string): Promise<void>;
  stop(): Promise<void>;
  refresh(): Promise<void>;
  clear(): void;
}

function formatLog(message: string) {
  const time = new Date().toLocaleTimeString();
  return `[${time}] ${message}`;
}

function appendLog(logs: string[], message: string) {
  const next = [...logs, formatLog(message)];
  if (next.length > MAX_LOGS) {
    return next.slice(next.length - MAX_LOGS);
  }
  return next;
}

type HostSessionInfo = {
  localUrl: string;
  publicUrl?: string | null;
  files: HostedFileSummary[];
};

export const useTunnelStore = create<TunnelStoreState>((set, get) => {
  if (isTauri()) {
    listen<TunnelLogPayload>(LOG_EVENT, (event) => {
      const line = event.payload?.line ?? "";
      if (!line) return;
      set((state) => ({ logs: appendLog(state.logs, line) }));
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
        ),
        status: "STOPPED",
        url: null,
      }));
    }).catch(() => undefined);

    void (async () => {
      try {
        const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
        set((state) => ({
          status: status.running ? "RUNNING" : "STOPPED",
          url: status.url ?? null,
          logs: status.running ? appendLog(state.logs, "Tunnel ativo.") : state.logs,
        }));
      } catch {
        // ignore initial status errors
      }
    })();
  }

  return {
    status: "STOPPED",
    url: null,
    localUrl: null,
    hostedFiles: [],
    logs: [],
    loading: false,
    error: undefined,
    missingBinary: false,
    async start() {
      if (!isTauri()) {
        set((state) => ({
          logs: appendLog(state.logs, "Tunnel disponível apenas no app desktop."),
          status: "STOPPED",
        }));
        return;
      }
      set({ loading: true, error: undefined });
      try {
        const response = (await invoke("start_tunnel")) as { public_url: string };
        set((state) => ({
          loading: false,
          status: "RUNNING",
          url: response.public_url,
          localUrl: state.localUrl,
          hostedFiles: state.hostedFiles,
          logs: appendLog(state.logs, `Tunnel iniciado: ${response.public_url}`),
          missingBinary: false,
        }));
        void get().refresh();
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          status: "STOPPED",
          logs: appendLog(state.logs, `Erro: ${message}`),
          error: message,
          missingBinary: /cloudflared/i.test(message),
        }));
        throw error;
      }
    },
    async host(files, cfMode = "cloudflared") {
      if (!isTauri()) {
        set((state) => ({
          logs: appendLog(state.logs, "Hospedagem disponível apenas no app desktop."),
          error: "Hospedagem disponível apenas no app desktop.",
        }));
        return;
      }
      if (!files || files.length === 0) {
        set((state) => ({
          logs: appendLog(state.logs, "Selecione ao menos um arquivo para hospedar."),
          error: "Nenhum arquivo selecionado.",
        }));
        return;
      }
      set({ loading: true, error: undefined });
      try {
        const response = (await invoke("start_host", { files, cfMode })) as HostSessionInfo;
        set((state) => ({
          loading: false,
          status: response.publicUrl ? "RUNNING" : state.status,
          url: response.publicUrl ?? state.url,
          localUrl: response.localUrl,
          hostedFiles: response.files ?? [],
          logs: appendLog(
            state.logs,
            `Hospedagem iniciada com ${response.files.length} arquivo(s).`,
          ),
          missingBinary: false,
        }));
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          logs: appendLog(state.logs, `Erro ao hospedar: ${message}`),
          error: message,
        }));
        throw error;
      }
    },
    async stop() {
      if (!isTauri()) {
        set((state) => ({ logs: appendLog(state.logs, "Nenhum túnel ativo."), status: "STOPPED" }));
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
          logs: appendLog(state.logs, "Tunnel parado."),
        }));
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          logs: appendLog(state.logs, `Erro ao parar: ${message}`),
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
          logs: appendLog(state.logs, `Erro ao consultar status: ${message}`),
          error: message,
        }));
      }
    },
    clear() {
      set({ logs: [] });
    },
  };
});
