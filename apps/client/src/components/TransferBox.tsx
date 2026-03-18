import { useEffect, useMemo, useState } from "react";
import { Badge, type BadgeProps } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import ImportPreparationPanel from "./ImportPreparationPanel";
import { useTunnelStore } from "../state/useTunnelStore";
import { isTauri } from "../lib/persist/tauri";
import { usePreferencesStore } from "../state/usePreferencesStore";
import { useI18n } from "../i18n/LanguageProvider";
import { type ImportPreparationStatus } from "../lib/transfer/importStatus";
import { stageBrowserFileForTauri } from "../lib/transfer/browserFile";

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
  importStatus: ImportPreparationStatus;
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

export function TransferBox({
  file,
  transfer,
  importStatus,
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
    let cleanupStagedFile: (() => Promise<void>) | undefined;
    try {
      let pathToHost: string | null = null;
      if (file.source === "tauri" && file.path) {
        pathToHost = file.path;
      } else if (file.source === "web" && file.file) {
        const staged = await stageBrowserFileForTauri(file.file);
        pathToHost = staged.path;
        cleanupStagedFile = staged.cleanup;
      }

      if (!pathToHost) {
        setHostLinkError(t("transfer.hostError"));
        return;
      }

      const provider = fallbackEnabled ? fallbackProvider : primaryProvider;
      await host([pathToHost], provider);
      if (provider === "mock") {
        await cleanupStagedFile?.().catch((cleanupError) => {
          console.warn("fluxshare:file", "failed to clean mock-host staged file", cleanupError);
        });
      }
      setHostLinkError(null);
    } catch (error) {
      await cleanupStagedFile?.().catch((cleanupError) => {
        console.warn("fluxshare:file", "failed to clean failed-host staged file", cleanupError);
      });
      const message = typeof error === "string" ? error : (error as Error).message;
      setHostLinkError(message);
    } finally {
      setHostingLink(false);
    }
  }

  return (
    <Card className="flex h-full flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{t("transfer.title")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold tracking-[-0.03em] text-[var(--text)]">{statusLabel}</p>
            {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
          </div>
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

      <ImportPreparationPanel status={importStatus} />

      {file ? (
        <>
          <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] p-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{t("transfer.name")}</p>
                  <p className="break-all text-base font-semibold text-[var(--text)]">{file.name}</p>
                </div>
                {file.kind === "folder" ? <Badge variant="accentSecondary">{t("send.type.folder")}</Badge> : null}
              </div>

              <div className="fs-metric-grid">
                <div className="fs-metric">
                  <p className="fs-metric__label">{t("transfer.size")}</p>
                  <p className="fs-metric__value">{formatBytes(file.size)}</p>
                </div>
                <div className="fs-metric">
                  <p className="fs-metric__label">{t("transfer.destination")}</p>
                  <p className="fs-metric__value">{file.targetLabel ?? statusLabel}</p>
                </div>
              </div>
            </div>
          </div>

          {transfer ? (
            <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] p-5">
              <div className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--panel-strong)_78%,transparent)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="fs-metric-grid">
                  <div className="fs-metric">
                    <p className="fs-metric__label">{t("transfer.progress")}</p>
                    <p className="fs-metric__value">{progress.toFixed(1)}%</p>
                  </div>
                  <div className="fs-metric">
                    <p className="fs-metric__label">{t("transfer.speed")}</p>
                    <p className="fs-metric__value">{speedBytes > 0 ? `${formatBytes(speedBytes)}/s` : "--"}</p>
                  </div>
                  <div className="fs-metric">
                    <p className="fs-metric__label">{t("transfer.eta")}</p>
                    <p className="fs-metric__value">{eta}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canHostFromFile ? (
              <Button type="button" variant="outline" onClick={handleHostLink} disabled={hostingLink}>
                {hostingLink ? t("transfer.hosting") : t("transfer.hostLink")}
              </Button>
            ) : null}
            {transfer && transfer.status === "transferring" ? (
              <Button type="button" variant="danger" onClick={() => onCancel(transfer.peerId, transfer.id)}>
                {t("transfer.cancel")}
              </Button>
            ) : null}
          </div>

          {hostLinkError ? (
            <p className="text-xs text-[color-mix(in_srgb,var(--danger)_82%,var(--text)_18%)]">{hostLinkError}</p>
          ) : null}
        </>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_82%,transparent)] px-6 py-10 text-center text-sm text-[var(--muted)]">
          {t("transfer.selectPrompt")}
        </div>
      )}

      {activeTransferId ? (
        <p className="text-xs text-[var(--muted)]">
          {t("transfer.activeId")}: <span className="font-mono">{activeTransferId}</span>
        </p>
      ) : null}
    </Card>
  );
}

export default TransferBox;
