import { FormEvent, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import type { AppOutletContext } from "../App";

function buildPreviewUrl(port: number) {
  const normalized = Number.isFinite(port) && port > 0 ? port : 8080;
  return `https://example-${normalized}.trycloudflare.com`;
}

export default function TunnelPage() {
  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
  const [port, setPort] = useState(8080);
  const [cloudflaredPath, setCloudflaredPath] = useState("cloudflared");
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<"start" | "stop" | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    setHeaderInfo({});
  }, [setHeaderInfo]);

  const statusLabel = useMemo(() => {
    if (loadingAction === "start") {
      return "Iniciando túnel de exemplo...";
    }
    if (loadingAction === "stop") {
      return "Encerrando túnel...";
    }
    if (publicUrl) {
      return "Tunnel ativo (modo demonstração)";
    }
    if (hasStarted) {
      return "Tunnel parado";
    }
    return "Nenhum tunnel iniciado";
  }, [hasStarted, loadingAction, publicUrl]);

  const handleStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingAction("start");

    window.setTimeout(() => {
      setPublicUrl(buildPreviewUrl(port));
      setHasStarted(true);
      setLoadingAction(null);
    }, 400);
  };

  const handleStop = () => {
    setLoadingAction("stop");

    window.setTimeout(() => {
      setPublicUrl(null);
      setLoadingAction(null);
    }, 300);
  };

  const handleCopy = () => {
    if (publicUrl && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(publicUrl).catch(() => undefined);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-[var(--text)]">Cloudflare Tunnel</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Esta tela recria o formulário clássico do tunnel como uma prévia visual. A integração com o
          Cloudflare Tunnel será reativada em uma etapa futura.
        </p>
      </div>

      <Card className="space-y-6 p-6">
        <form className="space-y-6" onSubmit={handleStart}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-[var(--text-muted)]">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Porta local
              </span>
              <input
                type="number"
                min={1}
                className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
                value={port}
                onChange={(event) => setPort(Number(event.target.value))}
                placeholder="8080"
              />
            </label>
            <label className="space-y-2 text-sm text-[var(--text-muted)]">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Caminho do cloudflared
              </span>
              <input
                className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
                value={cloudflaredPath}
                onChange={(event) => setCloudflaredPath(event.target.value)}
                placeholder="Ex: /usr/local/bin/cloudflared"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={loadingAction !== null}>
              {loadingAction === "start" ? "Iniciando..." : "Iniciar Tunnel"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loadingAction !== null || !publicUrl}
              onClick={handleStop}
            >
              {loadingAction === "stop" ? "Parando..." : "Parar Tunnel"}
            </Button>
          </div>
        </form>

        <div className="space-y-4">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Status
            </span>
            <div className="mt-2 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)]">
              {statusLabel}
            </div>
          </div>

          {publicUrl ? (
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                URL pública (demonstração)
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-2 font-mono text-sm text-[var(--text)] break-all">
                  {publicUrl}
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
                  Copiar link
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--card-border)]/50 bg-[var(--card)]/40 px-4 py-3 text-sm text-[var(--text-muted)]">
              Inicie o tunnel para gerar um link de visualização.
            </div>
          )}
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Este modo é apenas uma representação visual. Nenhum comando real é executado e nenhum túnel é criado.
        </p>
      </Card>
    </div>
  );
}
