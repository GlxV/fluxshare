import { useCallback, useEffect, useMemo, type ReactNode, useState } from "react";
import { open } from "@tauri-apps/api/shell";
import { Link, useLocation } from "react-router-dom";
import { Button } from "./ui/Button";
import { FluxShareMark } from "./branding/FluxShareMarks";
import { cn } from "../utils/cn";
import { useRoom } from "../state/useRoomStore";
import { usePreferencesStore, type AppLanguage } from "../state/usePreferencesStore";
import { useUpdateStore } from "../state/useUpdateStore";
import { useI18n } from "../i18n/LanguageProvider";

function buildTopbarStatusTone(hasUpdate: boolean, checking: boolean) {
  if (hasUpdate) {
    return "text-[var(--primary)]";
  }
  if (checking) {
    return "text-[var(--muted)]";
  }
  return "text-[var(--success)]";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { language, setLanguage, t } = useI18n();
  const { roomId, copyInviteLink } = useRoom();
  const compactMode = usePreferencesStore((state) => state.compactMode);
  const setLastTab = usePreferencesStore((state) => state.setLastTab);
  const setWindowSize = usePreferencesStore((state) => state.setWindowSize);
  const setCompactMode = usePreferencesStore((state) => state.setCompactMode);
  const updateInfo = useUpdateStore((state) => state.updateInfo);
  const isCheckingUpdate = useUpdateStore((state) => state.isChecking);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const location = useLocation();

  const links = useMemo(() => {
    const roomPath = roomId ? `/p2p/${roomId}` : "/p2p";
    return [
      { to: "/", label: t("nav.send") },
      { to: roomPath, label: t("nav.p2p") },
      { to: "/config", label: t("nav.config") },
    ];
  }, [roomId, t]);

  const roomLabel = useMemo(() => {
    if (roomId) return roomId;
    if (lastInviteUrl) {
      const match = /\/room\/([A-Za-z0-9-]+)/.exec(lastInviteUrl);
      if (match) return match[1];
    }
    return t("header.noRoom");
  }, [lastInviteUrl, roomId, t]);

  const handleCopy = useCallback(async () => {
    const result = await copyInviteLink();
    if (result.url) {
      setLastInviteUrl(result.url);
    }
    if (!result.copied && result.url && typeof window !== "undefined") {
      try {
        await navigator.clipboard?.writeText?.(result.url);
      } catch {
        // ignore clipboard fallback
      }
    }
  }, [copyInviteLink]);

  const handleOpenRelease = useCallback(async () => {
    if (!updateInfo?.releaseUrl) return;
    try {
      await open(updateInfo.releaseUrl);
    } catch {
      if (typeof window !== "undefined") {
        window.open(updateInfo.releaseUrl, "_blank", "noopener,noreferrer");
      }
    }
  }, [updateInfo?.releaseUrl]);

  useEffect(() => {
    setLastTab(location.pathname);
  }, [location.pathname, setLastTab]);

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncWindow = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindowSize({ width, height });
      setCompactMode(width < 1040);
    };
    syncWindow();
    window.addEventListener("resize", syncWindow, { passive: true });
    return () => window.removeEventListener("resize", syncWindow);
  }, [setCompactMode, setWindowSize]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.compact = compactMode ? "true" : "false";
  }, [compactMode]);

  const statusTone = buildTopbarStatusTone(Boolean(updateInfo?.hasUpdate), isCheckingUpdate && !updateInfo);

  return (
    <div className="app-shell app-shell--animated">
      <div className="app-shell__background" />
      <header className="sticky top-0 z-40 border-b border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--bg)_76%,transparent)] backdrop-blur-xl">
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-4",
            compactMode ? "max-w-5xl px-4 py-4" : "max-w-7xl px-6 py-5",
          )}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-center">
              <Link
                to="/"
                className="flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--panel-muted)_32%,var(--border)_68%)] bg-[color-mix(in_srgb,var(--panel-bg)_72%,transparent)] px-3 py-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[calc(var(--radius-md)-2px)] border border-[color-mix(in_srgb,var(--primary)_20%,var(--border)_80%)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_12%,transparent),color-mix(in_srgb,var(--surface-3)_86%,transparent))] text-[var(--text)]">
                  <FluxShareMark className="h-[1.1rem] w-[1.1rem]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[1.02rem] font-semibold tracking-[-0.03em] text-[var(--text)]">
                    {t("app.name")}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">{t("header.tagline")}</span>
                </span>
              </Link>

              <nav className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--panel-muted)_32%,var(--border)_68%)] bg-[color-mix(in_srgb,var(--panel-bg)_68%,transparent)] p-1.5">
                {links.map((link) => {
                  const isActive =
                    location.pathname === link.to ||
                    (link.to.startsWith("/p2p") &&
                      (location.pathname.startsWith("/p2p") || location.pathname.startsWith("/room"))) ||
                    (link.to === "/" && location.pathname === "/");
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={cn(
                        "rounded-[var(--radius-md)] px-3.5 py-2 text-sm font-medium tracking-[-0.01em] transition duration-150 ease-out",
                        isActive
                          ? "bg-[color-mix(in_srgb,var(--panel-strong)_90%,transparent)] text-[var(--text)] shadow-[var(--shadow-soft)]"
                          : "text-[var(--muted-strong)] hover:bg-[color-mix(in_srgb,var(--panel-muted)_82%,transparent)] hover:text-[var(--text)]",
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-bg)_78%,transparent)] px-3 py-2 text-xs text-[var(--muted)]">
                <span className={cn("fs-status-dot", statusTone)} />
                <span className="font-medium">
                  {updateInfo?.hasUpdate
                    ? `${t("header.updateTitle")} v${updateInfo.latestVersion}`
                    : isCheckingUpdate && !updateInfo
                      ? t("header.checkingUpdate")
                      : t("header.ready")}
                </span>
                {updateInfo?.hasUpdate ? (
                  <Button size="sm" variant="ghost" onClick={handleOpenRelease} className="h-7 px-2.5 text-[0.68rem]">
                    {t("header.viewRelease")}
                  </Button>
                ) : null}
              </div>

              <div className="flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-bg)_78%,transparent)] px-3 py-2 text-xs text-[var(--muted)]">
                <span>{t("header.room")}</span>
                <span className="max-w-[8rem] truncate font-mono text-[0.76rem] text-[var(--text)]">{roomLabel}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!roomId && !lastInviteUrl}
                  onClick={handleCopy}
                  className="h-7 px-2.5 text-[0.68rem]"
                >
                  {t("header.copyInvite")}
                </Button>
              </div>

              <label className="flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-bg)_78%,transparent)] px-3 py-2 text-xs text-[var(--muted)]">
                <span>{t("header.language")}</span>
                <select
                  aria-label={t("header.language")}
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as AppLanguage)}
                  className="min-w-[4.2rem] border-none bg-transparent px-0 py-0 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text)] focus-visible:outline-none"
                >
                  <option value="en">EN</option>
                  <option value="pt">PT</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full text-[var(--text)]",
          compactMode ? "max-w-5xl px-4 pb-12 pt-8" : "max-w-7xl px-6 pb-16 pt-10",
        )}
      >
        {children}
      </main>
    </div>
  );
}

export default AppShell;
