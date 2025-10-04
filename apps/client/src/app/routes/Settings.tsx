import { useEffect, useState } from "react";
import { getSettings, setSettings } from "../lib/api";

interface SettingsData {
  chunkSize: number;
  parallelChunks: number;
  iceTimeoutMs: number;
  cloudflaredPath: string;
}

export default function Settings() {
  const [settings, setState] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setState(s as SettingsData));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await setSettings(settings as any);
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    setState((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (!settings) return <div>Carregando configurações...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Configurações</h2>
      <div className="grid gap-4 max-w-xl">
        <label className="flex flex-col text-sm text-white/70">
          Tamanho do chunk (MiB)
          <input
            type="number"
            value={settings.chunkSize / (1024 * 1024)}
            onChange={(e) => update("chunkSize", Number(e.target.value) * 1024 * 1024)}
            className="bg-surface border border-white/10 rounded px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm text-white/70">
          Conexões paralelas
          <input
            type="number"
            value={settings.parallelChunks}
            onChange={(e) => update("parallelChunks", Number(e.target.value))}
            className="bg-surface border border-white/10 rounded px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm text-white/70">
          Timeout ICE (ms)
          <input
            type="number"
            value={settings.iceTimeoutMs}
            onChange={(e) => update("iceTimeoutMs", Number(e.target.value))}
            className="bg-surface border border-white/10 rounded px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm text-white/70">
          Caminho cloudflared
          <input
            value={settings.cloudflaredPath}
            onChange={(e) => update("cloudflaredPath", e.target.value)}
            className="bg-surface border border-white/10 rounded px-3 py-2"
          />
        </label>
      </div>
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}
