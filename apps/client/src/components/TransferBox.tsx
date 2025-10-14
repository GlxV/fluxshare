import { useTransfersStore } from "../store/useTransfers";
import { Badge, type BadgeProps } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface TransferBoxProps {
  onPickFile: () => Promise<void>;
  onResume: (fileId: string) => void;
  onCancelFile: (fileId: string) => void;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

function formatEta(seconds: number | null) {
  if (!seconds || seconds === Infinity) return "--";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function formatSpeed(speedBytes: number | null) {
  if (!speedBytes || !Number.isFinite(speedBytes) || speedBytes <= 0) return "--";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = speedBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function resolveTransferBadge(status: string): { variant: BadgeProps["variant"]; label: string } {
  switch (status) {
    case "completed":
      return { variant: "success", label: "COMPLETED" };
    case "transferring":
      return { variant: "accent", label: "TRANSFERRING" };
    case "paused":
      return { variant: "accentSecondary", label: "PAUSED" };
    case "cancelled":
      return { variant: "danger", label: "CANCELLED" };
    case "error":
      return { variant: "danger", label: "ERROR" };
    default:
      return { variant: "neutral", label: status.toUpperCase() };
  }
}

export function TransferBox({ onPickFile, onResume, onCancelFile }: TransferBoxProps) {
  const { selectedFile, transfer } = useTransfersStore((state) => {
    const selected = state.selectedFile;
    return {
      selectedFile: selected,
      transfer: selected ? state.transfers[selected.fileId] ?? null : null,
    };
  });

  const totalBytes = transfer?.totalBytes ?? selectedFile?.size ?? 0;
  const transferBadge = transfer ? resolveTransferBadge(transfer.status) : null;
  const progressPercent = transfer
    ? Math.min(100, (transfer.bytesTransferred / Math.max(totalBytes, 1)) * 100)
    : 0;
  const elapsedSeconds = transfer ? (Date.now() - transfer.startedAt) / 1000 : null;
  const averageSpeed = transfer && elapsedSeconds && elapsedSeconds > 0
    ? transfer.bytesTransferred / elapsedSeconds
    : null;
  const eta = transfer && averageSpeed && averageSpeed > 0
    ? (transfer.totalBytes - transfer.bytesTransferred) / averageSpeed
    : null;

  return (
    <Card className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-[var(--text)]">Transferência</h2>
            {transferBadge && (
              <Badge variant={transferBadge.variant}>{transferBadge.label}</Badge>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {selectedFile ? selectedFile.name : "Nenhum arquivo selecionado"}
          </p>
        </div>
        <Button type="button" onClick={() => onPickFile()}>
          Selecionar arquivo
        </Button>
      </div>
      <div className="space-y-4">
        {selectedFile ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Tamanho
                </span>
                <p className="text-sm text-[var(--text)]">{formatBytes(selectedFile.size)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Progresso
                </span>
                <p className="text-sm text-[var(--text)]">{progressPercent.toFixed(1)}%</p>
              </div>
            </div>
            <div className="space-y-2">
              <div
                role="progressbar"
                aria-valuenow={Math.round(progressPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-3 w-full overflow-hidden rounded-full border border-[var(--card-border)]/60 bg-[var(--card)]/50"
              >
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-muted)]">
                <span>ETA: {formatEta(eta)}</span>
                <span>Velocidade média: {formatSpeed(averageSpeed)}</span>
                {transfer && (
                  <span>
                    Recebido: {formatBytes(transfer.bytesTransferred)} / {formatBytes(totalBytes)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => selectedFile && onResume(selectedFile.fileId)}
              >
                Retomar
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => selectedFile && onCancelFile(selectedFile.fileId)}
              >
                Cancelar
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--card-border)]/60 bg-[var(--card)]/40 px-6 py-10 text-center text-sm text-[var(--text-muted)]">
            Escolha um arquivo para iniciar uma nova transferência.
          </div>
        )}
      </div>
    </Card>
  );
}

export default TransferBox;
