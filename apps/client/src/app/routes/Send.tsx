import { useEffect, useMemo, useState } from "react";
import FilePicker, { FileEntry } from "../components/FilePicker";
import ProgressBar from "../components/ProgressBar";
import SpeedMeter from "../components/SpeedMeter";
import { getStatus, sendFiles } from "../lib/api";

export default function Send() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<any>(null);
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    const id = setInterval(async () => {
      const s = await getStatus(sessionId).catch(() => null);
      if (s) setStatus(s);
    }, 1000);
    return () => clearInterval(id);
  }, [sessionId]);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  async function handleSend() {
    await sendFiles(sessionId, files, { encrypt, password: encrypt ? password : undefined });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <FilePicker onFiles={setFiles} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          Criptografia (ChaCha20-Poly1305)
        </label>
        {encrypt && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha compartilhada"
            className="bg-surface border border-white/10 rounded px-3 py-2"
          />
        )}
        <button onClick={handleSend} disabled={files.length === 0}>
          Enviar
        </button>
      </div>

      <div className="bg-surface/80 border border-white/10 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between text-sm text-white/80">
          <span>Arquivos selecionados: {files.length}</span>
          <span>Total: {(totalSize / (1024 * 1024)).toFixed(2)} MiB</span>
        </div>
        {files.map((file) => (
          <div key={file.path} className="space-y-2 border-t border-white/5 pt-3">
            <div className="flex justify-between text-sm">
              <span>{file.name}</span>
              <span>{(file.size / (1024 * 1024)).toFixed(2)} MiB</span>
            </div>
            <ProgressBar
              value={
                status?.fileProgress?.find((f: any) => f.path === file.path)?.transferred / file.size || 0
              }
            />
          </div>
        ))}

        {status && (
          <div className="space-y-2">
            <ProgressBar
              value={status.totalBytes ? status.transferredBytes / status.totalBytes : 0}
              label={`Progresso total (${status.transferredBytes}/${status.totalBytes} bytes)`}
            />
            <SpeedMeter rate={status.rate ?? 0} etaSeconds={status.etaSeconds ?? null} />
            <div className="text-xs text-white/50">Estado: {status.state}</div>
          </div>
        )}
      </div>
    </div>
  );
}
