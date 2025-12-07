import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AppOutletContext } from "../App";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useTunnelStore } from "../state/useTunnelStore";
import { isTauri } from "../lib/persist/tauri";
import { toast } from "../store/useToast";
import { usePreferencesStore } from "../state/usePreferencesStore";
import { TUNNEL_PROVIDERS, TUNNEL_PROVIDER_LABEL, type TunnelProvider } from "../types/tunnel";

const STATUS_LABEL: Record<"RUNNING" | "STOPPED", string> = {
  RUNNING: "Ativo",
  STOPPED: "Parado",
};

export default function TunnelPage() {
  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const advancedLogRef = useRef<HTMLDivElement | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState(false);
  const fallbackEnabled = usePreferencesStore((state) => state.tunnelFallbackEnabled);
  const setFallbackEnabled = usePreferencesStore((state) => state.setTunnelFallbackEnabled);
  const primaryProvider = usePreferencesStore((state) => state.primaryTunnelProvider);
  const fallbackProvider = usePreferencesStore((state) => state.fallbackTunnelProvider);
  const setPrimaryProvider = usePreferencesStore((state) => state.setPrimaryTunnelProvider);
  const setFallbackProvider = usePreferencesStore((state) => state.setFallbackTunnelProvider);
  const autoStopMinutes = usePreferencesStore((state) => state.autoStopMinutes);
  const setAutoStopMinutes = usePreferencesStore((state) => state.setAutoStopMinutes);
  const localOnly = usePreferencesStore((state) => state.localOnly);
  const setLocalOnly = usePreferencesStore((state) => state.setLocalOnly);
  const {
    status,
    url,
    localUrl,
    hostedFiles,
    logs,
    simpleLogs,
    loading,
    error,
    missingBinary,
    autoStopAt,
    start,
    host,
    stop,
    refresh,
    clear,
    testConnectivity,
  } = useTunnelStore((state) => ({
    status: state.status,
    url: state.url,
    localUrl: state.localUrl,
    hostedFiles: state.hostedFiles,
    logs: state.logs,
    simpleLogs: state.simpleLogs,
    loading: state.loading,
    error: state.error,
    missingBinary: state.missingBinary,
    autoStopAt: state.autoStopAt,
    start: state.start,
    host: state.host,
    stop: state.stop,
    refresh: state.refresh,
    clear: state.clear,
    testConnectivity: state.testConnectivity,
  }));

  useEffect(() => {
    setHeaderInfo({});
    void refresh();
  }, [refresh, setHeaderInfo]);

  useEffect(() => {
    const element = logContainerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [simpleLogs]);

  useEffect(() => {
    const element = advancedLogRef.current;
    if (element && showAdvanced) {
      element.scrollTop = element.scrollHeight;
    }
  }, [logs, showAdvanced]);

  const canCopyPublic = useMemo(() => Boolean(url), [url]);
  const canOpenLocal = useMemo(() => Boolean(localUrl), [localUrl]);
  const canCopyLocal = canOpenLocal;
  const hostedCount = useMemo(() => hostedFiles.length, [hostedFiles]);

  const remainingAutoStop = useMemo(() => {
    if (!autoStopAt) return null;
    const diff = autoStopAt - Date.now();
    if (diff <= 0) return "00:00";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [autoStopAt]);

  async function handleStart() {
    try {
      await start({
        provider: primaryProvider,
        fallbackProvider: fallbackEnabled ? fallbackProvider : undefined,
        autoStopMinutes,
        localOnly,
      });
      if (autoStopMinutes && autoStopMinutes > 0) {
        toast({ message: `Timer: túnel será encerrado em ${autoStopMinutes} min.`, variant: "info" });
      }
    } catch (err) {
      console.error("fluxshare:tunnel", err);
      toast({ message: "Erro ao iniciar túnel.", variant: "error" });
    }
  }

  async function handleSelectAndHost() {
    if (!isTauri()) {
      setHostError("Disponível apenas no aplicativo desktop.");
      return;
    }
    try {
      const { open } = await import("@tauri-apps/api/dialog");
      const selection = await open({ multiple: true, directory: false });
      const normalized = Array.isArray(selection)
        ? selection.filter((value): value is string => typeof value === "string" && value.length > 0)
        : typeof selection === "string" && selection.length > 0
          ? [selection]
          : [];
      if (normalized.length === 0) {
        setHostError("Nenhum arquivo selecionado.");
        return;
      }
      setHostError(null);
      const provider = fallbackEnabled ? fallbackProvider : primaryProvider;
      await host(normalized, provider);
      toast({ message: "Arquivos hospedados.", variant: "success" });
    } catch (err) {
      const message = typeof err === "string" ? err : (err as Error).message;
      setHostError(message);
      console.error("fluxshare:tunnel:host", err);
      toast({ message, variant: "error" });
    }
  }

  async function handleStop() {
    try {
      await stop(true);
    } catch (err) {
      console.error("fluxshare:tunnel", err);
      toast({ message: "Erro ao parar tunnel.", variant: "error" });
    }
  }

  async function handleCopy(target?: string | null) {
    if (!target) return;
    try {
      await navigator.clipboard?.writeText?.(target);
    } catch (err) {
      console.error("fluxshare:tunnel:copy", err);
    }
  }

  function handleOpen(target?: string | null) {
    if (!target) return;
    try {
      window.open(target, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("fluxshare:tunnel:open", err);
    }
  }

  async function handleTestConnectivity() {
    setTesting(true);
    const result = await testConnectivity();
    toast({ message: result.message, variant: result.ok ? "success" : "error" });
    setTesting(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-[var(--text)]">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Cloudflare Tunnel</h1>
        <p className="text-sm text-[var(--muted)]">
          Exponha sua instância local do FluxShare com um túnel seguro. O processo utiliza o binário oficial do Cloudflare e
          transmite os logs em tempo real.
        </p>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--text)]">Preferências rápidas</p>
          <p className="text-xs text-[var(--muted)]">
            Lembraremos esta configuração e ativaremos fallback de túnel quando houver provedores alternativos.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--primary)]"
            checked={fallbackEnabled}
            onChange={(event) => setFallbackEnabled(event.target.checked)}
          />
          <span>Fallback do túnel</span>
        </label>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Provider padrão</p>
            <select
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              value={primaryProvider}
              onChange={(e) => setPrimaryProvider(e.target.value as TunnelProvider)}
            >
              {TUNNEL_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {TUNNEL_PROVIDER_LABEL[provider]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Provider fallback</p>
            <select
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              value={fallbackProvider}
              onChange={(e) => setFallbackProvider(e.target.value as TunnelProvider)}
              disabled={!fallbackEnabled}
            >
              {TUNNEL_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {TUNNEL_PROVIDER_LABEL[provider]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Timer (min)</p>
            <input
              type="number"
              min={0}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              value={autoStopMinutes ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                const num = value === "" ? null : Math.max(0, Number(value));
                setAutoStopMinutes(Number.isFinite(num as number) ? (num as number | null) : null);
              }}
              placeholder="Sem timer"
            />
            {remainingAutoStop ? (
              <p className="text-xs text-[var(--muted)]">Auto-stop em {remainingAutoStop}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Modo local</p>
            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={localOnly}
                onChange={(e) => setLocalOnly(e.target.checked)}
              />
              <span>Usar somente P2P/local</span>
            </label>
            {localOnly ? <p className="text-xs text-[var(--muted)]">Túnel externo não será iniciado.</p> : null}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Conectividade</p>
            <Button variant="outline" onClick={handleTestConnectivity} disabled={testing || loading}>
              {testing ? "Testando..." : "Testar conectividade"}
            </Button>
          </div>
        </div>
      </Card>

      {missingBinary ? (
        <Card className="border border-[color-mix(in srgb,var(--primary) 35%,var(--border) 65%)] bg-[color-mix(in srgb,var(--surface) 85%,transparent)] p-4">
          <p className="text-sm text-[var(--text)]">
            <strong>cloudflared</strong> não foi encontrado no PATH. Instale o utilitário e tente novamente.
          </p>
        </Card>
      ) : null}

      {error ? (
        <Card className="border border-[color-mix(in srgb,var(--primary) 45%,var(--border) 55%)] bg-[color-mix(in srgb,var(--surface-2) 80%,transparent)] p-4">
          <p className="text-sm text-[var(--text)]">{error}</p>
        </Card>
      ) : null}

      {hostError ? (
        <Card className="border border-[color-mix(in srgb,var(--danger) 35%,var(--border) 65%)] bg-[color-mix(in srgb,var(--surface-2) 75%,transparent)] p-4">
          <p className="text-sm text-[var(--text)]">{hostError}</p>
        </Card>
      ) : null}

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Status</p>
            <p className="text-lg font-medium text-[var(--text)]">{STATUS_LABEL[status]}</p>
            {localOnly ? <span className="text-xs text-[var(--muted)]">Modo local ativado.</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSelectAndHost} disabled={loading}>
              {loading ? "Processando..." : "Selecionar arquivo(s) e gerar link"}
            </Button>
            <Button onClick={handleStart} disabled={loading || status === "RUNNING"}>
              {loading && status !== "RUNNING" ? "Iniciando..." : "Iniciar Tunnel"}
            </Button>
            <Button variant="secondary" onClick={handleStop} disabled={loading || status === "STOPPED"}>
              {loading && status === "RUNNING" ? "Parando..." : "Parar Tunnel"}
            </Button>
            <Button variant="ghost" onClick={() => handleCopy(url)} disabled={!canCopyPublic}>
              Copiar URL pública
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Link local</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm">
                {localUrl ?? "--"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleOpen(localUrl)} disabled={!canOpenLocal}>
                Abrir
              </Button>
              <Button variant="ghost" onClick={() => handleCopy(localUrl)} disabled={!canCopyLocal}>
                Copiar
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Link público</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm">
                {url ?? "--"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleOpen(url)} disabled={!canCopyPublic}>
                Abrir
              </Button>
              <Button variant="ghost" onClick={() => handleCopy(url)} disabled={!canCopyPublic}>
                Copiar
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">
            Arquivos hospedados: {hostedCount} {remainingAutoStop ? `· Auto-stop: ${remainingAutoStop}` : ""}
          </p>
          <Button variant="outline" onClick={clear} disabled={logs.length === 0 && simpleLogs.length === 0}>
            Limpar logs
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Logs simples</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((prev) => !prev)}>
              {showAdvanced ? "Ocultar avançados" : "Ver logs avançados"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
              Atualizar status
            </Button>
          </div>
        </div>
        <div
          ref={logContainerRef}
          className="max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 font-mono text-xs"
        >
          {simpleLogs.length === 0 ? (
            <p className="text-[var(--muted)]">Nenhum log simples ainda.</p>
          ) : (
            <ul className="space-y-1">
              {simpleLogs.map((line, index) => (
                <li key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-[var(--text)]">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {showAdvanced ? (
        <Card className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Logs avançados</h2>
            <p className="text-xs text-[var(--muted)]">Limite de linhas para preservar performance.</p>
          </div>
          <div
            ref={advancedLogRef}
            className="max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 font-mono text-xs"
          >
            {logs.length === 0 ? (
              <p className="text-[var(--muted)]">Nenhum log registrado ainda.</p>
            ) : (
              <ul className="space-y-1">
                {logs.map((line, index) => (
                  <li key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-[var(--text)]">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
