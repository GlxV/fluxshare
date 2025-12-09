import { useEffect, useMemo, useState } from "react";
import { Badge, type BadgeProps } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { useTunnelStore } from "../state/useTunnelStore";
import { isTauri } from "../lib/persist/tauri";
import { usePreferencesStore } from "../state/usePreferencesStore";
import { useI18n } from "../i18n/LanguageProvider";

interface TransferBoxProps {
  file: {
    id: string;
    name: string;
    size: number;
    mime?: string;
    kind?: "file" | "folder";
    targetLabel?: string;
    source?: "web" | "tauri" | "tauri-folder";
    file?: File;
    path?: string;
  } | null;
  transfer: {
    id: string;
    status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
    direction: "send" | "receive";
    bytesTransferred: number;
    totalBytes: number;
    startedAt: number;
    updatedAt: number;
    peerId: string;
  } | null;
  onPickFile: () => Promise<void>;
  onPickFolder?: () => Promise<void>;
  onCancel: (peerId: string, transferId: string) => void;
  activeTransferId: string | null;
  hasConnectedPeers: boolean;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[exponent]}`;
}

function statusBadge(
  transfer: TransferBoxProps["transfer"] | null,
  t: ReturnType<typeof useI18n>["t"],
): { variant: BadgeProps["variant"]; label: string } | null {
  if (!transfer) return null;
  switch (transfer.status) {
    case "transferring":
      return { variant: "accent", label: t("transfer.status.transferring") };
    case "completed":
      return { variant: "success", label: t("transfer.status.completed") };
    case "cancelled":
      return { variant: "danger", label: t("transfer.status.cancelled") };
    case "error":
      return { variant: "danger", label: t("transfer.status.error") };
    case "paused":
      return { variant: "accentSecondary", label: t("transfer.status.paused") };
    default:
      return null;
  }
}

function formatEta(bytesRemaining: number, speedBytes: number) {
  if (speedBytes <= 0) return "--";
  const seconds = Math.ceil(bytesRemaining / speedBytes);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function computeStatusLabel({
  file,
  transfer,
  hasConnectedPeers,
  t,
}: {
  file: TransferBoxProps["file"];
  transfer: TransferBoxProps["transfer"];
  hasConnectedPeers: boolean;
  t: ReturnType<typeof useI18n>["t"];
}): string {
  if (transfer) {
    switch (transfer.status) {
      case "transferring":
        return transfer.direction === "receive" ? t("room.transfer.received") : t("transfer.status.transferring");
      case "completed":
        return transfer.direction === "receive" ? t("room.transfer.received") : t("transfer.status.completed");
      case "cancelled":
        return t("transfer.status.cancelled");
      case "error":
        return t("transfer.status.error");
      case "paused":
        return t("transfer.status.paused");
      default:
        return t("transfer.title");
    }
  }
  if (file) {
    return hasConnectedPeers ? t("transfer.ready") : t("transfer.waitingPeer");
  }
  return t("transfer.none");
}

function renderTargetLabel(label: string | undefined, t: ReturnType<typeof useI18n>["t"]) {
  if (!label) return null;
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {t("transfer.destination")}
      </span>
      <p className="text-sm text-[var(--text)]">{label}</p>
    </div>
  );
}

export function TransferBox({
  file,
  transfer,
  onPickFile,
  onPickFolder,
  onCancel,
  activeTransferId,
  hasConnectedPeers,
}: TransferBoxProps) {
  const { t } = useI18n();
  const host = useTunnelStore((state) => state.host);
  const primaryProvider = usePreferencesStore((state) => state.primaryTunnelProvider);
  const fallbackProvider = usePreferencesStore((state) => state.fallbackTunnelProvider);
  const fallbackEnabled = usePreferencesStore((state) => state.tunnelFallbackEnabled);
  const [hostingLink, setHostingLink] = useState(false);
  const [hostLinkError, setHostLinkError] = useState<string | null>(null);
  const canHostFromFile = useMemo(() => Boolean(file?.source), [file?.source]);
  const badge = statusBadge(transfer, t);
  const progress = transfer ? Math.min(100, (transfer.bytesTransferred / Math.max(transfer.totalBytes, 1)) * 100) : 0;
  const elapsedSeconds = transfer ? Math.max(0, (transfer.updatedAt - transfer.startedAt) / 1000) : 0;
  const speedBytes = transfer && elapsedSeconds > 0 ? transfer.bytesTransferred / elapsedSeconds : 0;
  const eta = transfer ? formatEta(transfer.totalBytes - transfer.bytesTransferred, speedBytes) : "--";
  const statusLabel = computeStatusLabel({ file, transfer, hasConnectedPeers, t });

  useEffect(() => {
    setHostLinkError(null);
    setHostingLink(false);
  }, [file?.id]);

  async function handleHostLink() {
    if (!file) return;
    if (!isTauri()) {
      setHostLinkError(t("send.desktopRequired"));
      return;
    }
    if (hostingLink) return;
    setHostingLink(true);
    setHostLinkError(null);
    try {
      let pathToHost: string | null = null;
      if (file.source === "tauri" && file.path) {
        pathToHost = file.path;
      } else if (file.source === "web" && file.file) {
        const [{ appCacheDir, join }, { createDir, writeBinaryFile }] = await Promise.all([
          import("@tauri-apps/api/path"),
          import("@tauri-apps/api/fs"),
        ]);
        const cacheDir = await appCacheDir();
        const folder = await join(cacheDir, `fluxshare-host-${Date.now()}`);
        await createDir(folder, { recursive: true });
        const filename = file.name || `arquivo-${Date.now()}`;
        const destination = await join(folder, filename);
        const buffer = new Uint8Array(await file.file.arrayBuffer());
        await writeBinaryFile({ path: destination, contents: buffer });
        pathToHost = destination;
      }

      if (!pathToHost) {
        setHostLinkError(t("transfer.hostError"));
        return;
      }

      const provider = fallbackEnabled ? fallbackProvider : primaryProvider;
      await host([pathToHost], provider);
      setHostLinkError(null);
    } catch (error) {
      const message = typeof error === "string" ? error : (error as Error).message;
      setHostLinkError(message);
    } finally {
      setHostingLink(false);
    }
  }

  return (
    <Card className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-[var(--text)]">{t("transfer.title")}</h2>
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </div>
          <p className="text-sm text-[var(--muted)]">{statusLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => onPickFile()}>
            {t("transfer.pickFile")}
          </Button>
          {onPickFolder ? (
            <Button type="button" variant="secondary" onClick={() => onPickFolder()}>
              {t("transfer.pickFolder")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="space-y-4">
        {file ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  {t("transfer.name")}
                </span>
                <p className="text-sm text-[var(--text)]">{file.name}</p>
                {file.kind === "folder" ? <Badge variant="accentSecondary">{t("send.type.folder")}</Badge> : null}
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  {t("transfer.size")}
                </span>
                <p className="text-sm text-[var(--text)]">{formatBytes(file.size)}</p>
              </div>
              {renderTargetLabel(file.targetLabel, t)}
            </div>
            {canHostFromFile ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={handleHostLink} disabled={hostingLink}>
                    {hostingLink ? t("transfer.hosting") : t("transfer.hostLink")}
                  </Button>
                </div>
                {hostLinkError ? (
                  <p className="text-xs text-[color-mix(in srgb,var(--danger) 70%,var(--text) 30%)]">{hostLinkError}</p>
                ) : null}
              </>
            ) : null}
            {transfer ? (
              <div className="space-y-2">
                <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--muted)]">
                  <span>
                    {t("transfer.progress")}: {progress.toFixed(1)}%
                  </span>
                  <span>
                    {t("transfer.speed")}: {speedBytes > 0 ? `${formatBytes(speedBytes)}/s` : "--"}
                  </span>
                  <span>
                    {t("transfer.eta")}: {eta}
                  </span>
                </div>
              </div>
            ) : null}
            {transfer && transfer.status === "transferring" ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="danger" onClick={() => onCancel(transfer.peerId, transfer.id)}>
                  {t("transfer.cancel")}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 75%,transparent)] px-6 py-10 text-center text-sm text-[var(--muted)]">
            {t("transfer.selectPrompt")}
          </div>
        )}
      </div>
      {activeTransferId ? (
        <p className="text-xs text-[var(--muted)]">
          {t("transfer.activeId")}: {activeTransferId}
        </p>
      ) : null}
    </Card>
  );
}

export default TransferBox;
