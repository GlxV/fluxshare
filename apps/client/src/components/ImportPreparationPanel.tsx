import { Card } from "./ui/Card";
import { useI18n } from "../i18n/LanguageProvider";
import { type ImportPreparationStatus } from "../lib/transfer/importStatus";

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[exponent]}`;
}

function getStageLabel(status: ImportPreparationStatus, t: ReturnType<typeof useI18n>["t"]) {
  switch (status.stage) {
    case "analyzing":
      return t("import.stage.analyzing");
    case "scanning":
      return t("import.stage.scanning");
    case "packing":
      return t("import.stage.packing");
    case "copying":
      return t("import.stage.copying");
    case "error":
      return t("import.stage.error");
    default:
      return t("import.stage.ready");
  }
}

interface ImportPreparationPanelProps {
  status: ImportPreparationStatus;
}

export function ImportPreparationPanel({ status }: ImportPreparationPanelProps) {
  const { t } = useI18n();
  if (!status.active && status.stage !== "error") {
    return null;
  }

  const progress = typeof status.progress === "number" ? Math.max(0, Math.min(100, status.progress * 100)) : null;
  const stageLabel = getStageLabel(status, t);
  const processedBytes = formatBytes(status.bytesProcessed);
  const totalBytes = formatBytes(status.totalBytes);

  return (
    <Card tone="muted" className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{t("import.title")}</p>
          <p className="text-sm font-semibold text-[var(--text)]">{stageLabel}</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-strong)]">
          {progress !== null ? `${progress.toFixed(progress >= 10 ? 0 : 1)}%` : t("import.status.running")}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--panel-strong)_80%,transparent)]">
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
          style={{ width: progress !== null ? `${progress}%` : "35%" }}
        />
      </div>

      <div className="space-y-2 text-sm leading-6 text-[var(--muted)]">
        <p>{status.message || stageLabel}</p>
        {status.detail ? <p className="text-xs text-[var(--muted-strong)]">{status.detail}</p> : null}
      </div>

      {(status.filesProcessed || status.totalFiles || processedBytes || totalBytes) ? (
        <div className="fs-metric-grid">
          {(status.filesProcessed || status.totalFiles) ? (
            <div className="fs-metric">
              <p className="fs-metric__label">{t("import.status.files", { current: status.filesProcessed ?? 0, total: status.totalFiles ?? "--" })}</p>
              <p className="fs-metric__value">
                {(status.filesProcessed ?? 0).toString()} / {(status.totalFiles ?? "--").toString()}
              </p>
            </div>
          ) : null}
          {(processedBytes || totalBytes) ? (
            <div className="fs-metric">
              <p className="fs-metric__label">{t("import.status.bytes", { current: processedBytes ?? "--", total: totalBytes ?? "--" })}</p>
              <p className="fs-metric__value">
                {processedBytes ?? "--"} / {totalBytes ?? "--"}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export default ImportPreparationPanel;
