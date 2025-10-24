import { useCallback, useMemo, type ReactNode, useState } from "react";
import { useTheme } from "./ThemeProvider";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "../utils/cn";
import { useRoom } from "../state/useRoomStore";

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
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

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

  return (
    <div className="app-shell">
      <div className="app-shell__background">
        <div className="app-shell__gradient" />
        <div className="app-shell__mesh" />
        <div className="app-shell__grid" />
      </div>
      <header className="sticky top-0 z-40 border-b border-[var(--border)]/60 bg-[var(--card)]/80 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xl font-semibold tracking-tight text-[var(--text)]">
              FluxShare
            </span>
            <span className="text-sm text-[var(--muted)]">
              Compartilhamento P2P em tempo real
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Card
              noShadow
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)]/70 bg-[var(--card)]/90 px-4 py-2"
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
              className="h-10 w-10 rounded-full border border-[var(--border)]/70 bg-[var(--card)]/80 p-0"
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
      <main className={cn("mx-auto w-full max-w-6xl px-6 pb-16 pt-10", "text-[var(--text)]")}>{children}</main>
    </div>
  );
}

export default AppShell;
