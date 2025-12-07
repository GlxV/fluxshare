import { useCallback, useEffect, useMemo, type ReactNode, useState } from "react";
import { open } from "@tauri-apps/api/shell";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "./ThemeProvider";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "../utils/cn";
import { useRoom } from "../state/useRoomStore";
import { usePreferencesStore } from "../state/usePreferencesStore";
import { useUpdateStore } from "../state/useUpdateStore";

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5V3m0 18v-2m7-7h2M3 12h2m13.364 6.364 1.414 1.414M4.222 4.222l1.414 1.414m0 12.728L4.222 19.778m15.556-15.556-1.414 1.414M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
      />
    </svg>
  );
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
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
    const roomPath = roomId ? `/room/${roomId}` : "/room";
    return [
      { to: "/", label: "Início" },
      { to: roomPath, label: "Sala" },
      { to: "/tunnel", label: "Tunnel" },
      { to: "/admin", label: "Admin" },
    ];
  }, [roomId]);

  const roomLabel = useMemo(() => {
    if (roomId) return roomId;
    if (lastInviteUrl) {
      const match = /\/room\/([A-Za-z0-9-]+)/.exec(lastInviteUrl);
      if (match) return match[1];
    }
    return "Nenhuma sala";
  }, [lastInviteUrl, roomId]);

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
              FluxShare
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            {links.map((link) => {
              const isActive =
                location.pathname === link.to || (link.to.startsWith("/room/") && location.pathname.startsWith("/room"));
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
                    Atualização
                  </span>
                  <span className="text-sm font-semibold text-[var(--text)]">v{updateInfo.latestVersion}</span>
                </div>
                <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={handleOpenRelease}>
                  Ver no GitHub
                </Button>
              </div>
            ) : isCheckingUpdate && !updateInfo ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 80%,transparent)] px-3 py-2 text-xs text-[var(--muted)]">
                Verificando atualizações...
              </div>
            ) : null}
            <Card
              noShadow
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2"
            >
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Sala
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
                Copiar link
              </Button>
            </Card>
            <Button
              variant="ghost"
              size="sm"
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              onClick={toggleTheme}
              className="h-10 w-10 rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-0"
            >
              {theme === "dark" ? (
                <SunIcon className="h-5 w-5" />
              ) : (
                <MoonIcon className="h-5 w-5" />
              )}
            </Button>
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
