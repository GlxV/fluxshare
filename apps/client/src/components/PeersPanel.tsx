import { Badge, type BadgeProps } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "../utils/cn";

export interface PeerTransferInfo {
  status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
  direction: "send" | "receive";
  bytesTransferred: number;
  totalBytes: number;
  updatedAt: number;
}

export interface PeerViewModel {
  peerId: string;
  displayName: string;
  connectionState: string;
  badgeVariant: BadgeProps["variant"];
  transfer?: PeerTransferInfo;
}

interface PeersPanelProps {
  selfPeerId: string | null;
  peers: PeerViewModel[];
  selectedPeerId: string | null;
  onSelect(peerId: string): void;
  onConnect(peerId: string): void;
  onDisconnect(peerId: string): void;
  onSend(peerId: string): void;
  onCancel(peerId: string): void;
}

function formatProgress(info: PeerTransferInfo | undefined) {
  if (!info || info.totalBytes === 0) return null;
  const value = Math.min(100, (info.bytesTransferred / info.totalBytes) * 100);
  return value;
}

export function PeersPanel({
  selfPeerId,
  peers,
  selectedPeerId,
  onSelect,
  onConnect,
  onDisconnect,
  onSend,
  onCancel,
}: PeersPanelProps) {
  return (
    <Card className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-[var(--text)]">Peers na sala</h2>
        <p className="text-sm text-[var(--muted)]">Você é {selfPeerId || "--"}</p>
      </div>
      {peers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 75%,transparent)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          Aguarde: nenhum peer apareceu na sala ainda.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {peers.map((peer) => {
            const progress = formatProgress(peer.transfer);
            const isSelected = selectedPeerId === peer.peerId;
            return (
              <div
                key={peer.peerId}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => onSelect(peer.peerId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(peer.peerId);
                  }
                }}
                className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              >
                <div
                  className={cn(
                    "card-shadow flex h-full flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 backdrop-blur-2xl transition duration-200",
                    isSelected
                      ? "border-[color-mix(in srgb,var(--primary) 65%,var(--border) 35%)] shadow-[0_28px_55px_-30px_var(--ring)]"
                      : "hover:border-[color-mix(in srgb,var(--primary) 35%,var(--border) 65%)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[var(--text)]">{peer.displayName}</p>
                      <p className="text-xs font-mono text-[var(--muted)]">{peer.peerId}</p>
                    </div>
                    <Badge variant={peer.badgeVariant}>{peer.connectionState}</Badge>
                  </div>
                  {peer.transfer ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                        <span>{peer.transfer.direction === "send" ? "Enviando" : "Recebendo"}</span>
                        <span className="font-medium text-[var(--text)]">
                          {progress !== null ? `${progress.toFixed(1)}%` : "--"}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
                        <div
                          className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                          style={{ width: progress !== null ? `${progress}%` : "0%" }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--muted)]">Nenhuma transferência em andamento.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        onConnect(peer.peerId);
                      }}
                    >
                      Conectar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDisconnect(peer.peerId);
                      }}
                    >
                      Desconectar
                    </Button>
                    <Button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSend(peer.peerId);
                      }}
                    >
                      Enviar arquivo
                    </Button>
                    {peer.transfer && peer.transfer.status === "transferring" ? (
                      <Button
                        type="button"
                        variant="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCancel(peer.peerId);
                        }}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default PeersPanel;
