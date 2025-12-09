import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { useI18n } from "../i18n/LanguageProvider";
import { pickTauriFile, pickTauriFolder, pickWebFile, type SelectedItem } from "../lib/transfer/selectFile";
import { selectTransferRoute, type RouteDecision } from "../lib/transfer/route";
import { usePreferencesStore } from "../state/usePreferencesStore";
import { useTunnelStore } from "../state/useTunnelStore";
import { toast } from "../store/useToast";
import { isTauri } from "../lib/persist/tauri";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "--";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[exponent]}`;
}

async function resolvePathForHost(item: SelectedItem): Promise<string | null> {
  if (item.source === "tauri" || item.source === "tauri-folder") {
    return item.path ?? null;
  }
  if (item.source === "web" && item.file) {
    const [{ appCacheDir, join }, { createDir, writeBinaryFile }] = await Promise.all([
      import("@tauri-apps/api/path"),
      import("@tauri-apps/api/fs"),
    ]);
    const cacheDir = await appCacheDir();
    const folder = await join(cacheDir, `fluxshare-host-${Date.now()}`);
    await createDir(folder, { recursive: true });
    const filename = item.name || `arquivo-${Date.now()}`;
    const destination = await join(folder, filename);
    const buffer = new Uint8Array(await item.file.arrayBuffer());
    await writeBinaryFile({ path: destination, contents: buffer });
    return destination;
  }
  return null;
}

export default function SendPage() {
  const { t } = useI18n();
  const [selection, setSelection] = useState<SelectedItem | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [route, setRoute] = useState<RouteDecision | null>(null);
  const [showQr, setShowQr] = useState(false);
  const fallbackEnabled = usePreferencesStore((state) => state.tunnelFallbackEnabled);
  const primaryProvider = usePreferencesStore((state) => state.primaryTunnelProvider);
  const fallbackProvider = usePreferencesStore((state) => state.fallbackTunnelProvider);
  const localOnly = usePreferencesStore((state) => state.localOnly);
  const { host, url, localUrl, loading } = useTunnelStore((state) => ({
    host: state.host,
    url: state.url,
    localUrl: state.localUrl,
    loading: state.loading,
  }));

  useEffect(
    () => () => {
      void selection?.cleanup?.();
    },
    [selection],
  );

  useEffect(() => {
    if (url || localUrl) {
      setShareLink(url ?? localUrl ?? null);
    }
  }, [localUrl, url]);

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

  function resetSelection(next?: SelectedItem | null) {
    if (selection && selection !== next) {
      void selection.cleanup?.();
    }
    setSelection(next ?? null);
    setShareLink(null);
    setRoute(null);
    setShowQr(false);
  }

  async function handleSelectFile() {
    const item = isTauri() ? await pickTauriFile() : await pickWebFile();
    if (item) {
      resetSelection(item);
    }
  }

  async function handleSelectFolder() {
    const item = await pickTauriFolder(t);
    if (item) {
      resetSelection(item);
    }
  }

  async function handleShare() {
    if (!selection) {
      toast({ message: t("send.noSelection"), variant: "info" });
      return;
    }
    const decision = selectTransferRoute(
      {},
      { fallbackEnabled, primaryProvider, fallbackProvider, localOnly },
    );
    setRoute(decision);
    if (decision.route === "p2p") {
      toast({ message: t("send.desktopRequired"), variant: "info" });
      return;
    }
    try {
      setIsSending(true);
      const hostPath = await resolvePathForHost(selection);
      if (!hostPath) {
        throw new Error(t("transfer.hostError"));
      }
      const providerToUse =
        decision.route === "local" ? fallbackProvider : decision.provider ?? primaryProvider;
      await host([hostPath], providerToUse);
      const nextLink = useTunnelStore.getState().url ?? useTunnelStore.getState().localUrl ?? null;
      setShareLink(nextLink);
      toast({ message: t("send.toast.linkReady"), variant: "success" });
    } catch (error) {
      if (decision.route === "tunnel-fallback" && decision.fallback && decision.fallback !== decision.provider) {
        try {
          const path = await resolvePathForHost(selection);
          if (!path) {
            throw new Error(t("transfer.hostError"));
          }
          await host([path], decision.fallback);
          const nextLink = useTunnelStore.getState().url ?? useTunnelStore.getState().localUrl ?? null;
          setShareLink(nextLink);
          toast({ message: t("send.toast.linkReady"), variant: "success" });
          setIsSending(false);
          return;
        } catch {
          // fallthrough to error handler
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      toast({ message: message || t("send.toast.failed"), variant: "error" });
    } finally {
      setIsSending(false);
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-[var(--text)]">{t("send.title")}</h1>
        <p className="text-sm text-[var(--muted)]">{t("send.subtitle")}</p>
      </div>

      <Card className="space-y-5 p-6">
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 80%,transparent)] p-5">
          {selection ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {t("send.selectedItem")}
                </p>
                <p className="text-lg font-semibold text-[var(--text)]">{selection.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {t(selection.kind === "folder" ? "send.type.folder" : "send.type.file")} ·{" "}
                  {formatBytes(selection.size)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {routeLabel ? <Badge variant={routeVariant}>{routeLabel}</Badge> : null}
                <Button variant="ghost" onClick={() => resetSelection(null)}>
                  {t("send.reset")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--muted)]">{t("send.selectPrompt")}</div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSelectFile}>{t("send.pickFile")}</Button>
          {showFolderButton ? (
            <Button variant="secondary" onClick={handleSelectFolder}>
              {t("send.pickFolder")}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleShare} disabled={!selection || isSending || loading}>
            {isSending ? t("send.starting") : t("send.start")}
          </Button>
          {routeLabel ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <span className="font-semibold text-[var(--text)]">{t("send.selectedRoute")}:</span>
              <Badge variant={routeVariant}>{routeLabel}</Badge>
            </div>
          ) : null}
        </div>

        {shareLink ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {t("send.linkLabel")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={shareLink}
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
                />
                <Button variant="ghost" onClick={handleCopyLink}>
                  {t("send.copy")}
                </Button>
                <Button variant="outline" onClick={() => window.open(shareLink, "_blank", "noopener,noreferrer")}>
                  {t("send.open")}
                </Button>
                <Button variant="secondary" onClick={() => setShowQr((prev) => !prev)}>
                  {t("send.generateQr")}
                </Button>
              </div>
            </div>
            {showQr ? (
              <div className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-sm font-medium text-[var(--text)]">{t("send.qrTitle")}</p>
                <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                  <QRCode value={shareLink} size={168} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
