import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AppOutletContext } from "../App";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useTunnelStore } from "../state/useTunnelStore";
import { isTauri } from "../lib/persist/tauri";

const STATUS_LABEL: Record<"RUNNING" | "STOPPED", string> = {
  RUNNING: "Ativo",
  STOPPED: "Parado",
};

export default function TunnelPage() {
  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const { status, url, localUrl, hostedFiles, logs, loading, error, missingBinary, start, host, stop, refresh, clear } =
    useTunnelStore(
      (state) => ({
        status: state.status,
        url: state.url,
        localUrl: state.localUrl,
        hostedFiles: state.hostedFiles,
        logs: state.logs,
        loading: state.loading,
        error: state.error,
        missingBinary: state.missingBinary,
        start: state.start,
        host: state.host,
        stop: state.stop,
        refresh: state.refresh,
        clear: state.clear,
      }),
    );

  useEffect(() => {
    setHeaderInfo({});
    void refresh();
  }, [refresh, setHeaderInfo]);

  useEffect(() => {
    const element = logContainerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [logs]);

  const canCopyPublic = useMemo(() => Boolean(url), [url]);
  const canOpenLocal = useMemo(() => Boolean(localUrl), [localUrl]);
  const canCopyLocal = canOpenLocal;
  const hostedCount = useMemo(() => hostedFiles.length, [hostedFiles]);

  async function handleStart() {
    try {
      await start();
    } catch (err) {
      console.error("fluxshare:tunnel", err);
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
      await host(normalized, "cloudflared");
    } catch (err) {
      const message = typeof err === "string" ? err : (err as Error).message;
      setHostError(message);
      console.error("fluxshare:tunnel:host", err);
    }
  }

  async function handleStop() {
    try {
      await stop();
    } catch (err) {
      console.error("fluxshare:tunnel", err);
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-[var(--text)]">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Cloudflare Tunnel</h1>
        <p className="text-sm text-[var(--muted)]">
          Exponha sua instância local do FluxShare com um túnel seguro. O processo utiliza o binário oficial do Cloudflare e
          transmite os logs em tempo real.
        </p>
      </div>

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
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Status</p>
            <p className="text-lg font-medium text-[var(--text)]">{STATUS_LABEL[status]}</p>
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
          <p className="text-sm text-[var(--muted)]">Arquivos hospedados: {hostedCount}</p>
          <Button variant="outline" onClick={clear} disabled={logs.length === 0}>
            Limpar logs
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Logs em tempo real</h2>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
            Atualizar status
          </Button>
        </div>
        <div
          ref={logContainerRef}
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
    </div>
  );
}
