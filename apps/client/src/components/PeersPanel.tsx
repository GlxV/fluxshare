import { Badge, type BadgeProps } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "../utils/cn";
import { useI18n } from "../i18n/LanguageProvider";

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
  return Math.min(100, (info.bytesTransferred / info.totalBytes) * 100);
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
  const { t } = useI18n();

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{t("peers.title")}</p>
        <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--text)]">{t("peers.youAre", { id: selfPeerId || "--" })}</p>
      </div>

      {peers.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_82%,transparent)] px-5 py-8 text-center text-sm text-[var(--muted)]">
          {t("peers.none")}
        </div>
      ) : (
        <div className="space-y-3">
          {peers.map((peer) => {
            const progress = formatProgress(peer.transfer);
            const isSelected = selectedPeerId === peer.peerId;
            return (
              <button
                key={peer.peerId}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(peer.peerId)}
                className={cn(
                  "w-full rounded-[var(--radius-lg)] border p-4 text-left transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
                  isSelected
                    ? "border-[color-mix(in_srgb,var(--primary)_42%,var(--border)_58%)] bg-[color-mix(in_srgb,var(--panel-strong)_92%,transparent)] shadow-[var(--shadow-soft)]"
                    : "border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] hover:border-[var(--border-strong)]",
                )}
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{peer.displayName}</p>
                      <p className="truncate font-mono text-xs text-[var(--muted)]">{peer.peerId}</p>
                    </div>
                    <Badge variant={peer.badgeVariant}>{peer.connectionState}</Badge>
                  </div>

                  {peer.transfer ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                        <span>
                          {peer.transfer.direction === "send"
                            ? t("peers.transfer.sending")
                            : t("peers.transfer.receiving")}
                        </span>
                        <span className="font-semibold text-[var(--text)]">
                          {progress !== null ? `${progress.toFixed(0)}%` : "--"}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--panel-strong)_78%,transparent)]">
                        <div
                          className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                          style={{ width: progress !== null ? `${progress}%` : "0%" }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--muted)]">{t("peers.transfer.none")}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        onConnect(peer.peerId);
                      }}
                    >
                      {t("peers.connect")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDisconnect(peer.peerId);
                      }}
                    >
                      {t("peers.disconnect")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSend(peer.peerId);
                      }}
                    >
                      {t("peers.send")}
                    </Button>
                    {peer.transfer && peer.transfer.status === "transferring" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCancel(peer.peerId);
                        }}
                      >
                        {t("peers.cancel")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default PeersPanel;
