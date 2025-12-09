import { useEffect, useMemo, useState } from "react";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { type TransferState } from "../store/useTransfers";
import { useI18n } from "../i18n/LanguageProvider";

interface SessionPanelProps {
  transfers: Record<string, TransferState>;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[exponent]}`;
}

function formatEta(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "--";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.ceil(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

export function SessionPanel({ transfers }: SessionPanelProps) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const {
    totalBytes,
    transferredBytes,
    sessionProgress,
    active,
    completedCount,
    totalCount,
    errorCount,
    current,
    currentSpeed,
    currentEta,
    currentProgress,
    currentStatus,
  } = useMemo(() => {
    const list = Object.values(transfers);
    const totalBytes = list.reduce((sum, item) => sum + item.totalBytes, 0);
    const transferredBytes = list.reduce(
      (sum, item) => sum + Math.min(item.bytesTransferred, item.totalBytes),
      0,
    );
    const sessionProgress = totalBytes > 0 ? (transferredBytes / totalBytes) * 100 : 0;
    const active = list.filter((item) => item.status === "transferring");
    const completedCount = list.filter((item) => item.status === "completed").length;
    const errorCount = list.filter((item) => item.status === "error").length;
    const current =
      active.sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
      list.sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
      null;
    const elapsedSeconds =
      current && current.startedAt ? Math.max(1, (now - current.startedAt) / 1000) : null;
    const currentSpeed = current && elapsedSeconds ? current.bytesTransferred / elapsedSeconds : 0;
    const remaining =
      current && currentSpeed > 0 ? (current.totalBytes - current.bytesTransferred) / currentSpeed : null;
    return {
      totalBytes,
      transferredBytes,
      sessionProgress,
      active,
      completedCount,
      errorCount,
      totalCount: list.length,
      current,
      currentSpeed,
      currentEta: remaining,
      currentProgress: current && current.totalBytes > 0 ? (current.bytesTransferred / current.totalBytes) * 100 : 0,
      currentStatus: current?.status ?? "idle",
    };
  }, [now, transfers]);

  const queueCount = Math.max(0, totalCount - completedCount - active.length);

  const currentStatusLabel = useMemo(() => {
    switch (currentStatus) {
      case "transferring":
        return t("transfer.status.transferring");
      case "completed":
        return t("transfer.status.completed");
      case "error":
        return t("transfer.status.error");
      case "cancelled":
        return t("transfer.status.cancelled");
      case "paused":
        return t("transfer.status.paused");
      default:
        return currentStatus;
    }
  }, [currentStatus, t]);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("session.subtitle")}
          </p>
          <p className="text-lg font-semibold text-[var(--text)]">{t("session.title")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="accentSecondary">
            {t("session.active")}: {active.length}
          </Badge>
          <Badge variant="success">
            {t("session.completed")}: {completedCount}
          </Badge>
          {errorCount > 0 ? <Badge variant="danger">{t("session.errors")}: {errorCount}</Badge> : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-[var(--muted)]">
          <span>{t("session.progress")}</span>
          <span>
            {formatBytes(transferredBytes)} / {formatBytes(totalBytes || 0)} ({sessionProgress.toFixed(1)}%)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
            style={{ width: `${sessionProgress}%` }}
          />
        </div>
        <div className="text-xs text-[var(--muted)]">
          {t("session.queue")}: {queueCount} · Total: {totalCount}
        </div>
      </div>

      {current ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("session.current")}
            </p>
            <p className="text-sm font-medium text-[var(--text)]">{current.fileName ?? t("transfer.title")}</p>
            <p className="text-xs text-[var(--muted)]">
              {formatBytes(current.bytesTransferred)} / {formatBytes(current.totalBytes)}
            </p>
            <div className="h-2 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
              <div
                className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                style={{ width: `${currentProgress}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {t("transfer.title")}: {currentStatusLabel}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("session.speedEta")}
            </p>
            <p className="text-sm text-[var(--text)]">
              {currentSpeed > 0 ? `${formatBytes(currentSpeed)}/s` : "--"} · {formatEta(currentEta)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">{t("session.none")}</p>
      )}
    </Card>
  );
}

export default SessionPanel;
