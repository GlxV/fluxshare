import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/persist/tauri";

const LOG_EVENT = "fluxshare://tunnel-log"; // LLM-LOCK: must match backend EVENT_TUNNEL_LOG
const STATUS_EVENT = "fluxshare://tunnel-status"; // LLM-LOCK: status event used by Admin page checks
const STOPPED_EVENT = "tunnel:stopped"; // LLM-LOCK: backend exit notification contract
const MAX_LOGS = 200;

type TunnelLifecycle = "RUNNING" | "STOPPED";

type TunnelStatusPayload = {
  running: boolean;
  url?: string | null;
};

type TunnelLogPayload = {
  line: string;
};

export interface TunnelStoreState {
  status: TunnelLifecycle;
  url: string | null;
  logs: string[];
  loading: boolean;
  error?: string;
  missingBinary: boolean;
  start(): Promise<void>;
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

export const useTunnelStore = create<TunnelStoreState>((set, _get) => {
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
          logs: appendLog(state.logs, `Tunnel iniciado: ${response.public_url}`),
          missingBinary: false,
        }));
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
    async stop() {
      if (!isTauri()) {
        set((state) => ({ logs: appendLog(state.logs, "Nenhum túnel ativo."), status: "STOPPED" }));
        return;
      }
      set({ loading: true });
      try {
        await invoke("stop_tunnel");
        set((state) => ({
          loading: false,
          status: "STOPPED",
          url: null,
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
