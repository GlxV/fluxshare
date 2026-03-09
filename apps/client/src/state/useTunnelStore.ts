import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/persist/tauri";
import { notify } from "../lib/notify";
import { type TunnelProvider } from "../types/tunnel";

const LOG_EVENT = "fluxshare://tunnel-log";
const STATUS_EVENT = "fluxshare://tunnel-status";
const STOPPED_EVENT = "tunnel:stopped";
const MAX_ADVANCED_LOGS = 400;
const MAX_SIMPLE_LOGS = 120;

type TunnelLifecycle = "RUNNING" | "STOPPED";
export type TunnelPhase =
  | "stopped"
  | "starting"
  | "waiting_local"
  | "waiting_public"
  | "online"
  | "reconnecting"
  | "stopping"
  | "failed";

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
  phase?: TunnelPhase;
  message?: string | null;
  publicReady?: boolean;
  localReady?: boolean;
  provider?: string | null;
  lastError?: string | null;
  lastCheckedAt?: number | null;
};

type TunnelLogPayload = {
  line: string;
};

type ProbeResult = {
  ok: boolean;
  statusCode?: number | null;
  message: string;
};

export interface TunnelStoreState {
  status: TunnelLifecycle;
  phase: TunnelPhase;
  message: string | null;
  provider: string | null;
  publicReady: boolean;
  localReady: boolean;
  lastCheckedAt: number | null;
  url: string | null;
  localUrl: string | null;
  hostedFiles: HostedFileSummary[];
  logs: string[];
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

type HostSessionInfo = {
  localUrl: string;
  publicUrl?: string | null;
  files: HostedFileSummary[];
};

let autoStopHandle: ReturnType<typeof setTimeout> | null = null;

function formatLog(message: string) {
  const time = new Date().toLocaleTimeString();
  return `[${time}] ${message}`;
}

function appendLog(logs: string[], message: string, limit: number) {
  const next = [...logs, formatLog(message)];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function phaseToLifecycle(phase: TunnelPhase, running: boolean) {
  if (running || phase === "online" || phase === "starting" || phase === "waiting_local" || phase === "waiting_public" || phase === "reconnecting" || phase === "stopping") {
    return "RUNNING" as const;
  }
  return "STOPPED" as const;
}

function applyStatusPayload(
  state: TunnelStoreState,
  payload: TunnelStatusPayload,
): Partial<TunnelStoreState> {
  const phase = payload.phase ?? (payload.running ? "online" : "stopped");
  const localUrl =
    typeof payload.localPort === "number"
      ? `http://127.0.0.1:${payload.localPort}/`
      : payload.running || phase !== "stopped"
        ? state.localUrl
        : null;

  return {
    status: phaseToLifecycle(phase, payload.running),
    phase,
    message: payload.message ?? state.message,
    provider: payload.provider ?? state.provider,
    publicReady: Boolean(payload.publicReady),
    localReady: Boolean(payload.localReady),
    lastCheckedAt: payload.lastCheckedAt ?? state.lastCheckedAt,
    url: payload.url ?? null,
    localUrl,
    hostedFiles: payload.hostedFiles ?? state.hostedFiles,
    error: payload.lastError ?? undefined,
    missingBinary: /cloudflared/i.test(payload.lastError ?? ""),
  };
}

async function tryStartProvider(provider: TunnelProvider) {
  if (provider === "cloudflare") {
    const response = (await invoke("start_tunnel")) as { public_url: string };
    return { url: response.public_url, localUrl: null as string | null };
  }
  const url = `https://mock-tunnel.local/${Date.now().toString(36)}`;
  return { url, localUrl: url };
}

function scheduleAutoStop(
  minutes: number | null,
  get: () => TunnelStoreState,
  set: (
    partial:
      | Partial<TunnelStoreState>
      | ((state: TunnelStoreState) => Partial<TunnelStoreState>),
  ) => void,
) {
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
    await notify({ title: "Tunnel closed", body: "Auto-stop timer expired." });
  }, ms);
}

export const useTunnelStore = create<TunnelStoreState>((set, get) => {
  if (isTauri()) {
    listen<TunnelLogPayload>(LOG_EVENT, (event) => {
      const line = event.payload?.line ?? "";
      if (!line) return;
      set((state) => ({ logs: appendLog(state.logs, line, MAX_ADVANCED_LOGS) }));
    }).catch(() => undefined);

    listen<TunnelStatusPayload>(STATUS_EVENT, (event) => {
      const payload = event.payload ?? { running: false, url: null, phase: "stopped" };
      set((state) => applyStatusPayload(state, payload));
    }).catch(() => undefined);

    listen<number>(STOPPED_EVENT, (event) => {
      const rawCode = event.payload;
      const code = typeof rawCode === "number" ? rawCode : -1;
      if (autoStopHandle) {
        clearTimeout(autoStopHandle);
        autoStopHandle = null;
      }
      set((state) => ({
        logs: appendLog(state.logs, `[Tunnel] Stopped (code ${code}).`, MAX_ADVANCED_LOGS),
        simpleLogs: appendLog(state.simpleLogs, "Tunnel stopped.", MAX_SIMPLE_LOGS),
        status: "STOPPED",
        phase: "stopped",
        message: "Tunnel stopped.",
        url: null,
        autoStopAt: null,
      }));
    }).catch(() => undefined);

    void (async () => {
      try {
        const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
        set((state) => ({
          ...applyStatusPayload(state, status),
          logs: status.running ? appendLog(state.logs, "Tunnel state restored.", MAX_ADVANCED_LOGS) : state.logs,
        }));
      } catch {
        // ignore initial status errors
      }
    })();
  }

  return {
    status: "STOPPED",
    phase: "stopped",
    message: null,
    provider: null,
    publicReady: false,
    localReady: false,
    lastCheckedAt: null,
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
          logs: appendLog(state.logs, "Tunnel desktop-only.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Tunnel unavailable in this environment.", MAX_SIMPLE_LOGS),
          status: "STOPPED",
        }));
        return;
      }
      if (localOnly) {
        set((state) => ({
          phase: "stopped",
          message: "Local-only mode enabled.",
          simpleLogs: appendLog(state.simpleLogs, "Local-only mode enabled.", MAX_SIMPLE_LOGS),
          status: "STOPPED",
        }));
        return;
      }

      set({
        loading: true,
        error: undefined,
        phase: "starting",
        message: "Starting tunnel...",
      });

      let started = false;
      try {
        const primary = await tryStartProvider(provider);
        set((state) => ({
          loading: false,
          url: primary.url,
          localUrl: primary.localUrl ?? state.localUrl,
          phase: provider === "mock" ? "online" : state.phase,
          message: provider === "mock" ? "Tunnel ready." : state.message,
          publicReady: provider === "mock" ? true : state.publicReady,
          localReady: provider === "mock" ? true : state.localReady,
          status: "RUNNING",
          simpleLogs: appendLog(state.simpleLogs, `Tunnel start requested (${provider}).`, MAX_SIMPLE_LOGS),
          missingBinary: false,
        }));
        if (provider !== "mock") {
          await get().refresh();
        }
        started = true;
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          error: message,
          phase: "failed",
          message,
          status: "STOPPED",
          logs: appendLog(state.logs, `Tunnel start failed: ${message}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Tunnel start failed.", MAX_SIMPLE_LOGS),
          missingBinary: /cloudflared/i.test(message),
        }));
        if (fallbackProvider && fallbackProvider !== provider) {
          try {
            const fallback = await tryStartProvider(fallbackProvider);
            set((state) => ({
              loading: false,
              url: fallback.url,
              localUrl: fallback.localUrl ?? state.localUrl,
              status: "RUNNING",
              phase: "online",
              message: "Fallback tunnel ready.",
              error: undefined,
              simpleLogs: appendLog(state.simpleLogs, `Fallback started (${fallbackProvider}).`, MAX_SIMPLE_LOGS),
            }));
            started = true;
          } catch (fallbackError) {
            const fallbackMessage =
              typeof fallbackError === "string" ? fallbackError : (fallbackError as Error).message;
            set((state) => ({
              error: fallbackMessage,
              phase: "failed",
              message: fallbackMessage,
              status: "STOPPED",
              logs: appendLog(state.logs, `Fallback failed: ${fallbackMessage}`, MAX_ADVANCED_LOGS),
              simpleLogs: appendLog(state.simpleLogs, "Fallback failed.", MAX_SIMPLE_LOGS),
            }));
          }
        } else {
          throw error;
        }
      } finally {
        scheduleAutoStop(started ? autoStopMinutes : null, get, set);
      }
    },
    async host(files, provider) {
      if (!isTauri()) {
        set((state) => ({
          logs: appendLog(state.logs, "Hosting desktop-only.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Hosting requires the desktop app.", MAX_SIMPLE_LOGS),
          error: "Hosting desktop-only.",
        }));
        return;
      }
      if (!files || files.length === 0) {
        set((state) => ({
          logs: appendLog(state.logs, "No files selected for hosting.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "No files selected for hosting.", MAX_SIMPLE_LOGS),
          error: "No files selected.",
        }));
        return;
      }

      set({
        loading: true,
        error: undefined,
        phase: "starting",
        message: "Preparing share link...",
      });

      try {
        if (provider === "mock") {
          set((state) => ({
            loading: false,
            status: "RUNNING",
            phase: "online",
            message: "Fallback tunnel ready.",
            publicReady: true,
            localReady: true,
            url: state.url ?? "https://mock-tunnel.local",
            localUrl: state.localUrl ?? "http://127.0.0.1:8787/",
            hostedFiles: files.map((name, idx) => ({ id: idx, name: name.split(/[\\/]/).pop() ?? name, size: 0 })),
            logs: appendLog(state.logs, "Mock hosting ready.", MAX_ADVANCED_LOGS),
            simpleLogs: appendLog(state.simpleLogs, "Mock hosting ready.", MAX_SIMPLE_LOGS),
          }));
          return;
        }

        const response = (await invoke("start_host", {
          files,
          cfMode: provider === "cloudflare" ? "cloudflared" : undefined,
        })) as HostSessionInfo;
        set((state) => ({
          loading: false,
          status: response.publicUrl || response.localUrl ? "RUNNING" : state.status,
          url: response.publicUrl ?? state.url,
          localUrl: response.localUrl ?? state.localUrl,
          hostedFiles: response.files ?? [],
          logs: appendLog(state.logs, `Hosting started with ${response.files.length} file(s).`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Hosting started.", MAX_SIMPLE_LOGS),
          missingBinary: false,
        }));
        await get().refresh();
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          error: message,
          phase: "failed",
          message,
          logs: appendLog(state.logs, `Hosting failed: ${message}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Hosting failed.", MAX_SIMPLE_LOGS),
          missingBinary: /cloudflared/i.test(message),
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
          logs: appendLog(state.logs, "No tunnel active.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Tunnel already stopped.", MAX_SIMPLE_LOGS),
          status: "STOPPED",
          phase: "stopped",
        }));
        return;
      }

      set({ loading: true, phase: "stopping", message: "Stopping tunnel..." });
      try {
        await invoke("stop_host");
        set((state) => ({
          loading: false,
          status: "STOPPED",
          phase: "stopped",
          message: manual ? "Tunnel stopped manually." : "Tunnel stopped.",
          url: null,
          localUrl: null,
          publicReady: false,
          localReady: false,
          hostedFiles: [],
          logs: appendLog(state.logs, "Tunnel stopped.", MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, manual ? "Tunnel stopped manually." : "Tunnel stopped.", MAX_SIMPLE_LOGS),
        }));
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          loading: false,
          error: message,
          phase: "failed",
          message,
          logs: appendLog(state.logs, `Stop failed: ${message}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Failed to stop tunnel.", MAX_SIMPLE_LOGS),
        }));
        throw error;
      }
    },
    async refresh() {
      if (!isTauri()) return;
      try {
        const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
        set((state) => applyStatusPayload(state, status));
      } catch (error) {
        const message = typeof error === "string" ? error : (error as Error).message;
        set((state) => ({
          error: message,
          logs: appendLog(state.logs, `Status refresh failed: ${message}`, MAX_ADVANCED_LOGS),
          simpleLogs: appendLog(state.simpleLogs, "Status refresh failed.", MAX_SIMPLE_LOGS),
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
        return { ok: false, message: "No tunnel endpoint available." };
      }

      if (isTauri()) {
        try {
          const response = (await invoke("probe_tunnel_endpoint", {
            target: endpoint,
          })) as ProbeResult;
          set((current) => ({
            simpleLogs: appendLog(current.simpleLogs, response.message, MAX_SIMPLE_LOGS),
          }));
          return { ok: response.ok, message: response.message };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set((current) => ({
            simpleLogs: appendLog(current.simpleLogs, message, MAX_SIMPLE_LOGS),
          }));
          return { ok: false, message };
        }
      }

      try {
        const response = await fetch(endpoint, { method: "GET" });
        return {
          ok: response.ok,
          message: response.ok ? "Endpoint available." : `Unexpected response (${response.status}).`,
        };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
});
