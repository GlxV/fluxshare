import { usePeersStore } from "../store/usePeers";
import { useTransfersStore } from "../store/useTransfers";
import { Badge, type BadgeProps } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface PeersPanelProps {
  selfPeerId: string;
  onConnect: (peerId: string) => void;
  onDisconnect: (peerId: string) => void;
  onSend: (peerId: string) => void;
  onCancel: (peerId: string) => void;
}

function resolvePeerStatus(
  status: string,
  transferStatus: string | null,
): { label: string; variant: BadgeProps["variant"] } {
  if (transferStatus === "transferring") {
    return { label: "TRANSFERRING", variant: "accent" };
  }
  if (transferStatus === "completed") {
    return { label: "DONE", variant: "success" };
  }
  if (transferStatus === "paused") {
    return { label: "PAUSED", variant: "accentSecondary" };
  }
  if (transferStatus === "cancelled" || transferStatus === "error") {
    return { label: "DISCONNECTED", variant: "danger" };
  }
  if (status === "connecting") {
    return { label: "CONNECTING", variant: "accentSecondary" };
  }
  if (status === "connected") {
    return { label: "CONNECTED", variant: "success" };
  }
  if (status === "failed") {
    return { label: "DISCONNECTED", variant: "danger" };
  }
  return { label: "DISCONNECTED", variant: "neutral" };
}

export function PeersPanel({ selfPeerId, onConnect, onDisconnect, onSend, onCancel }: PeersPanelProps) {
  const peers = usePeersStore((state) =>
    Object.values(state.peers).filter((peer) => peer.peerId !== selfPeerId),
  );
  const transfers = useTransfersStore((state) => state.transfers);

  return (
    <Card className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-[var(--text)]">Peers na sala</h2>
        <p className="text-sm text-[var(--text-muted)]">Você é {selfPeerId || "--"}</p>
      </div>
      {peers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--card-border)]/60 bg-[var(--card)]/50 px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          Aguarde: nenhum peer apareceu na sala ainda.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {peers.map((peer) => {
            const transfer = Object.values(transfers).find(
              (entry) => entry.peerId === peer.peerId,
            );
            const badge = resolvePeerStatus(peer.status, transfer?.status ?? null);
            return (
              <div
                key={peer.peerId}
                className="card-shadow flex h-full flex-col justify-between gap-4 rounded-2xl border border-[var(--card-border)]/80 bg-[var(--card)]/80 p-5 backdrop-blur-2xl transition duration-200 hover:shadow-[0_28px_55px_-30px_rgba(15,23,42,0.6)]"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[var(--text)]">
                        {peer.displayName}
                      </p>
                      <p className="text-xs font-mono text-[var(--text-muted)]">
                        {peer.peerId}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  {transfer && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Transferência {transfer.status} • {Math.round(
                        (transfer.bytesTransferred / Math.max(transfer.totalBytes, 1)) * 100,
                      )}
                      %
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => onConnect(peer.peerId)}>
                    Conectar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => onDisconnect(peer.peerId)}>
                    Desconectar
                  </Button>
                  <Button type="button" onClick={() => onSend(peer.peerId)}>
                    Enviar arquivo
                  </Button>
                  <Button type="button" variant="danger" onClick={() => onCancel(peer.peerId)}>
                    Cancelar
                  </Button>
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
