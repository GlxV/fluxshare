 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/apps/client/src/App.tsx b/apps/client/src/App.tsx
index c1e3e742dd0944efc1d048be4509f63493935cae..ef4f9c3a1f2a79a576d669282aa81c348aa69bc0 100644
--- a/apps/client/src/App.tsx
+++ b/apps/client/src/App.tsx
@@ -1,20 +1,25 @@
 import { type Dispatch, type SetStateAction, useState } from "react";
 import { Outlet } from "react-router-dom";
-import AppShell, { type AppHeaderInfo } from "./components/AppShell";
+import AppShell from "./components/AppShell";
 import { ThemeProvider } from "./components/ThemeProvider";
 
+export interface AppHeaderInfo {
+  roomCode?: string;
+  inviteUrl?: string;
+}
+
 export interface AppOutletContext {
   setHeaderInfo: Dispatch<SetStateAction<AppHeaderInfo>>;
 }
 
 export default function App() {
-  const [headerInfo, setHeaderInfo] = useState<AppHeaderInfo>({});
+  const [, setHeaderInfo] = useState<AppHeaderInfo>({});
 
   return (
     <ThemeProvider>
-      <AppShell headerInfo={headerInfo}>
+      <AppShell>
         <Outlet context={{ setHeaderInfo }} />
       </AppShell>
     </ThemeProvider>
   );
 }
diff --git a/apps/client/src/components/AppShell.tsx b/apps/client/src/components/AppShell.tsx
index e3d8893409c1ca22236f6b51cdc72e6564e52fc0..2505325c0b4089e779a4aaa67765e2379273924a 100644
--- a/apps/client/src/components/AppShell.tsx
+++ b/apps/client/src/components/AppShell.tsx
@@ -1,127 +1,125 @@
-import { useMemo, type ReactNode } from "react";
+import { useCallback, useMemo, type ReactNode, useState } from "react";
 import { useTheme } from "./ThemeProvider";
 import { Button } from "./ui/Button";
 import { Card } from "./ui/Card";
 import { cn } from "../utils/cn";
-
-export interface AppHeaderInfo {
-  roomCode?: string;
-  inviteUrl?: string;
-  onCopyInvite?: () => void;
-}
-
-interface AppShellProps {
-  children: ReactNode;
-  headerInfo?: AppHeaderInfo;
-}
+import { useRoom } from "../state/useRoomStore";
 
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
 
-export function AppShell({ children, headerInfo }: AppShellProps) {
+export function AppShell({ children }: { children: ReactNode }) {
   const { theme, toggleTheme } = useTheme();
+  const { roomId, copyInviteLink } = useRoom();
+  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
 
   const roomLabel = useMemo(() => {
-    if (!headerInfo?.roomCode) return "Nenhuma sala";
-    return headerInfo.roomCode;
-  }, [headerInfo?.roomCode]);
+    if (roomId) return roomId;
+    if (lastInviteUrl) {
+      const match = /\/room\/([A-Za-z0-9-]+)/.exec(lastInviteUrl);
+      if (match) return match[1];
+    }
+    return "Nenhuma sala";
+  }, [lastInviteUrl, roomId]);
 
-  const handleCopy = () => {
-    if (headerInfo?.onCopyInvite) {
-      headerInfo.onCopyInvite();
-      return;
+  const handleCopy = useCallback(async () => {
+    const result = await copyInviteLink();
+    if (result.url) {
+      setLastInviteUrl(result.url);
     }
-    if (headerInfo?.inviteUrl && typeof navigator !== "undefined" && navigator.clipboard) {
-      navigator.clipboard.writeText(headerInfo.inviteUrl).catch(() => undefined);
+    if (!result.copied && result.url && typeof window !== "undefined") {
+      try {
+        await navigator.clipboard?.writeText?.(result.url);
+      } catch {
+        // ignore
+      }
     }
-  };
+  }, [copyInviteLink]);
 
   return (
     <div className="app-shell">
       <div className="app-shell__background">
         <div className="app-shell__gradient" />
         <div className="app-shell__mesh" />
         <div className="app-shell__grid" />
       </div>
-      <header
-        className="sticky top-0 z-40 border-b border-[var(--card-border)]/60 bg-[var(--card)]/80 backdrop-blur-2xl"
-      >
+      <header className="sticky top-0 z-40 border-b border-[var(--border)]/60 bg-[var(--card)]/80 backdrop-blur-2xl">
         <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
           <div className="flex flex-wrap items-center gap-3">
             <span className="text-xl font-semibold tracking-tight text-[var(--text)]">
               FluxShare
             </span>
-            <span className="text-sm text-[var(--text-muted)]">
+            <span className="text-sm text-[var(--muted)]">
               Compartilhamento P2P em tempo real
             </span>
           </div>
           <div className="flex flex-wrap items-center gap-3">
             <Card
               noShadow
-              className="flex items-center gap-3 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/90 px-4 py-2"
+              className="flex items-center gap-3 rounded-2xl border border-[var(--border)]/70 bg-[var(--card)]/90 px-4 py-2"
             >
               <div className="flex flex-col">
-                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
+                <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                   Sala
                 </span>
                 <span className="font-mono text-sm text-[var(--text)]">{roomLabel}</span>
               </div>
               <Button
                 variant="ghost"
                 size="sm"
-                disabled={!headerInfo?.inviteUrl && !headerInfo?.onCopyInvite}
+                disabled={!roomId && !lastInviteUrl}
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
-              className="h-10 w-10 rounded-full border border-[var(--card-border)]/70 bg-[var(--card)]/80 p-0"
+              className="h-10 w-10 rounded-full border border-[var(--border)]/70 bg-[var(--card)]/80 p-0"
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
diff --git a/apps/client/src/components/PeersPanel.tsx b/apps/client/src/components/PeersPanel.tsx
index ce652a1fd47369a5ee95c68b2135f3c077721ac1..7aaefa44772a641d10a4906311867d0d4aa4d7ed 100644
--- a/apps/client/src/components/PeersPanel.tsx
+++ b/apps/client/src/components/PeersPanel.tsx
@@ -1,115 +1,164 @@
-import { usePeersStore } from "../store/usePeers";
-import { useTransfersStore } from "../store/useTransfers";
 import { Badge, type BadgeProps } from "./ui/Badge";
 import { Button } from "./ui/Button";
 import { Card } from "./ui/Card";
 
-interface PeersPanelProps {
-  selfPeerId: string;
-  onConnect: (peerId: string) => void;
-  onDisconnect: (peerId: string) => void;
-  onSend: (peerId: string) => void;
-  onCancel: (peerId: string) => void;
+export interface PeerTransferInfo {
+  status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
+  direction: "send" | "receive";
+  bytesTransferred: number;
+  totalBytes: number;
+  updatedAt: number;
 }
 
-function resolvePeerStatus(
-  status: string,
-  transferStatus: string | null,
-): { label: string; variant: BadgeProps["variant"] } {
-  if (transferStatus === "transferring") {
-    return { label: "TRANSFERRING", variant: "accent" };
-  }
-  if (transferStatus === "completed") {
-    return { label: "DONE", variant: "success" };
-  }
-  if (transferStatus === "paused") {
-    return { label: "PAUSED", variant: "accentSecondary" };
-  }
-  if (transferStatus === "cancelled" || transferStatus === "error") {
-    return { label: "DISCONNECTED", variant: "danger" };
-  }
-  if (status === "connecting") {
-    return { label: "CONNECTING", variant: "accentSecondary" };
-  }
-  if (status === "connected") {
-    return { label: "CONNECTED", variant: "success" };
-  }
-  if (status === "failed") {
-    return { label: "DISCONNECTED", variant: "danger" };
-  }
-  return { label: "DISCONNECTED", variant: "neutral" };
+export interface PeerViewModel {
+  peerId: string;
+  displayName: string;
+  connectionState: string;
+  badgeVariant: BadgeProps["variant"];
+  transfer?: PeerTransferInfo;
 }
 
-export function PeersPanel({ selfPeerId, onConnect, onDisconnect, onSend, onCancel }: PeersPanelProps) {
-  const peers = usePeersStore((state) =>
-    Object.values(state.peers).filter((peer) => peer.peerId !== selfPeerId),
-  );
-  const transfers = useTransfersStore((state) => state.transfers);
+interface PeersPanelProps {
+  selfPeerId: string | null;
+  peers: PeerViewModel[];
+  selectedPeerId: string | null;
+  onSelect(peerId: string): void;
+  onConnect(peerId: string): void;
+  onDisconnect(peerId: string): void;
+  onSend(peerId: string): void;
+  onCancel(peerId: string): void;
+}
+
+function formatProgress(info: PeerTransferInfo | undefined) {
+  if (!info || info.totalBytes === 0) return null;
+  const value = Math.min(100, (info.bytesTransferred / info.totalBytes) * 100);
+  return value;
+}
 
+export function PeersPanel({
+  selfPeerId,
+  peers,
+  selectedPeerId,
+  onSelect,
+  onConnect,
+  onDisconnect,
+  onSend,
+  onCancel,
+}: PeersPanelProps) {
   return (
     <Card className="space-y-6 p-6">
       <div className="flex flex-col gap-1">
         <h2 className="text-xl font-semibold text-[var(--text)]">Peers na sala</h2>
-        <p className="text-sm text-[var(--text-muted)]">Você é {selfPeerId || "--"}</p>
+        <p className="text-sm text-[var(--muted)]">Você é {selfPeerId || "--"}</p>
       </div>
       {peers.length === 0 ? (
-        <p className="rounded-2xl border border-dashed border-[var(--card-border)]/60 bg-[var(--card)]/50 px-4 py-6 text-center text-sm text-[var(--text-muted)]">
+        <p className="rounded-2xl border border-dashed border-[var(--dashed)]/80 bg-[var(--card)]/40 px-4 py-6 text-center text-sm text-[var(--muted)]">
           Aguarde: nenhum peer apareceu na sala ainda.
         </p>
       ) : (
         <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
           {peers.map((peer) => {
-            const transfer = Object.values(transfers).find(
-              (entry) => entry.peerId === peer.peerId,
-            );
-            const badge = resolvePeerStatus(peer.status, transfer?.status ?? null);
+            const progress = formatProgress(peer.transfer);
+            const isSelected = selectedPeerId === peer.peerId;
             return (
               <div
                 key={peer.peerId}
-                className="card-shadow flex h-full flex-col justify-between gap-4 rounded-2xl border border-[var(--card-border)]/80 bg-[var(--card)]/80 p-5 backdrop-blur-2xl transition duration-200 hover:shadow-[0_28px_55px_-30px_rgba(15,23,42,0.6)]"
+                role="button"
+                tabIndex={0}
+                aria-pressed={isSelected}
+                onClick={() => onSelect(peer.peerId)}
+                onKeyDown={(event) => {
+                  if (event.key === "Enter" || event.key === " ") {
+                    event.preventDefault();
+                    onSelect(peer.peerId);
+                  }
+                }}
+                className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
               >
-                <div className="space-y-2">
+                <div
+                  className={[
+                    "card-shadow flex h-full flex-col gap-4 rounded-2xl border bg-[var(--card)]/80 p-5 backdrop-blur-2xl transition duration-200",
+                    isSelected
+                      ? "border-[var(--primary)]/70 shadow-[0_28px_55px_-30px_rgba(124,58,237,0.55)]"
+                      : "border-[var(--border)]/80 hover:shadow-[0_28px_55px_-30px_rgba(15,23,42,0.6)]",
+                  ].join(" ")}
+                >
                   <div className="flex items-center justify-between gap-3">
                     <div>
-                      <p className="text-base font-semibold text-[var(--text)]">
-                        {peer.displayName}
-                      </p>
-                      <p className="text-xs font-mono text-[var(--text-muted)]">
-                        {peer.peerId}
-                      </p>
+                      <p className="text-base font-semibold text-[var(--text)]">{peer.displayName}</p>
+                      <p className="text-xs font-mono text-[var(--muted)]">{peer.peerId}</p>
                     </div>
-                    <Badge variant={badge.variant}>{badge.label}</Badge>
+                    <Badge variant={peer.badgeVariant}>{peer.connectionState}</Badge>
                   </div>
-                  {transfer && (
-                    <p className="text-xs text-[var(--text-muted)]">
-                      Transferência {transfer.status} • {Math.round(
-                        (transfer.bytesTransferred / Math.max(transfer.totalBytes, 1)) * 100,
-                      )}
-                      %
-                    </p>
+                  {peer.transfer ? (
+                    <div className="space-y-3">
+                      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
+                        <span>{peer.transfer.direction === "send" ? "Enviando" : "Recebendo"}</span>
+                        <span className="font-medium text-[var(--text)]">
+                          {progress !== null ? `${progress.toFixed(1)}%` : "--"}
+                        </span>
+                      </div>
+                      <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--border)]/60 bg-[var(--card)]/50">
+                        <div
+                          className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
+                          style={{ width: progress !== null ? `${progress}%` : "0%" }}
+                        />
+                      </div>
+                    </div>
+                  ) : (
+                    <p className="text-xs text-[var(--muted)]">Nenhuma transferência em andamento.</p>
                   )}
-                </div>
-                <div className="flex flex-wrap gap-2">
-                  <Button type="button" variant="secondary" onClick={() => onConnect(peer.peerId)}>
-                    Conectar
-                  </Button>
-                  <Button type="button" variant="outline" onClick={() => onDisconnect(peer.peerId)}>
-                    Desconectar
-                  </Button>
-                  <Button type="button" onClick={() => onSend(peer.peerId)}>
-                    Enviar arquivo
-                  </Button>
-                  <Button type="button" variant="danger" onClick={() => onCancel(peer.peerId)}>
-                    Cancelar
-                  </Button>
+                  <div className="flex flex-wrap gap-2">
+                    <Button
+                      type="button"
+                      variant="secondary"
+                      onClick={(event) => {
+                        event.stopPropagation();
+                        onConnect(peer.peerId);
+                      }}
+                    >
+                      Conectar
+                    </Button>
+                    <Button
+                      type="button"
+                      variant="outline"
+                      onClick={(event) => {
+                        event.stopPropagation();
+                        onDisconnect(peer.peerId);
+                      }}
+                    >
+                      Desconectar
+                    </Button>
+                    <Button
+                      type="button"
+                      onClick={(event) => {
+                        event.stopPropagation();
+                        onSend(peer.peerId);
+                      }}
+                    >
+                      Enviar arquivo
+                    </Button>
+                    {peer.transfer && peer.transfer.status === "transferring" ? (
+                      <Button
+                        type="button"
+                        variant="danger"
+                        onClick={(event) => {
+                          event.stopPropagation();
+                          onCancel(peer.peerId);
+                        }}
+                      >
+                        Cancelar
+                      </Button>
+                    ) : null}
+                  </div>
                 </div>
               </div>
             );
           })}
         </div>
       )}
     </Card>
   );
 }
 
 export default PeersPanel;
diff --git a/apps/client/src/components/ThemeProvider.tsx b/apps/client/src/components/ThemeProvider.tsx
index 876afe756c7ba17c2d8fd19364c8da29d0b3744b..a27dc7e8615f8cd8d8afe74797b98808e42472d9 100644
--- a/apps/client/src/components/ThemeProvider.tsx
+++ b/apps/client/src/components/ThemeProvider.tsx
@@ -1,86 +1,61 @@
 import {
   createContext,
   useCallback,
   useContext,
   useEffect,
   useMemo,
-  useState,
+  useRef,
   type ReactNode,
 } from "react";
-
-const STORAGE_KEY = "fluxshare-theme";
-
-type ThemeMode = "light" | "dark";
+import { useRoom } from "../state/useRoomStore";
 
 interface ThemeContextValue {
-  theme: ThemeMode;
+  theme: "light" | "dark";
   toggleTheme: () => void;
 }
 
 const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
 
-function getPreferredTheme(): ThemeMode {
-  if (typeof window === "undefined") {
-    return "dark";
-  }
-  const stored = window.localStorage?.getItem(STORAGE_KEY) as ThemeMode | null;
-  if (stored === "light" || stored === "dark") {
-    return stored;
-  }
-  const media = typeof window.matchMedia === "function"
-    ? window.matchMedia("(prefers-color-scheme: dark)")
-    : null;
-  return media?.matches ? "dark" : "light";
-}
-
-function applyTheme(theme: ThemeMode) {
+function applyTheme(theme: "light" | "dark") {
   if (typeof document === "undefined") return;
-  document.documentElement.dataset.theme = theme;
+  document.documentElement.classList.toggle("theme-light", theme === "light");
 }
 
 export function ThemeProvider({ children }: { children: ReactNode }) {
-  const [theme, setTheme] = useState<ThemeMode>(() => {
-    const initial = getPreferredTheme();
-    if (typeof document !== "undefined") {
-      applyTheme(initial);
-    }
-    return initial;
-  });
+  const { theme, setTheme } = useRoom();
+  const manualOverrideRef = useRef(false);
 
   useEffect(() => {
     applyTheme(theme);
-    if (typeof window !== "undefined" && window.localStorage) {
-      window.localStorage.setItem(STORAGE_KEY, theme);
-    }
   }, [theme]);
 
   useEffect(() => {
     const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
       ? window.matchMedia("(prefers-color-scheme: dark)")
       : null;
     if (!media) return;
     const listener = (event: MediaQueryListEvent) => {
-      const stored = window.localStorage?.getItem(STORAGE_KEY) as ThemeMode | null;
-      if (stored === "light" || stored === "dark") return;
+      if (manualOverrideRef.current) return;
       setTheme(event.matches ? "dark" : "light");
     };
     media.addEventListener("change", listener);
     return () => media.removeEventListener("change", listener);
-  }, []);
+  }, [setTheme]);
 
   const toggleTheme = useCallback(() => {
-    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
-  }, []);
+    manualOverrideRef.current = true;
+    setTheme(theme === "dark" ? "light" : "dark");
+  }, [setTheme, theme]);
 
   const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
 
   return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
 }
 
 export function useTheme() {
   const context = useContext(ThemeContext);
   if (!context) {
     throw new Error("useTheme must be used inside ThemeProvider");
   }
   return context;
 }
diff --git a/apps/client/src/components/TransferBox.tsx b/apps/client/src/components/TransferBox.tsx
index 92b904d5d7e2062a6c5264429786b8644092743a..ceca9e3f39f4c3f192d9089053eeb84115a3da18 100644
--- a/apps/client/src/components/TransferBox.tsx
+++ b/apps/client/src/components/TransferBox.tsx
@@ -1,164 +1,177 @@
-import { useTransfersStore } from "../store/useTransfers";
 import { Badge, type BadgeProps } from "./ui/Badge";
 import { Button } from "./ui/Button";
 import { Card } from "./ui/Card";
 
 interface TransferBoxProps {
+  file: {
+    id: string;
+    name: string;
+    size: number;
+    mime?: string;
+    targetLabel?: string;
+  } | null;
+  transfer: {
+    id: string;
+    status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
+    direction: "send" | "receive";
+    bytesTransferred: number;
+    totalBytes: number;
+    startedAt: number;
+    updatedAt: number;
+    peerId: string;
+  } | null;
   onPickFile: () => Promise<void>;
-  onResume: (fileId: string) => void;
-  onCancelFile: (fileId: string) => void;
+  onCancel: (peerId: string, transferId: string) => void;
+  activeTransferId: string | null;
+  hasConnectedPeers: boolean;
 }
 
 function formatBytes(bytes: number) {
   if (bytes === 0) return "0 B";
   const units = ["B", "KB", "MB", "GB", "TB"];
-  const i = Math.floor(Math.log(bytes) / Math.log(1024));
-  const value = bytes / Math.pow(1024, i);
-  return `${value.toFixed(1)} ${units[i]}`;
+  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
+  const value = bytes / 1024 ** exponent;
+  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[exponent]}`;
 }
 
-function formatEta(seconds: number | null) {
-  if (!seconds || seconds === Infinity) return "--";
-  if (seconds < 60) return `${seconds.toFixed(0)}s`;
+function statusBadge(transfer: TransferBoxProps["transfer"] | null): { variant: BadgeProps["variant"]; label: string } | null {
+  if (!transfer) return null;
+  switch (transfer.status) {
+    case "transferring":
+      return { variant: "accent", label: "TRANSFERINDO" };
+    case "completed":
+      return { variant: "success", label: "CONCLUÍDO" };
+    case "cancelled":
+      return { variant: "danger", label: "CANCELADO" };
+    case "error":
+      return { variant: "danger", label: "ERRO" };
+    case "paused":
+      return { variant: "accentSecondary", label: "PAUSADO" };
+    default:
+      return null;
+  }
+}
+
+function formatEta(bytesRemaining: number, speedBytes: number) {
+  if (speedBytes <= 0) return "--";
+  const seconds = Math.ceil(bytesRemaining / speedBytes);
+  if (seconds < 60) return `${seconds}s`;
   const minutes = Math.floor(seconds / 60);
-  const remaining = Math.floor(seconds % 60);
+  const remaining = seconds % 60;
   return `${minutes}m ${remaining}s`;
 }
 
-function formatSpeed(speedBytes: number | null) {
-  if (!speedBytes || !Number.isFinite(speedBytes) || speedBytes <= 0) return "--";
-  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
-  let value = speedBytes;
-  let unitIndex = 0;
-  while (value >= 1024 && unitIndex < units.length - 1) {
-    value /= 1024;
-    unitIndex += 1;
+function computeStatusLabel({
+  file,
+  transfer,
+  hasConnectedPeers,
+}: {
+  file: TransferBoxProps["file"];
+  transfer: TransferBoxProps["transfer"];
+  hasConnectedPeers: boolean;
+}): string {
+  if (transfer) {
+    switch (transfer.status) {
+      case "transferring":
+        return transfer.direction === "receive" ? "Recebendo arquivo…" : "Transferindo…";
+      case "completed":
+        return transfer.direction === "receive" ? "Arquivo recebido" : "Transferência concluída";
+      case "cancelled":
+        return "Transferência cancelada";
+      case "error":
+        return "Falha na transferência";
+      case "paused":
+        return "Transferência pausada";
+      default:
+        return "Transferência";
+    }
   }
-  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
-}
-
-function resolveTransferBadge(status: string): { variant: BadgeProps["variant"]; label: string } {
-  switch (status) {
-    case "completed":
-      return { variant: "success", label: "COMPLETED" };
-    case "transferring":
-      return { variant: "accent", label: "TRANSFERRING" };
-    case "paused":
-      return { variant: "accentSecondary", label: "PAUSED" };
-    case "cancelled":
-      return { variant: "danger", label: "CANCELLED" };
-    case "error":
-      return { variant: "danger", label: "ERROR" };
-    default:
-      return { variant: "neutral", label: status.toUpperCase() };
+  if (file) {
+    return hasConnectedPeers ? "Arquivo pronto para enviar" : "Aguardando peer";
   }
+  return "Nenhum arquivo selecionado";
 }
 
-export function TransferBox({ onPickFile, onResume, onCancelFile }: TransferBoxProps) {
-  const { selectedFile, transfer } = useTransfersStore((state) => {
-    const selected = state.selectedFile;
-    return {
-      selectedFile: selected,
-      transfer: selected ? state.transfers[selected.fileId] ?? null : null,
-    };
-  });
+function renderTargetLabel(label?: string) {
+  if (!label) return null;
+  return (
+    <div className="space-y-1">
+      <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Destino</span>
+      <p className="text-sm text-[var(--text)]">{label}</p>
+    </div>
+  );
+}
 
-  const totalBytes = transfer?.totalBytes ?? selectedFile?.size ?? 0;
-  const transferBadge = transfer ? resolveTransferBadge(transfer.status) : null;
-  const progressPercent = transfer
-    ? Math.min(100, (transfer.bytesTransferred / Math.max(totalBytes, 1)) * 100)
-    : 0;
-  const elapsedSeconds = transfer ? (Date.now() - transfer.startedAt) / 1000 : null;
-  const averageSpeed = transfer && elapsedSeconds && elapsedSeconds > 0
-    ? transfer.bytesTransferred / elapsedSeconds
-    : null;
-  const eta = transfer && averageSpeed && averageSpeed > 0
-    ? (transfer.totalBytes - transfer.bytesTransferred) / averageSpeed
-    : null;
+export function TransferBox({ file, transfer, onPickFile, onCancel, activeTransferId, hasConnectedPeers }: TransferBoxProps) {
+  const badge = statusBadge(transfer);
+  const progress = transfer ? Math.min(100, (transfer.bytesTransferred / Math.max(transfer.totalBytes, 1)) * 100) : 0;
+  const elapsedSeconds = transfer ? Math.max(0, (transfer.updatedAt - transfer.startedAt) / 1000) : 0;
+  const speedBytes = transfer && elapsedSeconds > 0 ? transfer.bytesTransferred / elapsedSeconds : 0;
+  const eta = transfer ? formatEta(transfer.totalBytes - transfer.bytesTransferred, speedBytes) : "--";
+  const statusLabel = computeStatusLabel({ file, transfer, hasConnectedPeers });
 
   return (
     <Card className="flex h-full flex-col gap-6 p-6">
       <div className="flex flex-wrap items-start justify-between gap-4">
         <div className="space-y-2">
           <div className="flex items-center gap-3">
             <h2 className="text-xl font-semibold text-[var(--text)]">Transferência</h2>
-            {transferBadge && (
-              <Badge variant={transferBadge.variant}>{transferBadge.label}</Badge>
-            )}
+            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
           </div>
-          <p className="text-sm text-[var(--text-muted)]">
-            {selectedFile ? selectedFile.name : "Nenhum arquivo selecionado"}
-          </p>
+          <p className="text-sm text-[var(--muted)]">{statusLabel}</p>
         </div>
         <Button type="button" onClick={() => onPickFile()}>
           Selecionar arquivo
         </Button>
       </div>
       <div className="space-y-4">
-        {selectedFile ? (
+        {file ? (
           <>
-            <div className="grid gap-4 sm:grid-cols-2">
+            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
               <div className="space-y-1">
-                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
-                  Tamanho
-                </span>
-                <p className="text-sm text-[var(--text)]">{formatBytes(selectedFile.size)}</p>
+                <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Nome</span>
+                <p className="text-sm text-[var(--text)]">{file.name}</p>
               </div>
               <div className="space-y-1">
-                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
-                  Progresso
-                </span>
-                <p className="text-sm text-[var(--text)]">{progressPercent.toFixed(1)}%</p>
+                <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Tamanho</span>
+                <p className="text-sm text-[var(--text)]">{formatBytes(file.size)}</p>
               </div>
+              {renderTargetLabel(file.targetLabel)}
             </div>
-            <div className="space-y-2">
-              <div
-                role="progressbar"
-                aria-valuenow={Math.round(progressPercent)}
-                aria-valuemin={0}
-                aria-valuemax={100}
-                className="h-3 w-full overflow-hidden rounded-full border border-[var(--card-border)]/60 bg-[var(--card)]/50"
-              >
-                <div
-                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
-                  style={{ width: `${progressPercent}%` }}
-                />
+            {transfer ? (
+              <div className="space-y-2">
+                <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--border)]/60 bg-[var(--card)]/50">
+                  <div
+                    className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
+                    style={{ width: `${progress}%` }}
+                  />
+                </div>
+                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--muted)]">
+                  <span>Progresso: {progress.toFixed(1)}%</span>
+                  <span>Velocidade: {speedBytes > 0 ? formatBytes(speedBytes) + "/s" : "--"}</span>
+                  <span>ETA: {eta}</span>
+                </div>
               </div>
-              <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-muted)]">
-                <span>ETA: {formatEta(eta)}</span>
-                <span>Velocidade média: {formatSpeed(averageSpeed)}</span>
-                {transfer && (
-                  <span>
-                    Recebido: {formatBytes(transfer.bytesTransferred)} / {formatBytes(totalBytes)}
-                  </span>
-                )}
+            ) : null}
+            {transfer && transfer.status === "transferring" ? (
+              <div className="flex flex-wrap gap-2">
+                <Button type="button" variant="danger" onClick={() => onCancel(transfer.peerId, transfer.id)}>
+                  Cancelar transferência
+                </Button>
               </div>
-            </div>
-            <div className="flex flex-wrap gap-2">
-              <Button
-                type="button"
-                variant="secondary"
-                onClick={() => selectedFile && onResume(selectedFile.fileId)}
-              >
-                Retomar
-              </Button>
-              <Button
-                type="button"
-                variant="danger"
-                onClick={() => selectedFile && onCancelFile(selectedFile.fileId)}
-              >
-                Cancelar
-              </Button>
-            </div>
+            ) : null}
           </>
         ) : (
-          <div className="rounded-2xl border border-dashed border-[var(--card-border)]/60 bg-[var(--card)]/40 px-6 py-10 text-center text-sm text-[var(--text-muted)]">
-            Escolha um arquivo para iniciar uma nova transferência.
+          <div className="rounded-2xl border border-dashed border-[var(--dashed)]/80 bg-[var(--card)]/40 px-6 py-10 text-center text-sm text-[var(--muted)]">
+            Selecione um arquivo para iniciar uma nova transferência.
           </div>
         )}
       </div>
+      {activeTransferId ? (
+        <p className="text-xs text-[var(--muted)]">Transferência em foco: {activeTransferId}</p>
+      ) : null}
     </Card>
   );
 }
 
 export default TransferBox;
diff --git a/apps/client/src/components/ui/Badge.tsx b/apps/client/src/components/ui/Badge.tsx
index ab143e06f408964dbb1fec1b6a92898aed1e7e1e..8b3d8ae77be4324456a041a146a3974a3e6589e0 100644
--- a/apps/client/src/components/ui/Badge.tsx
+++ b/apps/client/src/components/ui/Badge.tsx
@@ -1,28 +1,28 @@
 import { cn } from "../../utils/cn";
 
 type BadgeVariant = "neutral" | "accent" | "accentSecondary" | "success" | "danger";
 
 export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
   variant?: BadgeVariant;
 }
 
 const variantClasses: Record<BadgeVariant, string> = {
-  neutral: "bg-white/10 text-[var(--text-muted)]",
-  accent: "bg-[var(--accent)]/25 text-[var(--accent)]",
-  accentSecondary: "bg-[var(--accent-2)]/25 text-[var(--accent-2)]",
+  neutral: "bg-white/10 text-[var(--muted)]",
+  accent: "bg-[var(--primary)]/25 text-[var(--primary)]",
+  accentSecondary: "bg-[var(--accent)]/25 text-[var(--accent)]",
   success: "bg-emerald-500/20 text-emerald-300",
   danger: "bg-red-500/20 text-red-300",
 };
 
 export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
   return (
     <span
       className={cn(
         "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
         variantClasses[variant],
         className,
       )}
       {...props}
     />
   );
 }
diff --git a/apps/client/src/components/ui/Button.tsx b/apps/client/src/components/ui/Button.tsx
index 2bf9a3278a48caf05a1881ba22c2c7fc58785f3f..913891519081a16665465b2a25683ce6cffc520a 100644
--- a/apps/client/src/components/ui/Button.tsx
+++ b/apps/client/src/components/ui/Button.tsx
@@ -1,48 +1,48 @@
 import { forwardRef } from "react";
 import { cn } from "../../utils/cn";
 
 type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
 type ButtonSize = "md" | "sm";
 
 export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
   variant?: ButtonVariant;
   size?: ButtonSize;
 }
 
 const variantClasses: Record<ButtonVariant, string> = {
   primary:
-    "bg-[var(--accent)] text-white shadow-[0_20px_45px_-20px_rgba(124,58,237,0.75)] hover:brightness-110",
+    "bg-[var(--primary)] text-white shadow-[0_20px_45px_-20px_rgba(124,58,237,0.75)] hover:brightness-110",
   secondary:
-    "bg-[var(--card)]/70 text-[var(--text)] border border-[var(--card-border)]/80 hover:border-[var(--accent)]/70",
+    "bg-[var(--card)]/70 text-[var(--text)] border border-[var(--border)]/80 hover:border-[var(--primary)]/70",
   ghost: "bg-transparent text-[var(--text)] hover:bg-white/10",
   outline:
-    "border border-[var(--card-border)]/80 text-[var(--text)] hover:border-[var(--accent)]/70",
+    "border border-[var(--border)]/80 text-[var(--text)] hover:border-[var(--primary)]/70",
   danger: "bg-red-500/80 text-white hover:bg-red-400/90",
 };
 
 const sizeClasses: Record<ButtonSize, string> = {
   md: "h-10 px-4 text-sm",
   sm: "h-9 px-3 text-xs",
 };
 
 export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
   ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => {
     return (
       <button
         ref={ref}
         className={cn(
           "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition duration-200",
-          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2",
+          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2",
           "disabled:cursor-not-allowed disabled:opacity-50",
           variantClasses[variant],
           sizeClasses[size],
           className,
         )}
         disabled={disabled}
         {...props}
       />
     );
   },
 );
 
 Button.displayName = "Button";
diff --git a/apps/client/src/components/ui/Card.tsx b/apps/client/src/components/ui/Card.tsx
index 99538467de136e788feeb5c84c882fedb4867b59..22b7d3ed6df4a23dd421040037d5955599eff054 100644
--- a/apps/client/src/components/ui/Card.tsx
+++ b/apps/client/src/components/ui/Card.tsx
@@ -1,19 +1,19 @@
 import { cn } from "../../utils/cn";
 
 interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
   noShadow?: boolean;
 }
 
 export function Card({ className, noShadow = false, ...props }: CardProps) {
   return (
     <div
       className={cn(
-        "rounded-3xl border border-[var(--card-border)]/80 bg-[var(--card)]/85 backdrop-blur-2xl",
+        "rounded-3xl border border-[var(--border)]/80 bg-[var(--card)]/85 backdrop-blur-2xl",
         "transition-shadow duration-200",
         noShadow ? undefined : "card-shadow",
         className,
       )}
       {...props}
     />
   );
 }
diff --git a/apps/client/src/lib/webrtc/PeerManager.ts b/apps/client/src/lib/rtc/PeerManager.ts
similarity index 61%
rename from apps/client/src/lib/webrtc/PeerManager.ts
rename to apps/client/src/lib/rtc/PeerManager.ts
index bb1314e3dd9dd534640000c998f3c569eb1bedf3..98917286523611159472f88c9974d7cf5480cbdc 100644
--- a/apps/client/src/lib/webrtc/PeerManager.ts
+++ b/apps/client/src/lib/rtc/PeerManager.ts
@@ -1,185 +1,264 @@
 import { SignalingClient } from "../signaling";
 import { getEnv } from "../../utils/env";
 
 export type PeerConnectionState =
   | "new"
   | "connecting"
   | "connected"
   | "disconnected"
   | "failed"
   | "closed";
 
 export type PeerManagerEventMap = {
   "connection-state": { peerId: string; state: PeerConnectionState };
-  "data-channel": { peerId: string; channel: RTCDataChannel };
   "ice-connection-state": { peerId: string; state: RTCIceConnectionState };
+  "data-channel": { peerId: string; channel: RTCDataChannel };
+  "peer-removed": { peerId: string };
 };
 
 export type PeerManagerEvent = keyof PeerManagerEventMap;
 
 export type PeerSignal =
   | { type: "offer"; sdp: RTCSessionDescriptionInit }
   | { type: "answer"; sdp: RTCSessionDescriptionInit }
   | { type: "candidate"; candidate: RTCIceCandidateInit };
 
+interface PeerConnectionEntry {
+  peerId: string;
+  connection: RTCPeerConnection;
+  channel: RTCDataChannel | null;
+  isOffering: boolean;
+  reconnectAttempts: number;
+  reconnectTimer: number | null;
+}
+
 class EventEmitter {
   private listeners = new Map<PeerManagerEvent, Set<(payload: any) => void>>();
 
   on<T extends PeerManagerEvent>(event: T, handler: (payload: PeerManagerEventMap[T]) => void) {
     if (!this.listeners.has(event)) {
       this.listeners.set(event, new Set());
     }
     this.listeners.get(event)!.add(handler as any);
     return () => this.off(event, handler as any);
   }
 
   off<T extends PeerManagerEvent>(event: T, handler: (payload: PeerManagerEventMap[T]) => void) {
     this.listeners.get(event)?.delete(handler as any);
   }
 
   emit<T extends PeerManagerEvent>(event: T, payload: PeerManagerEventMap[T]) {
     this.listeners.get(event)?.forEach((listener) => {
       try {
         listener(payload);
       } catch (error) {
         console.error("fluxshare:peer-manager:listener", error);
       }
     });
   }
 }
 
-interface PeerConnectionEntry {
-  peerId: string;
-  connection: RTCPeerConnection;
-  channel: RTCDataChannel | null;
-  isOffering: boolean;
+const RECONNECT_DELAY = 2_000;
+const MAX_RECONNECT_ATTEMPTS = 3;
+
+export interface PeerManagerOptions {
+  reconnect?: boolean;
 }
 
 export class PeerManager {
   private readonly signaling: SignalingClient;
   private readonly emitter = new EventEmitter();
   private readonly peers = new Map<string, PeerConnectionEntry>();
+  private readonly reconnectEnabled: boolean;
+  private unsubscribeSignal: (() => void) | null = null;
 
-  constructor(signaling: SignalingClient) {
+  constructor(signaling: SignalingClient, options: PeerManagerOptions = {}) {
     this.signaling = signaling;
-    this.signaling.on("signal", ({ from, data }) => {
+    this.reconnectEnabled = options.reconnect ?? true;
+    this.unsubscribeSignal = this.signaling.on("signal", ({ from, data }) => {
       this.handleSignal(from, data as PeerSignal);
     });
   }
 
   on = this.emitter.on.bind(this.emitter);
   off = this.emitter.off.bind(this.emitter);
 
   async connectTo(peerId: string) {
     const entry = this.ensurePeer(peerId);
     entry.isOffering = true;
-    const channel = entry.connection.createDataChannel("fluxshare", {
-      ordered: true,
-    });
+    const channel = entry.connection.createDataChannel("fluxshare", { ordered: true });
     this.prepareDataChannel(peerId, channel);
     const offer = await entry.connection.createOffer();
     await entry.connection.setLocalDescription(offer);
     this.signaling.sendSignal(peerId, { type: "offer", sdp: offer });
     return channel;
   }
 
-  async handleSignal(from: string, signal: PeerSignal) {
+  dispose() {
+    this.unsubscribeSignal?.();
+    this.unsubscribeSignal = null;
+    this.peers.forEach((entry) => {
+      entry.connection.onicecandidate = null;
+      entry.connection.onconnectionstatechange = null;
+      entry.connection.oniceconnectionstatechange = null;
+      entry.connection.ondatachannel = null;
+      entry.connection.close();
+      if (entry.reconnectTimer) {
+        clearTimeout(entry.reconnectTimer);
+      }
+    });
+    this.peers.clear();
+  }
+
+  disconnect(peerId: string) {
+    const entry = this.peers.get(peerId);
+    if (!entry) return;
+    entry.connection.close();
+    if (entry.reconnectTimer) {
+      clearTimeout(entry.reconnectTimer);
+    }
+    this.peers.delete(peerId);
+    this.emitter.emit("peer-removed", { peerId });
+  }
+
+  private async handleSignal(from: string, signal: PeerSignal) {
     const entry = this.ensurePeer(from);
     switch (signal.type) {
       case "offer": {
         entry.isOffering = false;
         await entry.connection.setRemoteDescription(signal.sdp);
         const answer = await entry.connection.createAnswer();
         await entry.connection.setLocalDescription(answer);
         this.signaling.sendSignal(from, { type: "answer", sdp: answer });
         break;
       }
       case "answer": {
         await entry.connection.setRemoteDescription(signal.sdp);
         break;
       }
       case "candidate": {
         if (signal.candidate) {
           try {
             await entry.connection.addIceCandidate(signal.candidate);
           } catch (error) {
             console.error("fluxshare:peer-manager", "failed to add ICE", error);
           }
         }
         break;
       }
       default:
         break;
     }
   }
 
-  disconnect(peerId: string) {
-    const entry = this.peers.get(peerId);
-    if (!entry) return;
-    entry.connection.close();
-    this.peers.delete(peerId);
-  }
-
   private ensurePeer(peerId: string): PeerConnectionEntry {
     const existing = this.peers.get(peerId);
     if (existing) {
       return existing;
     }
 
     const { iceServers } = getEnv();
     const connection = new RTCPeerConnection({ iceServers });
     const entry: PeerConnectionEntry = {
       peerId,
       connection,
       channel: null,
       isOffering: false,
+      reconnectAttempts: 0,
+      reconnectTimer: null,
     };
 
     connection.onicecandidate = (event) => {
       if (event.candidate) {
         this.signaling.sendSignal(peerId, { type: "candidate", candidate: event.candidate.toJSON() });
       }
     };
 
     connection.onconnectionstatechange = () => {
       const state = connection.connectionState as PeerConnectionState;
       this.emitter.emit("connection-state", { peerId, state });
-      if (state === "failed" || state === "closed" || state === "disconnected") {
-        // leave data channel cleanup to consumer
+      if (state === "failed" || state === "disconnected") {
+        this.scheduleReconnect(peerId);
+      }
+      if (state === "closed") {
+        this.disconnect(peerId);
       }
     };
 
     connection.oniceconnectionstatechange = () => {
       this.emitter.emit("ice-connection-state", {
         peerId,
         state: connection.iceConnectionState,
       });
     };
 
     connection.ondatachannel = (event) => {
       const channel = event.channel;
       this.prepareDataChannel(peerId, channel);
     };
 
     this.peers.set(peerId, entry);
     return entry;
   }
 
   private prepareDataChannel(peerId: string, channel: RTCDataChannel) {
+    const entry = this.ensurePeer(peerId);
+    if (entry.channel && entry.channel !== channel) {
+      entry.channel.close();
+    }
+    entry.channel = channel;
+    channel.binaryType = "arraybuffer";
+    channel.onopen = () => {
+      entry.reconnectAttempts = 0;
+      this.emitter.emit("data-channel", { peerId, channel });
+    };
+    channel.onclose = () => {
+      if (this.reconnectEnabled) {
+        this.scheduleReconnect(peerId);
+      }
+    };
+    channel.onerror = (event) => {
+      console.error("fluxshare:peer-manager", "datachannel error", event);
+    };
+  }
+
+  private scheduleReconnect(peerId: string) {
+    if (!this.reconnectEnabled) return;
     const entry = this.peers.get(peerId);
     if (!entry) return;
-    channel.binaryType = "arraybuffer";
-    channel.bufferedAmountLowThreshold = 1_000_000;
-    entry.channel = channel;
-    channel.addEventListener("open", () => {
-      console.log("fluxshare:webrtc", `datachannel open with ${peerId}`);
+    if (entry.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
+      return;
+    }
+    if (entry.reconnectTimer) {
+      return;
+    }
+    entry.reconnectAttempts += 1;
+    entry.reconnectTimer = window.setTimeout(() => {
+      entry.reconnectTimer = null;
+      this.restartPeer(peerId).catch((error) => {
+        console.error("fluxshare:peer-manager", "reconnect failed", error);
+      });
+    }, RECONNECT_DELAY);
+  }
+
+  private async restartPeer(peerId: string) {
+    const entry = this.peers.get(peerId);
+    if (!entry) return;
+    try {
+      entry.connection.onicecandidate = null;
+      entry.connection.onconnectionstatechange = null;
+      entry.connection.oniceconnectionstatechange = null;
+      entry.connection.ondatachannel = null;
+      entry.connection.close();
+    } catch (error) {
+      console.warn("fluxshare:peer-manager", "error closing connection", error);
+    }
+    this.peers.delete(peerId);
+    const channel = await this.connectTo(peerId);
+    if (channel.readyState === "open") {
       this.emitter.emit("data-channel", { peerId, channel });
-    });
-    channel.addEventListener("close", () => {
-      console.log("fluxshare:webrtc", `datachannel closed with ${peerId}`);
-    });
-    channel.addEventListener("error", (event) => {
-      console.error("fluxshare:webrtc", "datachannel error", event);
-    });
+    }
   }
 }
+
+export default PeerManager;
diff --git a/apps/client/src/lib/transfer/TransferService.ts b/apps/client/src/lib/transfer/TransferService.ts
new file mode 100644
index 0000000000000000000000000000000000000000..abb158f07b84db7316e428f18b6a907b96706ee7
--- /dev/null
+++ b/apps/client/src/lib/transfer/TransferService.ts
@@ -0,0 +1,607 @@
+import { nanoid } from "nanoid";
+import { isTauri } from "../persist/tauri";
+
+export const DEFAULT_CHUNK_SIZE = 64 * 1024;
+const BUFFERED_AMOUNT_LOW = DEFAULT_CHUNK_SIZE * 8;
+const BUFFERED_AMOUNT_HIGH = DEFAULT_CHUNK_SIZE * 32;
+
+export type TransferDirection = "send" | "receive";
+
+export interface TransferMeta {
+  id: string;
+  name: string;
+  size: number;
+  mime?: string;
+  chunkSize: number;
+  totalChunks: number;
+}
+
+export interface TransferSource {
+  id?: string;
+  name: string;
+  size: number;
+  mime?: string;
+  file?: File;
+  createChunk?: (start: number, length: number) => Promise<ArrayBuffer>;
+  onDispose?: () => void;
+}
+
+interface ControlMetaMessage extends TransferMeta {
+  type: "meta";
+}
+
+interface ControlAckMessage {
+  type: "ack";
+  id: string;
+  ready: boolean;
+}
+
+interface ControlEofMessage {
+  type: "eof";
+  id: string;
+}
+
+interface ControlCancelMessage {
+  type: "cancel";
+  id: string;
+  reason?: string;
+}
+
+export type ControlMessage = ControlMetaMessage | ControlAckMessage | ControlEofMessage | ControlCancelMessage;
+
+export interface TransferLifecycleEvent {
+  peerId: string;
+  direction: TransferDirection;
+  meta: TransferMeta;
+  transferId: string;
+  startedAt: number;
+}
+
+export interface TransferProgressEvent extends TransferLifecycleEvent {
+  bytesTransferred: number;
+  totalBytes: number;
+  chunkIndex: number;
+  updatedAt: number;
+}
+
+export interface TransferCompletedEvent extends TransferLifecycleEvent {
+  blob?: Blob;
+  fileUrl?: string;
+  savePath?: string;
+}
+
+export interface TransferCancelledEvent extends TransferLifecycleEvent {
+  reason?: string;
+}
+
+export interface TransferErrorEvent extends TransferLifecycleEvent {
+  error: Error;
+}
+
+export type TransferServiceEventMap = {
+  "transfer-started": TransferLifecycleEvent;
+  "transfer-progress": TransferProgressEvent;
+  "transfer-completed": TransferCompletedEvent;
+  "transfer-cancelled": TransferCancelledEvent;
+  "transfer-error": TransferErrorEvent;
+};
+
+export type TransferServiceEvent = keyof TransferServiceEventMap;
+
+class EventEmitter {
+  private listeners = new Map<TransferServiceEvent, Set<(payload: any) => void>>();
+
+  on<T extends TransferServiceEvent>(event: T, handler: (payload: TransferServiceEventMap[T]) => void) {
+    if (!this.listeners.has(event)) {
+      this.listeners.set(event, new Set());
+    }
+    this.listeners.get(event)!.add(handler as any);
+    return () => this.off(event, handler as any);
+  }
+
+  off<T extends TransferServiceEvent>(event: T, handler: (payload: TransferServiceEventMap[T]) => void) {
+    this.listeners.get(event)?.delete(handler as any);
+  }
+
+  emit<T extends TransferServiceEvent>(event: T, payload: TransferServiceEventMap[T]) {
+    this.listeners.get(event)?.forEach((listener) => {
+      try {
+        listener(payload);
+      } catch (error) {
+        console.error("fluxshare:transfer", "listener error", error);
+      }
+    });
+  }
+}
+
+interface SendSession {
+  meta: TransferMeta;
+  source: TransferSource;
+  nextChunk: number;
+  startedAt: number;
+  bytesSent: number;
+  cancelled: boolean;
+}
+
+interface ReceiveSession {
+  meta: TransferMeta;
+  chunks: Array<ArrayBuffer | null>;
+  receivedChunks: number;
+  bytesReceived: number;
+  startedAt: number;
+  cancelled: boolean;
+}
+
+class PeerChannelController {
+  private readonly peerId: string;
+  private readonly channel: RTCDataChannel;
+  private readonly emitter: EventEmitter;
+  private sendSession: SendSession | null = null;
+  private receiveSession: ReceiveSession | null = null;
+
+  constructor(peerId: string, channel: RTCDataChannel, emitter: EventEmitter) {
+    this.peerId = peerId;
+    this.channel = channel;
+    this.emitter = emitter;
+    this.channel.binaryType = "arraybuffer";
+    this.channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW;
+    this.channel.addEventListener("message", (event) => {
+      this.handleMessage(event.data).catch((error) => {
+        console.error("fluxshare:transfer", "message handler failed", error);
+      });
+    });
+    this.channel.addEventListener("close", () => {
+      this.cancelActiveSessions("Canal fechado");
+    });
+    this.channel.addEventListener("error", (event) => {
+      console.error("fluxshare:transfer", "datachannel error", event);
+      this.cancelActiveSessions("Erro no canal");
+    });
+  }
+
+  async sendFile(source: TransferSource, chunkSize = DEFAULT_CHUNK_SIZE) {
+    if (this.sendSession) {
+      throw new Error("Transferência em andamento para este peer");
+    }
+    const meta = this.createMeta(source, chunkSize);
+    this.sendSession = {
+      meta,
+      source,
+      nextChunk: 0,
+      startedAt: Date.now(),
+      bytesSent: 0,
+      cancelled: false,
+    };
+    this.sendControl({ type: "meta", ...meta });
+  }
+
+  cancelTransfer(transferId: string, reason?: string) {
+    if (this.sendSession && this.sendSession.meta.id === transferId) {
+      this.sendSession.cancelled = true;
+      this.sendControl({ type: "cancel", id: transferId, reason });
+      this.emitter.emit("transfer-cancelled", {
+        peerId: this.peerId,
+        direction: "send",
+        meta: this.sendSession.meta,
+        transferId,
+        startedAt: this.sendSession.startedAt,
+        reason,
+      });
+      this.cleanupSend();
+    }
+    if (this.receiveSession && this.receiveSession.meta.id === transferId) {
+      this.receiveSession.cancelled = true;
+      this.sendControl({ type: "cancel", id: transferId, reason });
+      this.emitter.emit("transfer-cancelled", {
+        peerId: this.peerId,
+        direction: "receive",
+        meta: this.receiveSession.meta,
+        transferId,
+        startedAt: this.receiveSession.startedAt,
+        reason,
+      });
+      this.cleanupReceive();
+    }
+  }
+
+  dispose() {
+    this.cancelActiveSessions("Encerrado");
+    this.channel.close();
+  }
+
+  private createMeta(source: TransferSource, chunkSize: number): TransferMeta {
+    const id = source.id ?? nanoid(12);
+    const totalChunks = Math.ceil(source.size / chunkSize);
+    return {
+      id,
+      name: source.name,
+      size: source.size,
+      mime: source.mime,
+      chunkSize,
+      totalChunks,
+    };
+  }
+
+  private async handleMessage(data: unknown) {
+    if (typeof data === "string") {
+      const control = this.parseControlMessage(data);
+      if (!control) return;
+      switch (control.type) {
+        case "meta":
+          await this.prepareReceive(control);
+          break;
+        case "ack":
+          if (control.ready) {
+            void this.startSendingChunks();
+          } else {
+            this.cancelTransfer(control.id, "Peer não pode receber");
+          }
+          break;
+        case "eof":
+          await this.finalizeReceive(control.id);
+          break;
+        case "cancel":
+          this.handleCancel(control.id, control.reason);
+          break;
+        default:
+          break;
+      }
+      return;
+    }
+    if (data instanceof ArrayBuffer) {
+      this.handleChunk(data);
+      return;
+    }
+    if (data instanceof Blob) {
+      const buffer = await data.arrayBuffer();
+      this.handleChunk(buffer);
+    }
+  }
+
+  private parseControlMessage(raw: string): ControlMessage | null {
+    try {
+      const parsed = JSON.parse(raw);
+      if (!parsed || typeof parsed !== "object") return null;
+      return parsed as ControlMessage;
+    } catch (error) {
+      console.warn("fluxshare:transfer", "invalid control message", error);
+      return null;
+    }
+  }
+
+  private async prepareReceive(meta: TransferMeta) {
+    if (this.receiveSession) {
+      this.cancelTransfer(this.receiveSession.meta.id, "Sobrescrito por nova transferência");
+    }
+    const session: ReceiveSession = {
+      meta,
+      chunks: new Array(meta.totalChunks).fill(null),
+      receivedChunks: 0,
+      bytesReceived: 0,
+      startedAt: Date.now(),
+      cancelled: false,
+    };
+    this.receiveSession = session;
+    this.emitter.emit("transfer-started", {
+      peerId: this.peerId,
+      direction: "receive",
+      meta,
+      transferId: meta.id,
+      startedAt: session.startedAt,
+    });
+    this.sendControl({ type: "ack", id: meta.id, ready: true });
+  }
+
+  private async startSendingChunks() {
+    const session = this.sendSession;
+    if (!session || session.cancelled) return;
+    const { meta } = session;
+    this.emitter.emit("transfer-started", {
+      peerId: this.peerId,
+      direction: "send",
+      meta,
+      transferId: meta.id,
+      startedAt: session.startedAt,
+    });
+    while (session.nextChunk < meta.totalChunks) {
+      if (session.cancelled) {
+        return;
+      }
+      const chunk = await this.readChunk(session.source, session.nextChunk, meta.chunkSize, meta.size);
+      await this.waitForBackpressure();
+      const payload = new Uint8Array(4 + chunk.byteLength);
+      new DataView(payload.buffer).setUint32(0, session.nextChunk, false);
+      payload.set(new Uint8Array(chunk), 4);
+      this.channel.send(payload.buffer);
+      session.bytesSent = Math.min(meta.size, session.bytesSent + chunk.byteLength);
+      const progressEvent: TransferProgressEvent = {
+        peerId: this.peerId,
+        direction: "send",
+        meta,
+        transferId: meta.id,
+        startedAt: session.startedAt,
+        bytesTransferred: session.bytesSent,
+        totalBytes: meta.size,
+        chunkIndex: session.nextChunk,
+        updatedAt: Date.now(),
+      };
+      this.emitter.emit("transfer-progress", progressEvent);
+      session.nextChunk += 1;
+    }
+    this.sendControl({ type: "eof", id: meta.id });
+    this.emitter.emit("transfer-completed", {
+      peerId: this.peerId,
+      direction: "send",
+      meta,
+      transferId: meta.id,
+      startedAt: session.startedAt,
+    });
+    this.cleanupSend();
+  }
+
+  private handleChunk(buffer: ArrayBuffer) {
+    const session = this.receiveSession;
+    if (!session || session.cancelled) return;
+    const view = new DataView(buffer);
+    const index = view.getUint32(0, false);
+    if (index < 0 || index >= session.meta.totalChunks) {
+      return;
+    }
+    const chunk = buffer.slice(4);
+    if (session.chunks[index]) {
+      return;
+    }
+    session.chunks[index] = chunk;
+    session.receivedChunks += 1;
+    session.bytesReceived = Math.min(session.meta.size, session.bytesReceived + chunk.byteLength);
+    this.emitter.emit("transfer-progress", {
+      peerId: this.peerId,
+      direction: "receive",
+      meta: session.meta,
+      transferId: session.meta.id,
+      startedAt: session.startedAt,
+      bytesTransferred: session.bytesReceived,
+      totalBytes: session.meta.size,
+      chunkIndex: index,
+      updatedAt: Date.now(),
+    });
+  }
+
+  private async finalizeReceive(transferId: string) {
+    const session = this.receiveSession;
+    if (!session || session.meta.id !== transferId) return;
+    if (session.cancelled) {
+      this.cleanupReceive();
+      return;
+    }
+    try {
+      const merged = this.mergeChunks(session);
+      const blob = new Blob(merged, { type: session.meta.mime ?? "application/octet-stream" });
+      let savePath: string | null = null;
+      if (isTauri()) {
+        savePath = await this.saveWithTauri(session.meta, blob);
+      }
+      if (savePath) {
+        this.emitter.emit("transfer-completed", {
+          peerId: this.peerId,
+          direction: "receive",
+          meta: session.meta,
+          transferId: session.meta.id,
+          startedAt: session.startedAt,
+          savePath,
+        });
+      } else {
+        const url = URL.createObjectURL(blob);
+        this.triggerDownload(session.meta.name, url);
+        this.emitter.emit("transfer-completed", {
+          peerId: this.peerId,
+          direction: "receive",
+          meta: session.meta,
+          transferId: session.meta.id,
+          startedAt: session.startedAt,
+          blob,
+          fileUrl: url,
+        });
+      }
+    } catch (error) {
+      this.emitter.emit("transfer-error", {
+        peerId: this.peerId,
+        direction: "receive",
+        meta: session.meta,
+        transferId: session.meta.id,
+        startedAt: session.startedAt,
+        error: error instanceof Error ? error : new Error(String(error)),
+      });
+    }
+    this.cleanupReceive();
+  }
+
+  private mergeChunks(session: ReceiveSession) {
+    const buffers: ArrayBuffer[] = [];
+    for (let index = 0; index < session.meta.totalChunks; index += 1) {
+      const chunk = session.chunks[index];
+      if (!chunk) {
+        throw new Error(`Chunk ${index} ausente`);
+      }
+      buffers.push(chunk);
+    }
+    return buffers;
+  }
+
+  private async saveWithTauri(meta: TransferMeta, blob: Blob) {
+    try {
+      const { save } = await import("@tauri-apps/api/dialog");
+      const { writeBinaryFile } = await import("@tauri-apps/api/fs");
+      const target = await save({ defaultPath: meta.name });
+      if (!target) {
+        return null;
+      }
+      const buffer = new Uint8Array(await blob.arrayBuffer());
+      await writeBinaryFile({ path: target, contents: buffer });
+      return target;
+    } catch (error) {
+      console.warn("fluxshare:transfer", "tauri save failed", error);
+      return null;
+    }
+  }
+
+  private triggerDownload(filename: string, url: string) {
+    const link = document.createElement("a");
+    link.href = url;
+    link.download = filename;
+    link.style.display = "none";
+    document.body.appendChild(link);
+    link.click();
+    document.body.removeChild(link);
+  }
+
+  private handleCancel(transferId: string, reason?: string) {
+    if (this.sendSession && this.sendSession.meta.id === transferId) {
+      const session = this.sendSession;
+      this.sendSession = null;
+      this.emitter.emit("transfer-cancelled", {
+        peerId: this.peerId,
+        direction: "send",
+        meta: session.meta,
+        transferId,
+        startedAt: session.startedAt,
+        reason,
+      });
+      session.source.onDispose?.();
+      return;
+    }
+    if (this.receiveSession && this.receiveSession.meta.id === transferId) {
+      const session = this.receiveSession;
+      this.receiveSession = null;
+      this.emitter.emit("transfer-cancelled", {
+        peerId: this.peerId,
+        direction: "receive",
+        meta: session.meta,
+        transferId,
+        startedAt: session.startedAt,
+        reason,
+      });
+      return;
+    }
+  }
+
+  private async readChunk(source: TransferSource, index: number, chunkSize: number, totalSize: number) {
+    const start = index * chunkSize;
+    const remaining = totalSize - start;
+    const size = Math.min(chunkSize, remaining);
+    if (size <= 0) {
+      return new ArrayBuffer(0);
+    }
+    if (source.createChunk) {
+      return source.createChunk(start, size);
+    }
+    if (source.file) {
+      const slice = source.file.slice(start, start + size);
+      return slice.arrayBuffer();
+    }
+    throw new Error("Fonte de arquivo inválida");
+  }
+
+  private waitForBackpressure(): Promise<void> {
+    if (this.channel.bufferedAmount <= BUFFERED_AMOUNT_HIGH) {
+      return Promise.resolve();
+    }
+    return new Promise((resolve) => {
+      const listener = () => {
+        if (this.channel.bufferedAmount <= BUFFERED_AMOUNT_LOW) {
+          this.channel.removeEventListener("bufferedamountlow", listener);
+          resolve();
+        }
+      };
+      this.channel.addEventListener("bufferedamountlow", listener);
+    });
+  }
+
+  private sendControl(message: ControlMessage) {
+    try {
+      this.channel.send(JSON.stringify(message));
+    } catch (error) {
+      console.error("fluxshare:transfer", "failed to send control", error);
+    }
+  }
+
+  private cancelActiveSessions(reason?: string) {
+    if (this.sendSession) {
+      const session = this.sendSession;
+      this.emitter.emit("transfer-cancelled", {
+        peerId: this.peerId,
+        direction: "send",
+        meta: session.meta,
+        transferId: session.meta.id,
+        startedAt: session.startedAt,
+        reason,
+      });
+      this.cleanupSend();
+    }
+    if (this.receiveSession) {
+      const session = this.receiveSession;
+      this.emitter.emit("transfer-cancelled", {
+        peerId: this.peerId,
+        direction: "receive",
+        meta: session.meta,
+        transferId: session.meta.id,
+        startedAt: session.startedAt,
+        reason,
+      });
+      this.cleanupReceive();
+    }
+  }
+
+  private cleanupSend() {
+    if (!this.sendSession) return;
+    this.sendSession.source.onDispose?.();
+    this.sendSession = null;
+  }
+
+  private cleanupReceive() {
+    this.receiveSession = null;
+  }
+}
+
+export class TransferService {
+  private readonly emitter = new EventEmitter();
+  private readonly peers = new Map<string, PeerChannelController>();
+
+  on = this.emitter.on.bind(this.emitter);
+  off = this.emitter.off.bind(this.emitter);
+
+  registerPeer(peerId: string, channel: RTCDataChannel) {
+    this.unregisterPeer(peerId);
+    const controller = new PeerChannelController(peerId, channel, this.emitter);
+    this.peers.set(peerId, controller);
+    return controller;
+  }
+
+  unregisterPeer(peerId: string) {
+    const existing = this.peers.get(peerId);
+    if (existing) {
+      existing.dispose();
+      this.peers.delete(peerId);
+    }
+  }
+
+  async sendToPeer(peerId: string, source: TransferSource, chunkSize = DEFAULT_CHUNK_SIZE) {
+    const controller = this.peers.get(peerId);
+    if (!controller) {
+      throw new Error(`Peer ${peerId} não registrado`);
+    }
+    await controller.sendFile(source, chunkSize);
+  }
+
+  cancel(peerId: string, transferId: string, reason?: string) {
+    const controller = this.peers.get(peerId);
+    controller?.cancelTransfer(transferId, reason);
+  }
+
+  dispose() {
+    this.peers.forEach((controller) => controller.dispose());
+    this.peers.clear();
+  }
+}
+
+export default TransferService;
diff --git a/apps/client/src/lib/webrtc/transfer.ts b/apps/client/src/lib/webrtc/transfer.ts
deleted file mode 100644
index eb5ba12ffc2331a81027bbcc681db3d679844dfa..0000000000000000000000000000000000000000
--- a/apps/client/src/lib/webrtc/transfer.ts
+++ /dev/null
@@ -1,294 +0,0 @@
-export const CHUNK_SIZE = 16_384;
-export const BACKPRESSURE_HIGH = 8_000_000;
-export const BACKPRESSURE_LOW = 1_000_000;
-
-export type TransferManifest = {
-  type: "MANIFEST";
-  fileId: string;
-  name: string;
-  size: number;
-  mime?: string;
-  chunkSize: number;
-  totalChunks: number;
-};
-
-export type TransferAck = { type: "ACK"; nextChunkIndex: number };
-export type TransferDone = { type: "DONE" };
-export type TransferCancel = { type: "CANCEL"; reason?: string };
-export type TransferResumeRequest = {
-  type: "RESUME_REQ";
-  fileId: string;
-  haveUntilChunk: number;
-};
-export type TransferResumeOk = { type: "RESUME_OK"; startFrom: number };
-
-export type ControlMessage =
-  | TransferManifest
-  | TransferAck
-  | TransferDone
-  | TransferCancel
-  | TransferResumeRequest
-  | TransferResumeOk;
-
-export type TransferEventMap = {
-  progress: { fileId: string; bytesSent: number; totalBytes: number; chunkIndex: number };
-  completed: { fileId: string };
-  cancelled: { fileId: string; reason?: string };
-  error: { fileId: string; error: Error };
-  "chunk-received": { fileId: string; chunkIndex: number; chunk: ArrayBuffer };
-  manifest: { manifest: TransferManifest };
-};
-
-export type TransferEvent = keyof TransferEventMap;
-
-class TransferEmitter {
-  private listeners = new Map<TransferEvent, Set<(payload: any) => void>>();
-
-  on<T extends TransferEvent>(event: T, handler: (payload: TransferEventMap[T]) => void) {
-    if (!this.listeners.has(event)) {
-      this.listeners.set(event, new Set());
-    }
-    this.listeners.get(event)!.add(handler as any);
-    return () => this.off(event, handler as any);
-  }
-
-  off<T extends TransferEvent>(event: T, handler: (payload: TransferEventMap[T]) => void) {
-    this.listeners.get(event)?.delete(handler as any);
-  }
-
-  emit<T extends TransferEvent>(event: T, payload: TransferEventMap[T]) {
-    this.listeners.get(event)?.forEach((listener) => {
-      try {
-        listener(payload);
-      } catch (error) {
-        console.error("fluxshare:transfer:listener", error);
-      }
-    });
-  }
-}
-
-export interface ChunkProvider {
-  getChunk(index: number): Promise<ArrayBuffer>;
-}
-
-export interface ChunkWriter {
-  (index: number, chunk: ArrayBuffer): Promise<void> | void;
-}
-
-export class FileSender {
-  private readonly channel: RTCDataChannel;
-  private readonly emitter = new TransferEmitter();
-  private manifest: TransferManifest | null = null;
-  private provider: ChunkProvider | null = null;
-  private nextIndex = 0;
-  private sending = false;
-
-  constructor(channel: RTCDataChannel) {
-    this.channel = channel;
-    this.channel.addEventListener("message", (event) => {
-      if (typeof event.data === "string") {
-        const message = parseControlMessage(event.data);
-        if (message) {
-          this.handleControl(message);
-        }
-      }
-    });
-  }
-
-  on = this.emitter.on.bind(this.emitter);
-  off = this.emitter.off.bind(this.emitter);
-
-  async start(manifest: TransferManifest, provider: ChunkProvider) {
-    this.manifest = manifest;
-    this.provider = provider;
-    this.nextIndex = 0;
-    this.sending = true;
-    this.sendControl(manifest);
-  }
-
-  cancel(reason?: string) {
-    this.sendControl({ type: "CANCEL", reason });
-    this.sending = false;
-  }
-
-  private async handleControl(message: ControlMessage) {
-    if (!this.manifest) {
-      return;
-    }
-    switch (message.type) {
-      case "ACK": {
-        this.nextIndex = message.nextChunkIndex;
-        await this.sendChunks();
-        break;
-      }
-      case "CANCEL": {
-        this.sending = false;
-        this.emitter.emit("cancelled", { fileId: this.manifest.fileId, reason: message.reason });
-        break;
-      }
-      case "RESUME_REQ": {
-        this.nextIndex = message.haveUntilChunk;
-        this.sendControl({ type: "RESUME_OK", startFrom: this.nextIndex });
-        await this.sendChunks();
-        break;
-      }
-      default:
-        break;
-    }
-  }
-
-  private async sendChunks() {
-    if (!this.manifest || !this.provider || !this.sending) return;
-    for (let index = this.nextIndex; index < this.manifest.totalChunks; index += 1) {
-      if (!this.sending) {
-        this.nextIndex = index;
-        return;
-      }
-      const chunk = await this.provider.getChunk(index);
-      await this.waitForBackpressure();
-      this.channel.send(chunk);
-      this.emitter.emit("progress", {
-        fileId: this.manifest.fileId,
-        bytesSent: Math.min((index + 1) * this.manifest.chunkSize, this.manifest.size),
-        totalBytes: this.manifest.size,
-        chunkIndex: index,
-      });
-      this.nextIndex = index + 1;
-    }
-    this.sendControl({ type: "DONE" });
-    this.emitter.emit("completed", { fileId: this.manifest.fileId });
-    this.sending = false;
-  }
-
-  private waitForBackpressure(): Promise<void> {
-    if (this.channel.bufferedAmount <= BACKPRESSURE_HIGH) {
-      return Promise.resolve();
-    }
-    return new Promise((resolve) => {
-      const listener = () => {
-        if (this.channel.bufferedAmount <= BACKPRESSURE_LOW) {
-          this.channel.removeEventListener("bufferedamountlow", listener);
-          resolve();
-        }
-      };
-      this.channel.addEventListener("bufferedamountlow", listener);
-    });
-  }
-
-  private sendControl(message: ControlMessage) {
-    this.channel.send(JSON.stringify(message));
-  }
-}
-
-export class FileReceiver {
-  private readonly channel: RTCDataChannel;
-  private readonly emitter = new TransferEmitter();
-  private writer: ChunkWriter | null = null;
-  private manifest: TransferManifest | null = null;
-  private chunkCounter = 0;
-  private bytesReceived = 0;
-
-  constructor(channel: RTCDataChannel) {
-    this.channel = channel;
-    this.channel.addEventListener("message", (event) => {
-      if (typeof event.data === "string") {
-        const control = parseControlMessage(event.data);
-        if (control) {
-          this.handleControl(control);
-        }
-      } else if (event.data instanceof ArrayBuffer) {
-        this.handleChunk(event.data);
-      } else if (event.data instanceof Blob) {
-        event.data.arrayBuffer().then((buffer) => this.handleChunk(buffer));
-      }
-    });
-  }
-
-  on = this.emitter.on.bind(this.emitter);
-  off = this.emitter.off.bind(this.emitter);
-
-  async setWriter(writer: ChunkWriter) {
-    this.writer = writer;
-  }
-
-  private async handleControl(message: ControlMessage) {
-    switch (message.type) {
-      case "MANIFEST": {
-        this.manifest = message;
-        this.chunkCounter = 0;
-        this.bytesReceived = 0;
-        this.emitter.emit("manifest", { manifest: message });
-        this.sendControl({ type: "ACK", nextChunkIndex: 0 });
-        break;
-      }
-      case "DONE": {
-        if (this.manifest) {
-          this.emitter.emit("completed", { fileId: this.manifest.fileId });
-        }
-        break;
-      }
-      case "CANCEL": {
-        if (this.manifest) {
-          this.emitter.emit("cancelled", { fileId: this.manifest.fileId, reason: message.reason });
-        }
-        break;
-      }
-      case "RESUME_OK": {
-        this.chunkCounter = message.startFrom;
-        this.bytesReceived = message.startFrom * (this.manifest?.chunkSize ?? 0);
-        break;
-      }
-      default:
-        break;
-    }
-  }
-
-  private async handleChunk(chunk: ArrayBuffer) {
-    if (!this.manifest) return;
-    const index = this.chunkCounter;
-    this.chunkCounter += 1;
-    this.bytesReceived += chunk.byteLength;
-    if (this.writer) {
-      await this.writer(index, chunk);
-    }
-    this.emitter.emit("chunk-received", {
-      fileId: this.manifest.fileId,
-      chunkIndex: index,
-      chunk,
-    });
-    if (this.chunkCounter % 128 === 0 || this.chunkCounter >= this.manifest.totalChunks) {
-      this.sendControl({ type: "ACK", nextChunkIndex: this.chunkCounter });
-    }
-    if (this.chunkCounter >= this.manifest.totalChunks) {
-      this.sendControl({ type: "DONE" });
-      this.emitter.emit("completed", { fileId: this.manifest.fileId });
-    }
-  }
-
-  requestResume(haveUntilChunk: number) {
-    if (!this.manifest) return;
-    this.sendControl({ type: "RESUME_REQ", fileId: this.manifest.fileId, haveUntilChunk });
-  }
-
-  cancel(reason?: string) {
-    if (!this.manifest) return;
-    this.sendControl({ type: "CANCEL", reason });
-  }
-
-  private sendControl(message: ControlMessage) {
-    this.channel.send(JSON.stringify(message));
-  }
-}
-
-function parseControlMessage(data: string): ControlMessage | null {
-  try {
-    const parsed = JSON.parse(data);
-    if (!parsed || typeof parsed.type !== "string") {
-      return null;
-    }
-    return parsed as ControlMessage;
-  } catch (error) {
-    console.error("fluxshare:transfer", "invalid control message", error);
-    return null;
-  }
-}
diff --git a/apps/client/src/pages/Home.tsx b/apps/client/src/pages/Home.tsx
index aba6b0e13a1d18b57cdfc278921b5093efa04229..852a6b1d26725d583dc76d5f34cb2a9b6bc692cb 100644
--- a/apps/client/src/pages/Home.tsx
+++ b/apps/client/src/pages/Home.tsx
@@ -1,53 +1,51 @@
-import { FormEvent, useEffect, useState } from "react";
-import { useNavigate, useOutletContext } from "react-router-dom";
-import { nanoid } from "nanoid";
+import { FormEvent, useState } from "react";
+import { useNavigate } from "react-router-dom";
 import { Card } from "../components/ui/Card";
 import { Button } from "../components/ui/Button";
-import type { AppOutletContext } from "../App";
+import { useRoom } from "../state/useRoomStore";
 
 export function HomePage() {
   const [code, setCode] = useState("");
   const navigate = useNavigate();
-  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
-
-  useEffect(() => {
-    setHeaderInfo({});
-  }, [setHeaderInfo]);
+  const { createRoom, joinRoom } = useRoom();
 
   function handleSubmit(event: FormEvent) {
     event.preventDefault();
-    const trimmed = code.trim() || nanoid(6).toUpperCase();
-    navigate(`/room/${trimmed}`);
+    const trimmed = code.trim();
+    const result = trimmed ? joinRoom(trimmed) : createRoom();
+    if (result?.roomId) {
+      navigate(`/room/${result.roomId}`);
+    }
   }
 
   return (
     <div className="mx-auto max-w-xl">
       <Card className="space-y-6 p-6">
         <div className="space-y-2">
           <h1 className="text-3xl font-bold text-[var(--text)]">FluxShare</h1>
-          <p className="text-sm text-[var(--text-muted)]">
+          <p className="text-sm text-[var(--muted)]">
             Entre com um código de sala para iniciar uma sessão de compartilhamento P2P.
           </p>
         </div>
         <form onSubmit={handleSubmit} className="space-y-4">
           <div className="space-y-2">
-            <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
+            <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
               Código da sala
             </label>
             <input
-              className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
+              className="w-full rounded-2xl border border-[var(--border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2"
               value={code}
               onChange={(event) => setCode(event.target.value.toUpperCase())}
               placeholder="Ex: AB12CD"
             />
           </div>
           <Button type="submit" className="w-full">
             Entrar ou criar sala
           </Button>
         </form>
       </Card>
     </div>
   );
 }
 
 export default HomePage;
diff --git a/apps/client/src/pages/Room.tsx b/apps/client/src/pages/Room.tsx
index d03754390b334c1acbc489d3d343835c9a5941c8..8a699016fb400f4e59bf1152d9eed7fa898a7886 100644
--- a/apps/client/src/pages/Room.tsx
+++ b/apps/client/src/pages/Room.tsx
@@ -1,606 +1,653 @@
 import { useCallback, useEffect, useMemo, useRef, useState } from "react";
-import { useNavigate, useOutletContext, useParams } from "react-router-dom";
+import { useNavigate, useParams } from "react-router-dom";
 import { nanoid } from "nanoid";
-import PeersPanel from "../components/PeersPanel";
+import PeersPanel, { type PeerViewModel } from "../components/PeersPanel";
 import TransferBox from "../components/TransferBox";
-import { usePeersStore, PeerConnectionStatus } from "../store/usePeers";
-import { useTransfersStore } from "../store/useTransfers";
+import { useRoom, useRoomStore, type RoomPeer } from "../state/useRoomStore";
+import { useTransfersStore, type TransferState } from "../store/useTransfers";
 import { SignalingClient } from "../lib/signaling";
-import { PeerManager } from "../lib/webrtc/PeerManager";
-import { FileReceiver, FileSender, TransferManifest, CHUNK_SIZE } from "../lib/webrtc/transfer";
-import { getFileHandle, saveFileHandle, saveCheckpoint, getCheckpoint, clearCheckpoint } from "../lib/persist/indexeddb";
-import { isTauri, getFileInfo, readFileRange, writeFileRange } from "../lib/persist/tauri";
-import type { ChunkProvider } from "../lib/webrtc/transfer";
+import PeerManager, { type PeerConnectionState } from "../lib/rtc/PeerManager";
+import TransferService, { type TransferSource } from "../lib/transfer/TransferService";
+import { isTauri, getFileInfo, readFileRange } from "../lib/persist/tauri";
 import { Button } from "../components/ui/Button";
 import { Card } from "../components/ui/Card";
-import type { AppOutletContext } from "../App";
 
-import FileReaderWorker from "../workers/fileReader.worker?worker";
-
-interface PeerControllers {
-  channel: RTCDataChannel;
-  sender: FileSender;
-  receiver: FileReceiver;
-  provider?: ChunkProvider & { dispose?: () => void };
+interface SelectedFile {
+  id: string;
+  name: string;
+  size: number;
+  mime?: string;
+  source: "web" | "tauri";
+  file?: File;
+  path?: string;
 }
 
-type DownloadWriter =
-  | { type: "web"; writer: FileSystemWritableFileStream; handle: FileSystemFileHandle }
-  | { type: "tauri"; path: string };
+interface PeerTargetsOptions {
+  overridePeerId?: string;
+}
 
 function generateDisplayName() {
   const key = "fluxshare-display-name";
-  if (typeof localStorage !== "undefined") {
-    const stored = localStorage.getItem(key);
+  if (typeof window !== "undefined" && window.localStorage) {
+    const stored = window.localStorage.getItem(key);
     if (stored) return stored;
     const generated = `Peer-${nanoid(6)}`;
-    localStorage.setItem(key, generated);
+    window.localStorage.setItem(key, generated);
     return generated;
   }
   return `Peer-${nanoid(6)}`;
 }
 
 async function computeFileId(name: string, size: number, lastModified: number) {
   const encoder = new TextEncoder();
   const data = encoder.encode(`${name}:${size}:${lastModified}`);
   const hashBuffer = await crypto.subtle.digest("SHA-256", data);
   return Array.from(new Uint8Array(hashBuffer))
     .map((b) => b.toString(16).padStart(2, "0"))
     .join("");
 }
 
-function useRoomCode() {
-  const params = useParams<{ code: string }>();
-  return params.code ?? "";
+function mapConnectionState(
+  state: PeerConnectionState,
+  transfer?: TransferState,
+): { label: string; variant: "accent" | "accentSecondary" | "success" | "danger" | "neutral" } {
+  if (transfer && transfer.status === "transferring") {
+    return { label: "Transferindo", variant: "accent" };
+  }
+  switch (state) {
+    case "connected":
+      return { label: "Conectado", variant: "success" };
+    case "connecting":
+    case "new":
+      return { label: "Conectando", variant: "accentSecondary" };
+    case "failed":
+    case "disconnected":
+    case "closed":
+      return { label: "Desconectado", variant: "danger" };
+    default:
+      return { label: state, variant: "neutral" };
+  }
 }
 
-function createWebChunkProvider(fileId: string, handle: FileSystemFileHandle, chunkSize: number) {
-  const worker = new FileReaderWorker();
-  worker.postMessage({ type: "init", fileId, handle, chunkSize });
-  const pending = new Map<number, { resolve: (buffer: ArrayBuffer) => void; reject: (err: Error) => void }>();
-
-  worker.addEventListener("message", (event: MessageEvent) => {
-    const data = event.data;
-    if (!data) return;
-    if (data.type === "chunk" && data.fileId === fileId) {
-      const resolver = pending.get(data.index);
-      if (resolver) {
-        pending.delete(data.index);
-        resolver.resolve(data.buffer as ArrayBuffer);
-      }
-    }
-    if (data.type === "error" && data.fileId === fileId) {
-      const err = new Error(data.error ?? "unknown error");
-      pending.forEach((entry) => entry.reject(err));
-      pending.clear();
-    }
-  });
-
-  const provider: ChunkProvider & { dispose: () => void } = {
-    async getChunk(index: number) {
-      return new Promise<ArrayBuffer>((resolve, reject) => {
-        pending.set(index, { resolve, reject });
-        worker.postMessage({ type: "chunk", fileId, index });
-      });
-    },
-    dispose() {
-      worker.postMessage({ type: "release", fileId });
-      worker.terminate();
-      pending.clear();
-    },
+function buildTransferSource(file: SelectedFile, peerId: string): TransferSource {
+  const id = `${file.id}-${peerId}-${Date.now()}`;
+  const source: TransferSource = {
+    id,
+    name: file.name,
+    size: file.size,
+    mime: file.mime,
   };
-
-  return provider;
+  if (file.source === "web" && file.file) {
+    source.file = file.file;
+  } else if (file.source === "tauri" && file.path) {
+    source.createChunk = (start, length) => readFileRange(file.path!, start, length);
+  }
+  return source;
 }
 
-function createTauriChunkProvider(path: string, chunkSize: number) {
-  const provider: ChunkProvider = {
-    async getChunk(index: number) {
-      const start = index * chunkSize;
-      return readFileRange(path, start, chunkSize);
-    },
-  };
-  return provider;
+function getLatestTransferByPeer(transfers: Record<string, TransferState>): Map<string, TransferState> {
+  const map = new Map<string, TransferState>();
+  Object.values(transfers).forEach((transfer) => {
+    const existing = map.get(transfer.peerId);
+    if (!existing || existing.updatedAt < transfer.updatedAt) {
+      map.set(transfer.peerId, transfer);
+    }
+  });
+  return map;
 }
 
 export function RoomPage() {
-  const code = useRoomCode();
+  const params = useParams<{ code: string }>();
   const navigate = useNavigate();
-  const [displayName] = useState(() => generateDisplayName());
-  const selectedFile = useTransfersStore((state) => state.selectedFile);
-  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
+  const { roomId, selfPeerId, peers, peerConnections, joinRoom, leaveRoom, copyInviteLink } = useRoom();
+  const transfers = useTransfersStore((state) => state.transfers);
+  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
+  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
+  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);
+  const displayName = useMemo(() => generateDisplayName(), []);
+
   const signalingRef = useRef<SignalingClient | null>(null);
   const peerManagerRef = useRef<PeerManager | null>(null);
-  const controllersRef = useRef(new Map<string, PeerControllers>());
-  const pendingSendRef = useRef(new Map<string, { manifest: TransferManifest; provider: ChunkProvider & { dispose?: () => void } }>());
-  const handlesRef = useRef(new Map<string, FileSystemFileHandle>());
-  const downloadWritersRef = useRef(new Map<string, DownloadWriter>());
+  const transferServiceRef = useRef<TransferService | null>(null);
+  const registeredPeersRef = useRef(new Set<string>());
+  const pendingSendsRef = useRef(new Map<string, TransferSource[]>());
 
   useEffect(() => {
+    if (selectedPeerId && !peers.some((peer) => peer.peerId === selectedPeerId)) {
+      setSelectedPeerId(null);
+    }
+  }, [peers, selectedPeerId]);
+
+  useEffect(() => {
+    const code = params.code;
     if (!code) {
       navigate("/");
       return;
     }
-    const signaling = new SignalingClient({ room: code, displayName });
-    signalingRef.current = signaling;
+    joinRoom(code);
+  }, [joinRoom, navigate, params.code]);
+
+  useEffect(() => {
+    if (!roomId) return;
+    const myPeerId = useRoomStore.getState().ensureSelfPeerId();
+    const signaling = new SignalingClient({ room: roomId, displayName, peerId: myPeerId });
     const peerManager = new PeerManager(signaling);
+    const transferService = new TransferService();
+    signalingRef.current = signaling;
     peerManagerRef.current = peerManager;
-    usePeersStore.getState().reset();
+    transferServiceRef.current = transferService;
 
     const unsubscribers: Array<() => void> = [];
 
     unsubscribers.push(
-      signaling.on("peers", (peers) => {
-        const items = peers.map((peer) => ({
+      signaling.on("peers", (peerList) => {
+        const store = useRoomStore.getState();
+        const otherPeers = peerList.filter((peer) => peer.peerId !== signaling.peerId);
+        const mapped: RoomPeer[] = otherPeers.map((peer) => ({
           peerId: peer.peerId,
           displayName: peer.displayName,
-          status: "idle" as const,
-          lastUpdated: Date.now(),
+          status: "idle",
+          joinedAt: Date.now(),
         }));
-        usePeersStore.getState().setPeers(items);
+        store.setPeers(mapped);
       }),
     );
 
     unsubscribers.push(
       signaling.on("peer-joined", (peer) => {
-        usePeersStore.getState().upsertPeer({
+        const store = useRoomStore.getState();
+        store.upsertPeer({
           peerId: peer.peerId,
           displayName: peer.displayName,
           status: "idle",
-          lastUpdated: Date.now(),
+          joinedAt: Date.now(),
         });
       }),
     );
 
     unsubscribers.push(
       signaling.on("peer-left", ({ peerId }) => {
-        usePeersStore.getState().removePeer(peerId);
-        const controller = controllersRef.current.get(peerId);
-        if (controller) {
-          controller.provider?.dispose?.();
-          controllersRef.current.delete(peerId);
-        }
+        const store = useRoomStore.getState();
+        store.removePeer(peerId);
+        store.removePeerConnection(peerId);
+        registeredPeersRef.current.delete(peerId);
+        pendingSendsRef.current.delete(peerId);
+        transferService.unregisterPeer(peerId);
       }),
     );
 
-    unsubscribers.push(
+    const peerUnsubs: Array<() => void> = [];
+
+    peerUnsubs.push(
       peerManager.on("connection-state", ({ peerId, state }) => {
-        const statusMap: Record<string, PeerConnectionStatus> = {
-          new: "connecting",
-          connecting: "connecting",
-          connected: "connected",
-          disconnected: "disconnected",
-          failed: "failed",
-          closed: "disconnected",
-        };
-        usePeersStore.getState().updatePeerState(peerId, { status: statusMap[state] ?? "idle" });
+        const store = useRoomStore.getState();
+        const existing = store.peers.find((peer) => peer.peerId === peerId);
+        store.upsertPeer({
+          peerId,
+          displayName: existing?.displayName ?? peerId,
+          status: state,
+          iceState: existing?.iceState,
+          joinedAt: existing?.joinedAt ?? Date.now(),
+        });
+        store.setPeerConnection(peerId, {
+          peerId,
+          state,
+          iceState: existing?.iceState,
+          updatedAt: Date.now(),
+        });
+        if (state === "connected") {
+          const queue = pendingSendsRef.current.get(peerId);
+          if (queue && queue.length > 0) {
+            pendingSendsRef.current.delete(peerId);
+            queue.forEach((source) => {
+              transferService.sendToPeer(peerId, source).catch((error) => {
+                console.error("fluxshare:transfer", "failed queued send", error);
+                useTransfersStore.getState().upsertTransfer({
+                  fileId: source.id!,
+                  peerId,
+                  direction: "send",
+                  bytesTransferred: 0,
+                  totalBytes: source.size,
+                  status: "error",
+                  startedAt: Date.now(),
+                  updatedAt: Date.now(),
+                  error: error instanceof Error ? error.message : String(error),
+                  fileName: source.name,
+                  mime: source.mime,
+                });
+              });
+            });
+          }
+        }
+        if (state === "failed" || state === "disconnected" || state === "closed") {
+          registeredPeersRef.current.delete(peerId);
+        }
       }),
     );
 
-    unsubscribers.push(
+    peerUnsubs.push(
+      peerManager.on("ice-connection-state", ({ peerId, state }) => {
+        const store = useRoomStore.getState();
+        const existing = store.peers.find((peer) => peer.peerId === peerId);
+        if (existing) {
+          store.upsertPeer({
+            peerId,
+            displayName: existing.displayName,
+            status: existing.status,
+            iceState: state,
+            joinedAt: existing.joinedAt,
+          });
+        }
+        const connection = store.peerConnections[peerId];
+        store.setPeerConnection(peerId, {
+          peerId,
+          state: connection?.state ?? "new",
+          iceState: state,
+          updatedAt: Date.now(),
+        });
+      }),
+    );
+
+    peerUnsubs.push(
       peerManager.on("data-channel", ({ peerId, channel }) => {
-        setupPeerChannel(peerId, channel);
+        transferService.registerPeer(peerId, channel);
+        registeredPeersRef.current.add(peerId);
+        const queue = pendingSendsRef.current.get(peerId);
+        if (queue && queue.length > 0) {
+          pendingSendsRef.current.delete(peerId);
+          queue.forEach((source) => {
+            transferService.sendToPeer(peerId, source).catch((error) => {
+              console.error("fluxshare:transfer", "failed queued send", error);
+              useTransfersStore.getState().upsertTransfer({
+                fileId: source.id!,
+                peerId,
+                direction: "send",
+                bytesTransferred: 0,
+                totalBytes: source.size,
+                status: "error",
+                startedAt: Date.now(),
+                updatedAt: Date.now(),
+                error: error instanceof Error ? error.message : String(error),
+                fileName: source.name,
+                mime: source.mime,
+              });
+            });
+          });
+        }
+      }),
+    );
+
+    peerUnsubs.push(
+      peerManager.on("peer-removed", ({ peerId }) => {
+        transferService.unregisterPeer(peerId);
+        registeredPeersRef.current.delete(peerId);
+        const store = useRoomStore.getState();
+        store.removePeerConnection(peerId);
+      }),
+    );
+
+    const transferUnsubs: Array<() => void> = [];
+
+    transferUnsubs.push(
+      transferService.on("transfer-started", (event) => {
+        useTransfersStore.getState().upsertTransfer({
+          fileId: event.transferId,
+          peerId: event.peerId,
+          direction: event.direction,
+          bytesTransferred: 0,
+          totalBytes: event.meta.size,
+          status: "transferring",
+          startedAt: event.startedAt,
+          updatedAt: event.startedAt,
+          fileName: event.meta.name,
+          mime: event.meta.mime,
+        });
+      }),
+    );
+
+    transferUnsubs.push(
+      transferService.on("transfer-progress", (event) => {
+        useTransfersStore.getState().updateTransfer(event.transferId, {
+          bytesTransferred: event.bytesTransferred,
+          totalBytes: event.totalBytes,
+        });
+      }),
+    );
+
+    transferUnsubs.push(
+      transferService.on("transfer-completed", (event) => {
+        useTransfersStore.getState().updateTransfer(event.transferId, {
+          status: "completed",
+          downloadUrl: event.fileUrl,
+          savePath: event.savePath,
+        });
+      }),
+    );
+
+    transferUnsubs.push(
+      transferService.on("transfer-cancelled", (event) => {
+        useTransfersStore.getState().updateTransfer(event.transferId, {
+          status: "cancelled",
+          error: event.reason,
+        });
+      }),
+    );
+
+    transferUnsubs.push(
+      transferService.on("transfer-error", (event) => {
+        useTransfersStore.getState().updateTransfer(event.transferId, {
+          status: "error",
+          error: event.error.message,
+        });
       }),
     );
 
     signaling.connect();
 
     return () => {
+      transferUnsubs.forEach((fn) => fn());
+      peerUnsubs.forEach((fn) => fn());
       unsubscribers.forEach((fn) => fn());
+      transferService.dispose();
+      peerManager.dispose();
       signaling.disconnect();
-      controllersRef.current.forEach((controller) => controller.provider?.dispose?.());
-      controllersRef.current.clear();
-      pendingSendRef.current.clear();
-      handlesRef.current.clear();
-      downloadWritersRef.current.forEach((writer) => {
-        if (writer.type === "web") {
-          void writer.writer.close();
-        }
-      });
-      downloadWritersRef.current.clear();
+      transferServiceRef.current = null;
+      peerManagerRef.current = null;
+      signalingRef.current = null;
+      registeredPeersRef.current.clear();
+      pendingSendsRef.current.clear();
     };
-    // eslint-disable-next-line react-hooks/exhaustive-deps
-  }, [code, displayName]);
-
-  useEffect(() => {
-    const selected = selectedFile;
-    if (!selected) return;
-    if (selected.source === "web" && !handlesRef.current.has(selected.fileId)) {
-      getFileHandle(selected.fileId).then((handle) => {
-        if (handle) {
-          handlesRef.current.set(selected.fileId, handle);
-        }
-      });
-    }
-  }, [selectedFile]);
-
-  function setupPeerChannel(peerId: string, channel: RTCDataChannel) {
-    const sender = new FileSender(channel);
-    const receiver = new FileReceiver(channel);
-    const entry: PeerControllers = { channel, sender, receiver };
-    controllersRef.current.set(peerId, entry);
-
-    sender.on("progress", ({ fileId, bytesSent, totalBytes }) => {
-      useTransfersStore.getState().updateTransfer(fileId, {
-        bytesTransferred: bytesSent,
-        totalBytes,
-        status: "transferring",
-      });
-    });
-
-    sender.on("completed", ({ fileId }) => {
-      useTransfersStore.getState().updateTransfer(fileId, {
-        status: "completed",
-        bytesTransferred: useTransfersStore.getState().transfers[fileId]?.totalBytes ?? 0,
-      });
-      pendingSendRef.current.delete(peerId);
-      entry.provider?.dispose?.();
-    });
+  }, [displayName, roomId]);
 
-    sender.on("cancelled", ({ fileId }) => {
-      useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
-      entry.provider?.dispose?.();
-    });
+  const determineTargets = useCallback(
+    ({ overridePeerId }: PeerTargetsOptions = {}): string[] => {
+      if (overridePeerId) return [overridePeerId];
+      if (selectedPeerId) return [selectedPeerId];
+      return peers.filter((peer) => peer.peerId !== selfPeerId).map((peer) => peer.peerId);
+    },
+    [peers, selectedPeerId, selfPeerId],
+  );
 
-    receiver.on("manifest", async ({ manifest }) => {
-      const checkpoint = await getCheckpoint(manifest.fileId).catch(() => undefined);
-      const existing = useTransfersStore.getState().transfers[manifest.fileId];
-      let targetHandleKey = existing?.targetHandleKey;
-      let startBytes = checkpoint?.receivedBytes ?? 0;
-
-      if (isTauri()) {
-        if (!targetHandleKey) {
-          const { save } = await import("@tauri-apps/api/dialog");
-          const target = await save({ defaultPath: manifest.name });
-          if (!target) {
-            receiver.cancel("receiver-declined");
-            useTransfersStore.getState().updateTransfer(manifest.fileId, { status: "cancelled" });
-            return;
-          }
-          targetHandleKey = target;
-        }
-        downloadWritersRef.current.set(manifest.fileId, { type: "tauri", path: targetHandleKey });
+  const queueSendToPeer = useCallback(
+    (peerId: string, file: SelectedFile) => {
+      const transferService = transferServiceRef.current;
+      const peerManager = peerManagerRef.current;
+      if (!transferService || !peerManager) return;
+      const source = buildTransferSource(file, peerId);
+      setActiveTransferId(source.id ?? null);
+      if (registeredPeersRef.current.has(peerId)) {
+        transferService
+          .sendToPeer(peerId, source)
+          .catch((error) => {
+            console.error("fluxshare:transfer", "send failed", error);
+            useTransfersStore.getState().upsertTransfer({
+              fileId: source.id!,
+              peerId,
+              direction: "send",
+              bytesTransferred: 0,
+              totalBytes: source.size,
+              status: "error",
+              startedAt: Date.now(),
+              updatedAt: Date.now(),
+              error: error instanceof Error ? error.message : String(error),
+              fileName: source.name,
+              mime: source.mime,
+            });
+          });
       } else {
-        if (!("showSaveFilePicker" in window)) {
-          alert("Seu navegador não suporta salvar arquivos");
-          receiver.cancel("unsupported");
-          return;
-        }
-        const key = targetHandleKey ?? `${manifest.fileId}:recv`;
-        let handle = await getFileHandle(key);
-        if (!handle) {
-          handle = await (window as any).showSaveFilePicker({ suggestedName: manifest.name });
-          if (!handle) {
-            receiver.cancel("no-handle");
-            return;
-          }
-          await saveFileHandle(key, handle);
-        }
-        const writer = await handle.createWritable({ keepExistingData: true });
-        if (startBytes > 0) {
-          await writer.truncate(startBytes);
-          await writer.seek(startBytes);
-        }
-        downloadWritersRef.current.set(manifest.fileId, { type: "web", writer, handle });
-        targetHandleKey = key;
+        const queue = pendingSendsRef.current.get(peerId) ?? [];
+        queue.push(source);
+        pendingSendsRef.current.set(peerId, queue);
+        peerManager
+          .connectTo(peerId)
+          .catch((error) => console.error("fluxshare:peer-manager", "connect failed", error));
       }
+    },
+    [],
+  );
 
-      useTransfersStore.getState().upsertTransfer({
-        fileId: manifest.fileId,
-        peerId,
-        direction: "receive",
-        bytesTransferred: startBytes,
-        totalBytes: manifest.size,
-        status: "transferring",
-        startedAt: Date.now(),
-        updatedAt: Date.now(),
-        targetHandleKey,
-        fileName: manifest.name,
-      });
-
-      if (checkpoint && checkpoint.nextChunkIndex > 0) {
-        receiver.requestResume(checkpoint.nextChunkIndex);
-      }
-    });
-
-    receiver.on("chunk-received", async ({ fileId, chunkIndex, chunk }) => {
-      const writer = downloadWritersRef.current.get(fileId);
-      if (writer?.type === "web") {
-        await writer.writer.write(chunk);
-      } else if (writer?.type === "tauri") {
-        await writeFileRange(writer.path, chunkIndex * CHUNK_SIZE, new Uint8Array(chunk));
+  const sendFileToTargets = useCallback(
+    (file: SelectedFile, options: PeerTargetsOptions = {}) => {
+      const targets = determineTargets(options);
+      if (targets.length === 0) {
+        return;
       }
+      targets.forEach((peerId) => queueSendToPeer(peerId, file));
+    },
+    [determineTargets, queueSendToPeer],
+  );
 
-      const transfer = useTransfersStore.getState().transfers[fileId];
-      const nextBytes = transfer ? Math.min(transfer.totalBytes, (chunkIndex + 1) * CHUNK_SIZE) : (chunkIndex + 1) * CHUNK_SIZE;
-      useTransfersStore.getState().updateTransfer(fileId, {
-        bytesTransferred: nextBytes,
-      });
-      await saveCheckpoint({
-        fileId,
-        nextChunkIndex: chunkIndex + 1,
-        receivedBytes: nextBytes,
-        updatedAt: Date.now(),
-      });
-    });
-
-    receiver.on("completed", async ({ fileId }) => {
-      await finalizeDownload(fileId);
-      useTransfersStore.getState().updateTransfer(fileId, { status: "completed" });
-      await clearCheckpoint(fileId).catch(() => undefined);
-    });
-
-    receiver.on("cancelled", ({ fileId }) => {
-      finalizeDownload(fileId);
-      useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
-      clearCheckpoint(fileId).catch(() => undefined);
-    });
-
-    const pending = pendingSendRef.current.get(peerId);
-    if (pending) {
-      pendingSendRef.current.delete(peerId);
-      sender.start(pending.manifest, pending.provider);
-      entry.provider = pending.provider;
-    }
-  }
-
-  async function ensureHandle() {
-    const selected = useTransfersStore.getState().selectedFile;
-    if (selected?.source !== "web") return;
-    const fileId = selected.fileId;
-    if (handlesRef.current.has(fileId)) return;
-    const handle = await getFileHandle(fileId);
-    if (handle) {
-      handlesRef.current.set(fileId, handle);
-    }
-  }
+  const pickWebFile = useCallback(
+    () =>
+      new Promise<SelectedFile | null>((resolve) => {
+        const input = document.createElement("input");
+        input.type = "file";
+        input.multiple = false;
+        input.addEventListener("change", async () => {
+          const file = input.files?.[0];
+          if (!file) {
+            resolve(null);
+            return;
+          }
+          const id = await computeFileId(file.name, file.size, file.lastModified);
+          resolve({
+            id,
+            name: file.name,
+            size: file.size,
+            mime: file.type || undefined,
+            source: "web",
+            file,
+          });
+        });
+        input.click();
+      }),
+    [],
+  );
 
-  async function handlePickFile() {
-    if (isTauri()) {
+  const pickTauriFile = useCallback(async () => {
+    try {
       const { open } = await import("@tauri-apps/api/dialog");
       const selection = await open({ multiple: false });
-      if (!selection || Array.isArray(selection)) return;
+      if (!selection || Array.isArray(selection)) {
+        return null;
+      }
       const path = selection;
-      const name = path.split(/[\\/]/).pop() ?? "arquivo";
       const info = await getFileInfo(path);
-      const fileId = await computeFileId(name, info.size, info.createdAt ?? Date.now());
-    useTransfersStore.getState().setSelectedFile({
-      fileId,
-      name,
-      size: info.size,
-      source: "tauri",
-      handleKey: path,
-    });
-    useTransfersStore.getState().upsertTransfer({
-      fileId,
-      peerId: "",
-      direction: "send",
-      bytesTransferred: 0,
-      totalBytes: info.size,
-      status: "idle",
-      startedAt: Date.now(),
-      updatedAt: Date.now(),
-      fileName: name,
-    });
-      return;
-    }
-
-    if (!("showOpenFilePicker" in window)) {
-      alert("Seu navegador não suporta File System Access API");
-      return;
-    }
-
-    const [handle] = await (window as any).showOpenFilePicker({ multiple: false });
-    if (!handle) return;
-    const file = await handle.getFile();
-    const fileId = await computeFileId(file.name, file.size, file.lastModified);
-    handlesRef.current.set(fileId, handle);
-    await saveFileHandle(fileId, handle);
-    useTransfersStore.getState().setSelectedFile({
-      fileId,
-      name: file.name,
-      size: file.size,
-      mime: file.type,
-      lastModified: file.lastModified,
-      source: "web",
-      handleKey: fileId,
-    });
-    useTransfersStore.getState().upsertTransfer({
-      fileId,
-      peerId: "",
-      direction: "send",
-      bytesTransferred: 0,
-      totalBytes: file.size,
-      status: "idle",
-      startedAt: Date.now(),
-      updatedAt: Date.now(),
-      fileName: file.name,
-    });
-  }
-
-  async function handleConnect(peerId: string) {
-    const peerManager = peerManagerRef.current;
-    if (!peerManager) return;
-    usePeersStore.getState().updatePeerState(peerId, { status: "connecting" });
-    await peerManager.connectTo(peerId);
-  }
-
-  function handleDisconnect(peerId: string) {
-    peerManagerRef.current?.disconnect(peerId);
-    usePeersStore.getState().updatePeerState(peerId, { status: "disconnected" });
-    const controller = controllersRef.current.get(peerId);
-    if (controller) {
-      controller.provider?.dispose?.();
-      controllersRef.current.delete(peerId);
-    }
-  }
-
-  async function finalizeDownload(fileId: string) {
-    const writer = downloadWritersRef.current.get(fileId);
-    if (writer?.type === "web") {
-      await writer.writer.close();
+      const size = info.size ?? 0;
+      const name = path.split(/[\\/]/).pop() ?? "arquivo";
+      const id = await computeFileId(name, size, Date.now());
+      return {
+        id,
+        name,
+        size,
+        mime: undefined,
+        source: "tauri",
+        path,
+      } satisfies SelectedFile;
+    } catch (error) {
+      console.error("fluxshare:file", "tauri picker failed", error);
+      return null;
     }
-    downloadWritersRef.current.delete(fileId);
-  }
+  }, []);
+
+  const handlePickFile = useCallback(
+    async (overridePeerId?: string) => {
+      const file = isTauri() ? await pickTauriFile() : await pickWebFile();
+      if (!file) return;
+      setSelectedFile(file);
+      sendFileToTargets(file, { overridePeerId });
+    },
+    [pickTauriFile, pickWebFile, sendFileToTargets],
+  );
 
-  async function startSendToPeer(peerId: string) {
-    const selected = useTransfersStore.getState().selectedFile;
-    if (!selected) {
-      alert("Selecione um arquivo primeiro");
-      return;
-    }
-    await ensureHandle();
+  const latestTransfersByPeer = useMemo(() => getLatestTransferByPeer(transfers), [transfers]);
+
+  const peerItems: PeerViewModel[] = useMemo(() => {
+    return peers
+      .filter((peer) => peer.peerId !== selfPeerId)
+      .map((peer) => {
+        const connection = peerConnections[peer.peerId];
+        const transfer = latestTransfersByPeer.get(peer.peerId);
+        const badge = mapConnectionState(connection?.state ?? "new", transfer ?? undefined);
+        const transferInfo = transfer
+          ? {
+              status: transfer.status,
+              direction: transfer.direction,
+              bytesTransferred: transfer.bytesTransferred,
+              totalBytes: transfer.totalBytes,
+              updatedAt: transfer.updatedAt,
+            }
+          : undefined;
+        return {
+          peerId: peer.peerId,
+          displayName: peer.displayName,
+          connectionState: badge.label,
+          badgeVariant: badge.variant,
+          transfer: transferInfo,
+        } satisfies PeerViewModel;
+      });
+  }, [latestTransfersByPeer, peerConnections, peers, selfPeerId]);
 
-    let provider: ChunkProvider & { dispose?: () => void };
-    let manifest: TransferManifest;
+  const hasConnectedPeers = useMemo(
+    () => peerItems.some((item) => item.connectionState === "Conectado" || item.connectionState === "Transferindo"),
+    [peerItems],
+  );
 
-    if (selected.source === "web") {
-      const handle = handlesRef.current.get(selected.fileId);
-      if (!handle) {
-        alert("Não foi possível acessar o arquivo selecionado");
-        return;
+  const activeTransfer = activeTransferId ? transfers[activeTransferId] ?? null : null;
+  const selectedPeerTransfer = selectedPeerId ? latestTransfersByPeer.get(selectedPeerId) ?? null : null;
+  const transferForDisplay = activeTransfer ?? selectedPeerTransfer ?? null;
+  const transferBoxTransfer = transferForDisplay
+    ? {
+        id: transferForDisplay.fileId,
+        status: transferForDisplay.status,
+        direction: transferForDisplay.direction,
+        bytesTransferred: transferForDisplay.bytesTransferred,
+        totalBytes: transferForDisplay.totalBytes,
+        startedAt: transferForDisplay.startedAt,
+        updatedAt: transferForDisplay.updatedAt,
+        peerId: transferForDisplay.peerId,
       }
-      const file = await handle.getFile();
-      manifest = {
-        type: "MANIFEST",
-        fileId: selected.fileId,
-        name: file.name,
-        size: file.size,
-        mime: file.type,
-        chunkSize: CHUNK_SIZE,
-        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
+    : null;
+
+  const transferBoxFile = useMemo(() => {
+    if (transferForDisplay) {
+      const peerDisplay =
+        peerItems.find((item) => item.peerId === transferForDisplay.peerId)?.displayName ??
+        transferForDisplay.peerId;
+      const directionLabel = transferForDisplay.direction === "send" ? "Para" : "De";
+      const fallbackName =
+        transferForDisplay.direction === "receive" ? "Arquivo recebido" : "Arquivo";
+      return {
+        id: transferForDisplay.fileId,
+        name: transferForDisplay.fileName ?? selectedFile?.name ?? fallbackName,
+        size: transferForDisplay.totalBytes,
+        mime: transferForDisplay.mime,
+        targetLabel: `${directionLabel} ${peerDisplay}`,
       };
-      provider = createWebChunkProvider(selected.fileId, handle, CHUNK_SIZE);
-    } else {
-      const path = selected.handleKey;
-      const name = selected.name;
-      manifest = {
-        type: "MANIFEST",
-        fileId: selected.fileId,
-        name,
-        size: selected.size,
-        chunkSize: CHUNK_SIZE,
-        totalChunks: Math.ceil(selected.size / CHUNK_SIZE),
-      };
-      provider = createTauriChunkProvider(path, CHUNK_SIZE);
     }
+    return selectedFile;
+  }, [peerItems, selectedFile, transferForDisplay]);
 
-    const transferState = useTransfersStore.getState().transfers[selected.fileId];
-    if (transferState) {
-      useTransfersStore.getState().updateTransfer(selected.fileId, {
-        status: "transferring",
-        peerId,
-        startedAt: transferState.startedAt || Date.now(),
-      });
-    } else {
-      useTransfersStore.getState().upsertTransfer({
-        fileId: selected.fileId,
-        peerId,
-        direction: "send",
-        bytesTransferred: 0,
-        totalBytes: manifest.size,
-        status: "transferring",
-        startedAt: Date.now(),
-        updatedAt: Date.now(),
-      });
-    }
-
-    const controller = controllersRef.current.get(peerId);
-    if (controller) {
-      controller.provider?.dispose?.();
-      controller.provider = provider;
-      controller.sender.start(manifest, provider);
-    } else {
-      pendingSendRef.current.set(peerId, { manifest, provider });
-      peerManagerRef.current?.connectTo(peerId);
-    }
-  }
+  const handleConnectPeer = useCallback((peerId: string) => {
+    peerManagerRef.current?.connectTo(peerId).catch((error) => {
+      console.error("fluxshare:peer-manager", "connect error", error);
+    });
+  }, []);
 
-  function handlePeerCancel(peerId: string) {
-    const controller = controllersRef.current.get(peerId);
-    if (controller) {
-      controller.sender.cancel("cancelled-by-user");
-      controller.provider?.dispose?.();
-      controllersRef.current.delete(peerId);
-    }
-  }
+  const handleDisconnectPeer = useCallback((peerId: string) => {
+    peerManagerRef.current?.disconnect(peerId);
+    transferServiceRef.current?.unregisterPeer(peerId);
+    registeredPeersRef.current.delete(peerId);
+  }, []);
+
+  const handleSendToPeer = useCallback(
+    async (peerId: string) => {
+      if (selectedFile) {
+        queueSendToPeer(peerId, selectedFile);
+        return;
+      }
+      setSelectedPeerId(peerId);
+      await handlePickFile(peerId);
+    },
+    [handlePickFile, queueSendToPeer, selectedFile],
+  );
 
-  function handleCancelFile(fileId: string) {
-    const transfer = useTransfersStore.getState().transfers[fileId];
+  const handleCancelForPeer = useCallback((peerId: string) => {
+    const transfer = latestTransfersByPeer.get(peerId);
     if (!transfer) return;
-    if (transfer.peerId) {
-      handlePeerCancel(transfer.peerId);
+    transferServiceRef.current?.cancel(peerId, transfer.fileId, "Cancelado pelo usuário");
+    if (activeTransferId === transfer.fileId) {
+      setActiveTransferId(null);
     }
-    useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
-    clearCheckpoint(fileId).catch(() => undefined);
-  }
-
-  function handleResume(fileId: string) {
-    const transfer = useTransfersStore.getState().transfers[fileId];
-    if (!transfer || !transfer.peerId) return;
-    startSendToPeer(transfer.peerId);
-  }
+  }, [activeTransferId, latestTransfersByPeer]);
 
-  const inviteUrl = useMemo(() => {
-    if (typeof window === "undefined") return "";
-    return `${window.location.origin}/room/${code}`;
-  }, [code]);
+  const handleCancelTransfer = useCallback(
+    (peerId: string, transferId: string) => {
+      transferServiceRef.current?.cancel(peerId, transferId, "Cancelado pelo usuário");
+      if (activeTransferId === transferId) {
+        setActiveTransferId(null);
+      }
+    },
+    [activeTransferId],
+  );
 
-  const copyInvite = useCallback(() => {
-    if (typeof navigator !== "undefined" && navigator.clipboard) {
-      navigator.clipboard.writeText(inviteUrl).catch(() => undefined);
-    }
-  }, [inviteUrl]);
-
-  useEffect(() => {
-    setHeaderInfo({
-      roomCode: code,
-      inviteUrl,
-      onCopyInvite: copyInvite,
-    });
-    return () => setHeaderInfo({});
-  }, [code, inviteUrl, copyInvite, setHeaderInfo]);
+  const handleLeaveRoom = useCallback(async () => {
+    transferServiceRef.current?.dispose();
+    peerManagerRef.current?.dispose();
+    signalingRef.current?.disconnect();
+    transferServiceRef.current = null;
+    peerManagerRef.current = null;
+    signalingRef.current = null;
+    registeredPeersRef.current.clear();
+    pendingSendsRef.current.clear();
+    setSelectedFile(null);
+    setActiveTransferId(null);
+    useTransfersStore.getState().reset();
+    leaveRoom();
+    navigate("/");
+  }, [leaveRoom, navigate]);
 
   return (
-    <div className="space-y-8">
-      <Card className="space-y-4 p-6">
-        <div className="flex flex-wrap items-start justify-between gap-4">
-          <div className="space-y-2">
-            <h1 className="text-2xl font-bold text-[var(--text)]">Sala {code}</h1>
-            <p className="text-sm text-[var(--text-muted)]">
-              Compartilhe o link abaixo para convidar novos peers.
-            </p>
-          </div>
-          <Button
-            type="button"
-            variant="outline"
-            onClick={copyInvite}
-            title="Copiar link de convite para a área de transferência"
-          >
-            Copiar convite
+    <div className="space-y-6">
+      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
+        <div className="space-y-2">
+          <h1 className="text-2xl font-semibold text-[var(--text)]">Sala {roomId ?? params.code ?? "--"}</h1>
+          <p className="text-sm text-[var(--muted)]">
+            Você está conectado como <span className="font-medium text-[var(--text)]">{displayName}</span> ({selfPeerId || "--"})
+          </p>
+        </div>
+        <div className="flex flex-wrap gap-2">
+          <Button variant="outline" onClick={() => copyInviteLink()}>
+            Copiar link da sala
+          </Button>
+          <Button variant="danger" onClick={handleLeaveRoom}>
+            Sair da sala
           </Button>
         </div>
-        <button
-          type="button"
-          onClick={copyInvite}
-          title="Copiar link de convite para a área de transferência"
-          className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-left font-mono text-sm text-[var(--text)] transition hover:border-[var(--accent)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
-        >
-          {inviteUrl}
-        </button>
       </Card>
-      <div className="grid gap-6 lg:grid-cols-2">
-        <TransferBox onPickFile={handlePickFile} onResume={handleResume} onCancelFile={handleCancelFile} />
+
+      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
+        <TransferBox
+          file={transferBoxFile}
+          transfer={transferBoxTransfer}
+          onPickFile={() => handlePickFile()}
+          onCancel={handleCancelTransfer}
+          activeTransferId={activeTransferId}
+          hasConnectedPeers={hasConnectedPeers}
+        />
         <PeersPanel
-          selfPeerId={signalingRef.current?.peerId ?? ""}
-          onConnect={handleConnect}
-          onDisconnect={handleDisconnect}
-          onSend={startSendToPeer}
-          onCancel={handlePeerCancel}
+          selfPeerId={selfPeerId ?? "--"}
+          peers={peerItems}
+          selectedPeerId={selectedPeerId}
+          onSelect={(peerId) => setSelectedPeerId(peerId)}
+          onConnect={handleConnectPeer}
+          onDisconnect={handleDisconnectPeer}
+          onSend={handleSendToPeer}
+          onCancel={handleCancelForPeer}
         />
       </div>
     </div>
   );
 }
 
 export default RoomPage;
diff --git a/apps/client/src/state/useRoomStore.ts b/apps/client/src/state/useRoomStore.ts
new file mode 100644
index 0000000000000000000000000000000000000000..00257ab14f9bce10aab2f46f3a2d53cb9175fa2c
--- /dev/null
+++ b/apps/client/src/state/useRoomStore.ts
@@ -0,0 +1,231 @@
+import { nanoid } from "nanoid";
+import { create } from "zustand";
+import { persist, createJSONStorage } from "zustand/middleware";
+
+export type ThemeMode = "dark" | "light";
+
+export type PeerConnectionLifecycle =
+  | "new"
+  | "connecting"
+  | "connected"
+  | "disconnected"
+  | "failed"
+  | "closed";
+
+export interface RoomPeer {
+  peerId: string;
+  displayName: string;
+  joinedAt: number;
+  status: PeerConnectionLifecycle | "idle";
+  iceState?: RTCIceConnectionState;
+}
+
+export interface PeerConnectionSnapshot {
+  peerId: string;
+  state: PeerConnectionLifecycle;
+  channelState?: RTCDataChannelState;
+  iceState?: RTCIceConnectionState;
+  updatedAt: number;
+}
+
+interface RoomStoreState {
+  roomId: string | null;
+  selfPeerId: string | null;
+  peers: RoomPeer[];
+  peerConnections: Record<string, PeerConnectionSnapshot>;
+  theme: ThemeMode;
+  setTheme(theme: ThemeMode): void;
+  ensureSelfPeerId(): string;
+  setRoomId(roomId: string | null): void;
+  setPeers(peers: RoomPeer[]): void;
+  upsertPeer(peer: RoomPeer): void;
+  removePeer(peerId: string): void;
+  clearPeers(): void;
+  setPeerConnection(peerId: string, snapshot: PeerConnectionSnapshot): void;
+  removePeerConnection(peerId: string): void;
+  clearPeerConnections(): void;
+  resetRoomState(): void;
+}
+
+const fallbackStorage: Storage = {
+  length: 0,
+  clear: () => undefined,
+  getItem: () => null,
+  key: () => null,
+  removeItem: () => undefined,
+  setItem: () => undefined,
+};
+
+const storage = createJSONStorage<Pick<RoomStoreState, "roomId" | "selfPeerId" | "peers" | "peerConnections" | "theme">>(() => {
+  if (typeof window === "undefined") {
+    return fallbackStorage;
+  }
+  try {
+    return window.sessionStorage;
+  } catch (error) {
+    console.warn("fluxshare:room-store", "sessionStorage unavailable", error);
+    return fallbackStorage;
+  }
+});
+
+const defaultTheme: ThemeMode = (() => {
+  if (typeof window === "undefined") return "dark";
+  try {
+    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
+  } catch {
+    return "dark";
+  }
+})();
+
+export const useRoomStore = create<RoomStoreState>()(
+  persist(
+    (set, get) => ({
+      roomId: null,
+      selfPeerId: null,
+      peers: [],
+      peerConnections: {},
+      theme: defaultTheme,
+      setTheme: (theme) => set({ theme }),
+      ensureSelfPeerId: () => {
+        const existing = get().selfPeerId;
+        if (existing) {
+          return existing;
+        }
+        const next = nanoid(10).toUpperCase();
+        set({ selfPeerId: next });
+        return next;
+      },
+      setRoomId: (roomId) => set({ roomId }),
+      setPeers: (peers) => set({ peers }),
+      upsertPeer: (peer) =>
+        set((state) => {
+          const peers = state.peers.filter((entry) => entry.peerId !== peer.peerId);
+          return { peers: [...peers, peer] };
+        }),
+      removePeer: (peerId) =>
+        set((state) => ({ peers: state.peers.filter((peer) => peer.peerId !== peerId) })),
+      clearPeers: () => set({ peers: [] }),
+      setPeerConnection: (peerId, snapshot) =>
+        set((state) => ({
+          peerConnections: {
+            ...state.peerConnections,
+            [peerId]: { ...snapshot, peerId, updatedAt: Date.now() },
+          },
+        })),
+      removePeerConnection: (peerId) =>
+        set((state) => {
+          const { [peerId]: _removed, ...rest } = state.peerConnections;
+          return { peerConnections: rest };
+        }),
+      clearPeerConnections: () => set({ peerConnections: {} }),
+      resetRoomState: () =>
+        set((state) => ({
+          roomId: null,
+          peers: [],
+          peerConnections: {},
+          selfPeerId: state.selfPeerId ?? null,
+        })),
+    }),
+    {
+      name: "fluxshare-room",
+      storage,
+      partialize: (state) => ({
+        roomId: state.roomId,
+        selfPeerId: state.selfPeerId,
+        peers: state.peers,
+        peerConnections: state.peerConnections,
+        theme: state.theme,
+      }),
+    },
+  ),
+);
+
+type CopyInviteResult = { url: string | null; copied: boolean };
+
+function normalizeRoomId(roomId: string | null | undefined): string | null {
+  if (!roomId) return null;
+  const trimmed = roomId.trim();
+  if (!trimmed) return null;
+  return trimmed.toUpperCase();
+}
+
+function buildInviteUrl(roomId: string | null): string | null {
+  if (!roomId) return null;
+  if (typeof window === "undefined") return null;
+  const origin = window.location?.origin ?? "";
+  if (!origin) return null;
+  return `${origin.replace(/\/$/, "")}/room/${roomId}`;
+}
+
+export function useRoom() {
+  const roomId = useRoomStore((state) => state.roomId);
+  const selfPeerId = useRoomStore((state) => state.selfPeerId);
+  const peers = useRoomStore((state) => state.peers);
+  const peerConnections = useRoomStore((state) => state.peerConnections);
+  const theme = useRoomStore((state) => state.theme);
+  const setTheme = useRoomStore((state) => state.setTheme);
+
+  const createRoom = () => {
+    const state = useRoomStore.getState();
+    const normalizedSelf = state.ensureSelfPeerId();
+    const newRoom = nanoid(6).toUpperCase();
+    state.clearPeers();
+    state.clearPeerConnections();
+    state.setRoomId(newRoom);
+    return { roomId: newRoom, selfPeerId: normalizedSelf };
+  };
+
+  const joinRoom = (targetRoomId: string): { roomId: string; selfPeerId: string } | null => {
+    const normalized = normalizeRoomId(targetRoomId);
+    if (!normalized) {
+      return null;
+    }
+    const state = useRoomStore.getState();
+    const self = state.ensureSelfPeerId();
+    if (state.roomId !== normalized) {
+      state.clearPeers();
+      state.clearPeerConnections();
+    }
+    state.setRoomId(normalized);
+    return { roomId: normalized, selfPeerId: self };
+  };
+
+  const leaveRoom = () => {
+    const state = useRoomStore.getState();
+    state.resetRoomState();
+  };
+
+  const copyInviteLink = async (): Promise<CopyInviteResult> => {
+    const state = useRoomStore.getState();
+    const currentRoom = normalizeRoomId(state.roomId);
+    const url = buildInviteUrl(currentRoom);
+    if (!url) {
+      return { url: null, copied: false };
+    }
+    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
+      try {
+        await navigator.clipboard.writeText(url);
+        return { url, copied: true };
+      } catch (error) {
+        console.warn("fluxshare:room-store", "copy failed", error);
+        return { url, copied: false };
+      }
+    }
+    return { url, copied: false };
+  };
+
+  return {
+    roomId,
+    selfPeerId,
+    peers,
+    peerConnections,
+    theme,
+    setTheme,
+    createRoom,
+    joinRoom,
+    leaveRoom,
+    copyInviteLink,
+  };
+}
+
+export type UseRoomReturn = ReturnType<typeof useRoom>;
diff --git a/apps/client/src/store/useTransfers.ts b/apps/client/src/store/useTransfers.ts
index 2ea24ea1fb6ee12ec8afc3178bdf09f1e38d6250..0a3623fb2b3c10b78096fa35136f7cfd97abdbfa 100644
--- a/apps/client/src/store/useTransfers.ts
+++ b/apps/client/src/store/useTransfers.ts
@@ -3,50 +3,53 @@ import { persist, createJSONStorage } from "zustand/middleware";
 
 export type TransferDirection = "send" | "receive";
 
 export interface SelectedFileMeta {
   fileId: string;
   name: string;
   size: number;
   mime?: string;
   lastModified?: number;
   source: "web" | "tauri";
   handleKey: string;
 }
 
 export interface TransferState {
   fileId: string;
   peerId: string;
   direction: TransferDirection;
   bytesTransferred: number;
   totalBytes: number;
   status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
   startedAt: number;
   updatedAt: number;
   error?: string;
   targetHandleKey?: string;
   fileName?: string;
+  downloadUrl?: string;
+  savePath?: string;
+  mime?: string;
 }
 
 interface TransfersStore {
   selectedFile: SelectedFileMeta | null;
   transfers: Record<string, TransferState>;
   setSelectedFile(meta: SelectedFileMeta | null): void;
   upsertTransfer(transfer: TransferState): void;
   updateTransfer(fileId: string, patch: Partial<TransferState>): void;
   removeTransfer(fileId: string): void;
   reset(): void;
 }
 
 function broadcastState(state: Pick<TransfersStore, "selectedFile" | "transfers">) {
   if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
   const channel = new BroadcastChannel("fluxshare");
   channel.postMessage({ type: "transfers-update", state });
   channel.close();
 }
 
 type PersistedTransfersState = Pick<TransfersStore, "selectedFile" | "transfers">;
 
 const storage = createJSONStorage<PersistedTransfersState>(() => {
   if (typeof window === "undefined" || !window.localStorage) {
     const noopStorage: Storage = {
       length: 0,
diff --git a/apps/client/src/styles/theme.css b/apps/client/src/styles/theme.css
index 1529ac225b58fb60e387042db0c80c9c9fd1a55e..2bf487c691d4250063a74370410fb6db8ee6c9dc 100644
--- a/apps/client/src/styles/theme.css
+++ b/apps/client/src/styles/theme.css
@@ -1,111 +1,92 @@
-:root {
-  color-scheme: dark;
-  --bg: #0b0d12;
-  --bg-grad-1: #0b0d12;
-  --bg-grad-2: #111428;
-  --card: rgba(255, 255, 255, 0.06);
-  --card-border: rgba(255, 255, 255, 0.18);
-  --text: #e7e9ee;
-  --text-muted: #b6bcc8;
-  --accent: #7c3aed;
-  --accent-2: #3b82f6;
-  --ring: rgba(124, 58, 237, 0.5);
-}
-
-[data-theme="light"] {
-  color-scheme: light;
-  --bg: #f6f7fb;
-  --bg-grad-1: #f6f7fb;
-  --bg-grad-2: #eaeef7;
-  --card: rgba(255, 255, 255, 0.7);
-  --card-border: rgba(17, 17, 17, 0.08);
-  --text: #1c1f25;
-  --text-muted: #5b6473;
-  --accent: #6d28d9;
-  --accent-2: #2563eb;
-  --ring: rgba(37, 99, 235, 0.35);
-}
+@import "./tokens.css";
 
 html {
   font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
   background-color: var(--bg);
   color: var(--text);
+  transition: background-color 200ms ease, color 200ms ease;
 }
 
 body {
   margin: 0;
   min-height: 100vh;
-  background: radial-gradient(circle at top, var(--bg-grad-1), var(--bg-grad-2));
+  background:
+    radial-gradient(circle at top, rgba(124, 58, 237, 0.24), transparent 55%),
+    linear-gradient(160deg, var(--bg) 0%, var(--bg-soft) 100%);
   color: var(--text);
-  transition: background-color 200ms ease, color 200ms ease;
 }
 
 * {
   box-sizing: border-box;
 }
 
 a {
-  color: var(--accent-2);
+  color: var(--accent);
   text-decoration: none;
 }
 
 a:hover {
   text-decoration: underline;
 }
 
 button,
 input,
 textarea {
   font-family: inherit;
 }
 
 ::selection {
-  background: rgba(124, 58, 237, 0.35);
+  background: color-mix(in srgb, var(--primary) 35%, transparent);
   color: inherit;
 }
 
 .app-shell {
   position: relative;
   min-height: 100vh;
-  background: radial-gradient(circle at top, var(--bg-grad-1), var(--bg-grad-2));
+  background:
+    radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.32), transparent 58%),
+    radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.28), transparent 62%),
+    radial-gradient(circle at 50% 82%, rgba(124, 58, 237, 0.22), transparent 68%),
+    linear-gradient(155deg, var(--bg) 0%, var(--bg-soft) 100%);
   color: var(--text);
   isolation: isolate;
 }
 
 .app-shell__background {
   position: fixed;
   inset: 0;
   z-index: -1;
   pointer-events: none;
 }
 
 .app-shell__gradient {
   position: absolute;
   inset: -20%;
-  background: radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.25), transparent 55%),
-    radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.22), transparent 60%),
+  background:
+    radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.22), transparent 55%),
+    radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.2), transparent 60%),
     radial-gradient(circle at 50% 80%, rgba(124, 58, 237, 0.18), transparent 65%);
   filter: blur(90px);
   opacity: 0.9;
 }
 
 .app-shell__mesh {
   position: absolute;
   inset: 0;
-  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 45%, rgba(255, 255, 255, 0.04) 100%);
+  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 45%, rgba(255, 255, 255, 0.05) 100%);
   mix-blend-mode: screen;
   opacity: 0.35;
 }
 
 .app-shell__grid {
   position: absolute;
   inset: 0;
   background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
     linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
   background-size: 52px 52px;
-  opacity: 0.16;
+  opacity: 0.14;
 }
 
 .card-shadow {
   box-shadow: 0 25px 45px -25px rgba(15, 23, 42, 0.55);
 }
diff --git a/apps/client/src/styles/tokens.css b/apps/client/src/styles/tokens.css
new file mode 100644
index 0000000000000000000000000000000000000000..408d8b0a4bd7421122aa6874f2737ffa9713b3c8
--- /dev/null
+++ b/apps/client/src/styles/tokens.css
@@ -0,0 +1,27 @@
+:root {
+  color-scheme: dark;
+  --bg: #0b0f1a;
+  --bg-soft: #0f1424;
+  --card: rgba(255, 255, 255, 0.06);
+  --border: rgba(255, 255, 255, 0.16);
+  --primary: #7c3aed;
+  --primary-600: #6d28d9;
+  --accent: #8b5cf6;
+  --text: #e5e7eb;
+  --muted: #a3a3a3;
+  --dashed: rgba(229, 231, 235, 0.35);
+}
+
+.theme-light {
+  color-scheme: light;
+  --bg: #eceaf9;
+  --bg-soft: #f2f0ff;
+  --card: rgba(0, 0, 0, 0.06);
+  --border: rgba(0, 0, 0, 0.12);
+  --primary: #6d28d9;
+  --primary-600: #5b21b6;
+  --accent: #7c3aed;
+  --text: #111827;
+  --muted: #6b7280;
+  --dashed: rgba(17, 24, 39, 0.22);
+}
diff --git a/apps/client/tailwind.config.ts b/apps/client/tailwind.config.ts
index 03fa71375db1d5d28a0fff55498927919efd3f69..8818eb13fb722e09e8e2ccc9ee9e278092d25aad 100644
--- a/apps/client/tailwind.config.ts
+++ b/apps/client/tailwind.config.ts
@@ -1,21 +1,33 @@
 import type { Config } from "tailwindcss";
 
 const config: Config = {
   content: ["./index.html", "./src/**/*.{ts,tsx}"],
-  darkMode: ["class", "[data-theme='dark']"],
   theme: {
     extend: {
       colors: {
-        bg: "#0f1016",
-        surface: "#151826",
-        accent: {
-          DEFAULT: "#6c5ce7",
-          soft: "#4a47a3",
+        bg: "var(--bg)",
+        "bg-soft": "var(--bg-soft)",
+        card: "var(--card)",
+        border: "var(--border)",
+        primary: {
+          DEFAULT: "var(--primary)",
+          600: "var(--primary-600)",
         },
+        accent: "var(--accent)",
+        text: "var(--text)",
+        muted: "var(--muted)",
+        dashed: "var(--dashed)",
+      },
+      borderRadius: {
+        "2xl": "1.25rem",
+        "3xl": "1.75rem",
+      },
+      boxShadow: {
+        glass: "0 25px 45px -25px rgba(15, 23, 42, 0.55)",
       },
     },
   },
   plugins: [],
 };
 
 export default config;
 
EOF
)