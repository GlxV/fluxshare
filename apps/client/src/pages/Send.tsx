import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { UrlField, UrlText } from "../components/ui/UrlDisplay";
import { FileGlyph, FolderGlyph, UploadGlyph } from "../components/branding/FluxShareMarks";
import ImportPreparationPanel from "../components/ImportPreparationPanel";
import { useI18n } from "../i18n/LanguageProvider";
import {
  pickTauriFile,
  pickTauriFolder,
  pickWebFile,
  selectTauriPath,
  type SelectedItem,
} from "../lib/transfer/selectFile";
import { selectTransferRoute, type RouteDecision } from "../lib/transfer/route";
import { usePreferencesStore } from "../state/usePreferencesStore";
import { useExplorerShareStore } from "../state/useExplorerShareStore";
import { useTunnelStore } from "../state/useTunnelStore";
import { toast } from "../store/useToast";
import { isTauri } from "../lib/persist/tauri";
import { cn } from "../utils/cn";
import { IDLE_IMPORT_STATUS, type ImportPreparationStatus } from "../lib/transfer/importStatus";
import { stageBrowserFileForTauri } from "../lib/transfer/browserFile";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "--";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[exponent]}`;
}

function formatPhaseLabel(phase: string) {
  return phase
    .split("_")
    .filter(Boolean)
    .map((chunk) => chunk.slice(0, 1).toUpperCase() + chunk.slice(1))
    .join(" ");
}

async function resolvePathForHost(
  item: SelectedItem,
  reportImportStatus?: (status: ImportPreparationStatus) => void,
): Promise<{ path: string; cleanup?: () => Promise<void> } | null> {
  if (item.source === "tauri" || item.source === "tauri-folder") {
    return item.path ? { path: item.path } : null;
  }
  if (item.source === "web" && item.file && isTauri()) {
    return await stageBrowserFileForTauri(item.file, reportImportStatus);
  }
  return null;
}

function routeNeedsPublicLink(route: RouteDecision | null) {
  return route?.route === "tunnel" || route?.route === "tunnel-fallback";
}

function resolveShareLinkForRoute(
  route: RouteDecision | null,
  state: {
    publicReady: boolean;
    url: string | null;
    localReady: boolean;
    localUrl: string | null;
  },
) {
  if (routeNeedsPublicLink(route)) {
    return state.publicReady && state.url ? state.url : null;
  }
  if (route?.route === "local") {
    return state.localReady && state.localUrl ? state.localUrl : null;
  }
  return state.publicReady && state.url ? state.url : state.localReady && state.localUrl ? state.localUrl : null;
}

function resolvePhaseBadgeVariant(phase: string): "accent" | "success" | "danger" | "neutral" {
  if (phase === "online") return "success";
  if (phase === "failed") return "danger";
  if (phase === "stopped") return "neutral";
  return "accent";
}

export default function SendPage() {
  const { t } = useI18n();
  const [selection, setSelection] = useState<SelectedItem | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [route, setRoute] = useState<RouteDecision | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportPreparationStatus>(IDLE_IMPORT_STATUS);
  const waitingForPublicReadyRef = useRef(false);
  const processingExplorerRequestRef = useRef<number | null>(null);
  const fallbackEnabled = usePreferencesStore((state) => state.tunnelFallbackEnabled);
  const primaryProvider = usePreferencesStore((state) => state.primaryTunnelProvider);
  const fallbackProvider = usePreferencesStore((state) => state.fallbackTunnelProvider);
  const localOnly = usePreferencesStore((state) => state.localOnly);
  const nextExplorerRequest = useExplorerShareStore(
    (state) => state.requests.find((request) => !request.claimed) ?? null,
  );
  const markExplorerRequestClaimed = useExplorerShareStore((state) => state.markClaimed);
  const removeExplorerRequest = useExplorerShareStore((state) => state.remove);
  const { host, url, localUrl, loading, stop, phase, message, publicReady, localReady } = useTunnelStore((state) => ({
    host: state.host,
    url: state.url,
    localUrl: state.localUrl,
    loading: state.loading,
    stop: state.stop,
    phase: state.phase,
    message: state.message,
    publicReady: state.publicReady,
    localReady: state.localReady,
  }));

  useEffect(
    () => () => {
      void selection?.cleanup?.();
    },
    [selection],
  );

  useEffect(() => {
    const nextLink = resolveShareLinkForRoute(route, { publicReady, url, localReady, localUrl });
    setShareLink(nextLink);
  }, [localReady, localUrl, publicReady, route, url]);

  useEffect(() => {
    if (!routeNeedsPublicLink(route)) {
      waitingForPublicReadyRef.current = false;
      return;
    }
    if (publicReady && url && waitingForPublicReadyRef.current) {
      waitingForPublicReadyRef.current = false;
      toast({ message: t("send.toast.linkReady"), variant: "success" });
      return;
    }
    if (phase === "failed" || phase === "stopped") {
      waitingForPublicReadyRef.current = false;
    }
  }, [phase, publicReady, route, t, url]);

  const routeLabel = useMemo(() => {
    if (!route) return null;
    switch (route.route) {
      case "tunnel-fallback":
        return t("route.tunnelFallback");
      case "tunnel":
        return t("route.tunnel");
      case "local":
        return t("route.local");
      case "p2p":
        return t("route.p2p");
      default:
        return route.route;
    }
  }, [route, t]);

  const routeVariant: "accent" | "success" | "neutral" =
    route?.route === "local" ? "success" : route?.route === "p2p" ? "neutral" : "accent";

  const resetSelection = useCallback((next?: SelectedItem | null) => {
    setSelection((prev) => {
      if (prev && prev !== next) {
        void prev.cleanup?.();
      }
      return next ?? null;
    });
    setShareLink(null);
    setRoute(null);
    setShowQr(false);
    setImportStatus(IDLE_IMPORT_STATUS);
  }, []);

  const sharePreparedSelection = useCallback(
    async (item: SelectedItem, decisionOverride?: RouteDecision | null) => {
      const decision =
        decisionOverride ??
        selectTransferRoute({}, { fallbackEnabled, primaryProvider, fallbackProvider, localOnly });
      setRoute(decision);
      if (decision.route === "p2p") {
        toast({ message: t("send.desktopRequired"), variant: "info" });
        return;
      }

      const hostWithProvider = async (provider?: typeof primaryProvider) => {
        const resolved = await resolvePathForHost(item, setImportStatus);
        if (!resolved) {
          throw new Error(t("transfer.hostError"));
        }

        try {
          await host([resolved.path], provider);
          const nextState = useTunnelStore.getState();
          const nextLink = resolveShareLinkForRoute(decision, nextState);
          setShareLink(nextLink);
          if (nextLink) {
            toast({ message: t("send.toast.linkReady"), variant: "success" });
          } else if (routeNeedsPublicLink(decision) && nextState.url) {
            waitingForPublicReadyRef.current = true;
          }

          if (provider === "mock") {
            await resolved.cleanup?.().catch((cleanupError) => {
              console.warn("fluxshare:file", "failed to clean mock-host staged file", cleanupError);
            });
          }
        } catch (error) {
          await resolved.cleanup?.().catch((cleanupError) => {
            console.warn("fluxshare:file", "failed to clean failed-host staged file", cleanupError);
          });
          throw error;
        }
      };

      const providerToUse = decision.route === "local" ? undefined : decision.provider ?? primaryProvider;
      try {
        waitingForPublicReadyRef.current = false;
        await hostWithProvider(providerToUse);
      } catch (error) {
        if (decision.route === "tunnel-fallback" && decision.fallback && decision.fallback !== decision.provider) {
          await hostWithProvider(decision.fallback);
          return;
        }
        throw error;
      }
    },
    [fallbackEnabled, fallbackProvider, host, localOnly, primaryProvider, t],
  );

  async function handleSelectFile() {
    setImportStatus(IDLE_IMPORT_STATUS);
    const item = isTauri() ? await pickTauriFile(setImportStatus) : await pickWebFile();
    if (item) {
      resetSelection(item);
    }
  }

  async function handleSelectFolder() {
    setImportStatus(IDLE_IMPORT_STATUS);
    const item = await pickTauriFolder(t, setImportStatus);
    if (item) {
      resetSelection(item);
    }
  }

  const handleDroppedPaths = useCallback(
    async (paths: string[]) => {
      if (!paths || paths.length === 0) return;
      if (paths.length > 1) {
        toast({ message: t("send.toast.dropMultiple"), variant: "info" });
      }
      setImportStatus(IDLE_IMPORT_STATUS);
      const item = await selectTauriPath(paths[0], t, setImportStatus);
      if (item) {
        resetSelection(item);
      }
    },
    [resetSelection, t],
  );

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      const { appWindow } = await import("@tauri-apps/api/window");
      unlisten = await appWindow.onFileDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "hover") {
          setIsDragActive(true);
          return;
        }
        if (payload.type === "drop") {
          setIsDragActive(false);
          void handleDroppedPaths(payload.paths);
          return;
        }
        setIsDragActive(false);
      });
    };
    void setup();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleDroppedPaths]);

  async function handleShare() {
    if (!selection) {
      toast({ message: t("send.noSelection"), variant: "info" });
      return;
    }
    try {
      setIsSending(true);
      await sharePreparedSelection(selection);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      toast({ message: nextMessage || t("send.toast.failed"), variant: "error" });
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    if (!nextExplorerRequest) {
      return;
    }
    if (processingExplorerRequestRef.current === nextExplorerRequest.id) {
      return;
    }

    markExplorerRequestClaimed(nextExplorerRequest.id);
    processingExplorerRequestRef.current = nextExplorerRequest.id;

    const processRequest = async () => {
      try {
        setIsSending(true);
        if (nextExplorerRequest.paths.length > 1) {
          toast({ message: t("send.toast.dropMultiple"), variant: "info" });
        }

        if (phase !== "stopped" || shareLink || selection) {
          await stop(false);
        }
        resetSelection(null);

        const targetPath = nextExplorerRequest.paths[0];
        if (!targetPath) {
          throw new Error(t("send.toast.failed"));
        }

        const item = await selectTauriPath(targetPath, t, setImportStatus);
        if (!item) {
          throw new Error(t("send.toast.failed"));
        }

        resetSelection(item);
        await sharePreparedSelection(item);
      } catch (error) {
        const nextMessage = error instanceof Error ? error.message : String(error);
        toast({ message: nextMessage || t("send.toast.failed"), variant: "error" });
      } finally {
        removeExplorerRequest(nextExplorerRequest.id);
        processingExplorerRequestRef.current = null;
        setIsSending(false);
      }
    };

    void processRequest();
  }, [
    markExplorerRequestClaimed,
    nextExplorerRequest,
    phase,
    removeExplorerRequest,
    resetSelection,
    selection,
    shareLink,
    sharePreparedSelection,
    stop,
    t,
  ]);

  async function handleStopSharing() {
    try {
      await stop(true);
      resetSelection(null);
      toast({ message: t("send.toast.stopped"), variant: "success" });
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      toast({ message: nextMessage || t("send.toast.stopFailed"), variant: "error" });
    }
  }

  async function handleCopyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard?.writeText?.(shareLink);
      toast({ message: t("send.toast.copied"), variant: "success" });
    } catch {
      toast({ message: t("send.toast.copyManual"), variant: "info" });
    }
  }

  const showFolderButton = isTauri();
  const hasActiveShare = phase !== "stopped" || Boolean(shareLink);
  const dropZoneClass = cn(
    "relative flex min-h-[22rem] flex-col justify-between overflow-hidden rounded-[calc(var(--radius-xl)+0.2rem)] border border-dashed bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] p-6 transition duration-150 ease-out",
    isDragActive
      ? "border-[color-mix(in_srgb,var(--primary)_72%,var(--border)_28%)] shadow-[var(--shadow-accent)]"
      : "border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)]",
  );

  const linkDescription = shareLink
    ? shareLink
    : loading || phase !== "stopped"
      ? message ?? formatPhaseLabel(phase)
      : t("send.selectPrompt");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <span className="fs-kicker">{t("nav.send")}</span>
        <h1 className="fs-page-title">{t("send.title")}</h1>
        <p className="fs-page-subtitle">{t("send.subtitle")}</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_22rem]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color-mix(in_srgb,var(--border)_76%,transparent)] px-6 py-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                {selection ? t("send.selectedItem") : t("send.title")}
              </p>
              <div className="space-y-1">
                <h2 className="text-[1.65rem] font-semibold tracking-[-0.04em] text-[var(--text)]">
                  {selection ? selection.name : t("send.selectPrompt")}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  {selection
                    ? `${t(selection.kind === "folder" ? "send.type.folder" : "send.type.file")} · ${formatBytes(selection.size)}`
                    : t("send.subtitle")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {routeLabel ? <Badge variant={routeVariant}>{routeLabel}</Badge> : null}
              {selection ? (
                <Button variant="ghost" onClick={() => resetSelection(null)}>
                  {t("send.reset")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="p-6">
            <div className={dropZoneClass}>
              <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_9%,transparent),transparent)]" />
              {selection ? (
                <div className="relative flex h-full flex-col justify-between gap-6">
                  <div className="space-y-4">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--primary)_24%,var(--border)_76%)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--text)]">
                      {selection.kind === "folder" ? <FolderGlyph /> : <FileGlyph />}
                    </div>
                    <div className="space-y-2">
                      <p className="text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        {t("send.selectedItem")}
                      </p>
                      <p className="max-w-3xl text-2xl font-semibold tracking-[-0.04em] text-[var(--text)]">
                        {selection.name}
                      </p>
                    </div>
                  </div>

                  <div className="fs-metric-grid">
                    <div className="fs-metric">
                      <p className="fs-metric__label">{t("send.type.file")}</p>
                      <p className="fs-metric__value">
                        {t(selection.kind === "folder" ? "send.type.folder" : "send.type.file")}
                      </p>
                    </div>
                    <div className="fs-metric">
                      <p className="fs-metric__label">{t("send.size")}</p>
                      <p className="fs-metric__value">{formatBytes(selection.size)}</p>
                    </div>
                    <div className="fs-metric">
                      <p className="fs-metric__label">{t("send.route")}</p>
                      <p className="fs-metric__value">{routeLabel ?? t("send.start")}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative flex h-full flex-col items-center justify-center gap-5 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--primary)_20%,var(--border)_80%)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--text)]">
                    <UploadGlyph className="h-7 w-7" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-[1.55rem] font-semibold tracking-[-0.04em] text-[var(--text)]">
                      {t("send.selectPrompt")}
                    </p>
                    <p className="mx-auto max-w-xl text-sm leading-7 text-[var(--muted)]">
                      {t("send.subtitle")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-4 border-t border-[color-mix(in_srgb,var(--border)_76%,transparent)] pt-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={handleSelectFile}>
                  {t("send.pickFile")}
                </Button>
                {showFolderButton ? (
                  <Button size="lg" variant="secondary" onClick={handleSelectFolder}>
                    {t("send.pickFolder")}
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={handleShare} disabled={!selection || isSending || loading || hasActiveShare}>
                  {isSending ? t("send.starting") : t("send.start")}
                </Button>
                {hasActiveShare ? (
                  <Button size="lg" variant="danger" onClick={handleStopSharing} disabled={loading}>
                    {t("send.stop")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card tone="muted" className="min-w-0 space-y-4 p-5">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                {t("send.linkLabel")}
              </p>
              {shareLink ? (
                <UrlText url={shareLink} className="text-lg font-semibold tracking-[-0.03em] text-[var(--text)]" />
              ) : (
                <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--text)]">{linkDescription}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={resolvePhaseBadgeVariant(phase)}>{formatPhaseLabel(phase)}</Badge>
              {routeLabel ? <Badge variant={routeVariant}>{routeLabel}</Badge> : null}
            </div>

            <p className="text-sm leading-6 text-[var(--muted)]">
              {message ??
                (shareLink
                  ? t("send.toast.linkReady")
                  : selection
                    ? t("send.starting")
                    : t("send.selectPrompt"))}
            </p>

            {shareLink ? (
              <div className="space-y-3">
                <UrlField url={shareLink} valueClassName="text-sm" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={handleCopyLink}>
                    {t("send.copy")}
                  </Button>
                  <Button variant="outline" onClick={() => window.open(shareLink, "_blank", "noopener,noreferrer")}>
                    {t("send.open")}
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => setShowQr((prev) => !prev)} className="w-full">
                  {t("send.generateQr")}
                </Button>
              </div>
            ) : (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_78%,transparent)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">
                {selection ? t("send.start") : t("send.selectPrompt")}
              </div>
            )}
          </Card>

          <ImportPreparationPanel status={importStatus} />

          {(loading || (phase !== "stopped" && !shareLink)) && !importStatus.active ? (
            <Card tone="muted" className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--text)]">{routeLabel ?? t("send.starting")}</p>
                <Badge variant={resolvePhaseBadgeVariant(phase)}>{formatPhaseLabel(phase)}</Badge>
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">{message ?? t("send.starting")}</p>
            </Card>
          ) : null}

          {showQr && shareLink ? (
            <Card tone="solid" className="space-y-4 p-5">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--text)]">{t("send.qrTitle")}</p>
                <p className="text-sm text-[var(--muted)]">{t("send.linkLabel")}</p>
              </div>
              <div className="flex justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-white p-4">
                <QRCode value={shareLink} size={176} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
