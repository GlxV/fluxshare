import { useState } from "react";
import { startTunnel, stopTunnel } from "../lib/api";

export default function Tunnel() {
  const [url, setUrl] = useState<string | null>(null);
  const [port, setPort] = useState(8080);
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const { publicUrl } = await startTunnel(port);
      setUrl(publicUrl);
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    try {
      await stopTunnel();
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Cloudflare Tunnel</h2>
        <p className="text-sm text-white/70">
          Cria um túnel rápido usando o cloudflared. O link público serve os arquivos disponibilizados no servidor HTTP local.
        </p>
      </div>

      <div className="space-y-4 bg-surface/80 border border-white/10 rounded-lg p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm text-white/70">
            Porta local
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="block bg-surface border border-white/10 rounded px-3 py-2 mt-1"
            />
          </label>
          <button onClick={handleStart} disabled={loading}>
            {loading ? "Iniciando..." : "Iniciar Tunnel"}
          </button>
          <button onClick={handleStop} disabled={loading}>
            Parar Tunnel
          </button>
        </div>

        {url && (
          <div className="space-y-2">
            <div className="text-sm text-white/80">URL pública</div>
            <div className="bg-black/40 border border-accent/40 rounded px-3 py-2 font-mono text-sm break-all">{url}</div>
            <button onClick={() => navigator.clipboard.writeText(url)}>Copiar link</button>
          </div>
        )}

        <p className="text-xs text-white/50">
          Aviso: o link é público. Apenas compartilhe com pessoas confiáveis.
        </p>
      </div>
    </div>
  );
}
