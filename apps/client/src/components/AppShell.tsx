import { useCallback, useEffect, useMemo, type ReactNode, useState } from "react";
import { open } from "@tauri-apps/api/shell";
import { Link, useLocation } from "react-router-dom";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "../utils/cn";
import { useRoom } from "../state/useRoomStore";
import { usePreferencesStore, type AppLanguage } from "../state/usePreferencesStore";
import { useUpdateStore } from "../state/useUpdateStore";
import { useI18n } from "../i18n/LanguageProvider";

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
        // ignore
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
      setCompactMode(width < 960);
    };
    syncWindow();
    window.addEventListener("resize", syncWindow, { passive: true });
    return () => window.removeEventListener("resize", syncWindow);
  }, [setCompactMode, setWindowSize]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.compact = compactMode ? "true" : "false";
  }, [compactMode]);

  return (
    <div className="app-shell app-shell--animated">
      <div className="app-shell__background" />
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 90%,var(--bg) 10%)] backdrop-blur">
        <div
          className={cn(
            "mx-auto flex w-full flex-wrap items-center justify-between gap-4",
            compactMode ? "max-w-5xl px-4 py-3" : "max-w-6xl px-6 py-4",
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xl font-semibold tracking-tight text-[var(--text)]">
              {t("app.name")}
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
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
                    "relative rounded-lg px-3 py-2 transition duration-200 ease-out hover:scale-[1.02] hover:shadow-[0_10px_30px_-20px_var(--ring)]",
                    isActive
                      ? "bg-[var(--surface-2)] text-[var(--text)] shadow-[0_15px_40px_-25px_var(--ring)] after:absolute after:bottom-1 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-[var(--primary)]"
                      : "hover:bg-[color-mix(in srgb,var(--surface) 80%,transparent)]",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            {updateInfo?.hasUpdate ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[color-mix(in srgb,var(--primary) 55%,var(--border) 45%)] bg-[color-mix(in srgb,var(--surface-2) 82%,transparent)] px-3 py-2 shadow-[0_20px_45px_-24px_var(--ring)]">
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {t("header.updateTitle")}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text)]">v{updateInfo.latestVersion}</span>
                </div>
                <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={handleOpenRelease}>
                  {t("header.viewRelease")}
                </Button>
              </div>
            ) : isCheckingUpdate && !updateInfo ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 80%,transparent)] px-3 py-2 text-xs text-[var(--muted)]">
                {t("header.checkingUpdate")}
              </div>
            ) : null}
            <Card
              noShadow
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2"
            >
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  {t("header.room")}
                </span>
                <span className="font-mono text-sm text-[var(--text)]">{roomLabel}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!roomId && !lastInviteUrl}
                onClick={handleCopy}
                className="min-w-[88px] justify-center"
              >
                {t("header.copyInvite")}
              </Button>
            </Card>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                {t("header.language")}
              </span>
              <select
                aria-label={t("header.language")}
                value={language}
                onChange={(event) => setLanguage(event.target.value as AppLanguage)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              >
                <option value="en">EN</option>
                <option value="pt">PT</option>
              </select>
            </div>
          </div>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full text-[var(--text)] bg-[var(--bg)]",
          compactMode ? "max-w-5xl px-4 pb-12 pt-8" : "max-w-6xl px-6 pb-16 pt-10",
        )}
      >
        {children}
      </main>
    </div>
  );
}

export default AppShell;
