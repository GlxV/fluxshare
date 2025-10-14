import { useMemo, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "./ThemeProvider";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "../utils/cn";

export interface AppHeaderInfo {
  roomCode?: string;
  inviteUrl?: string;
  onCopyInvite?: () => void;
}

interface AppShellProps {
  children: ReactNode;
  headerInfo?: AppHeaderInfo;
}

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

const navItems = [
  { to: "/", label: "Início" },
  { to: "/tunnel", label: "Tunnel" },
];

export function AppShell({ children, headerInfo }: AppShellProps) {
  const { theme, toggleTheme } = useTheme();

  const roomLabel = useMemo(() => {
    if (!headerInfo?.roomCode) return "Nenhuma sala";
    return headerInfo.roomCode;
  }, [headerInfo?.roomCode]);

  const handleCopy = () => {
    if (headerInfo?.onCopyInvite) {
      headerInfo.onCopyInvite();
      return;
    }
    if (headerInfo?.inviteUrl && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(headerInfo.inviteUrl).catch(() => undefined);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-shell__background">
        <div className="app-shell__gradient" />
        <div className="app-shell__mesh" />
        <div className="app-shell__grid" />
      </div>
      <header className="sticky top-0 z-40 border-b border-[var(--card-border)]/60 bg-[var(--card)]/70 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xl font-semibold tracking-tight text-[var(--text)]">
              FluxShare
            </span>
            <span className="text-sm text-[var(--text-muted)]">
              Compartilhamento P2P em tempo real
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Card
              noShadow
              className="flex items-center gap-3 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/90 px-4 py-2"
            >
              <div className="flex flex-col">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Sala
                </span>
                <span className="font-mono text-sm text-[var(--text)]">{roomLabel}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!headerInfo?.inviteUrl && !headerInfo?.onCopyInvite}
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
              className="h-10 w-10 rounded-full border border-[var(--card-border)]/70 bg-[var(--card)]/80 p-0"
            >
              {theme === "dark" ? (
                <SunIcon className="h-5 w-5" />
              ) : (
                <MoonIcon className="h-5 w-5" />
              )}
            </Button>
          </div>
          <nav className="flex w-full items-center gap-2 sm:w-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-full border border-transparent px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition", 
                    "hover:text-[var(--text)]",
                    isActive
                      ? "border-[var(--card-border)]/80 bg-[var(--card)]/80 text-[var(--text)]"
                      : "bg-transparent",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className={cn("mx-auto w-full max-w-6xl px-6 pb-16 pt-10", "text-[var(--text)]")}>{children}</main>
    </div>
  );
}

export default AppShell;
