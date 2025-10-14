 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/apps/client/src/App.tsx b/apps/client/src/App.tsx
index c1e3e742dd0944efc1d048be4509f63493935cae..44452e3a4a596a280f62e13d43f7e130cbcdecd5 100644
--- a/apps/client/src/App.tsx
+++ b/apps/client/src/App.tsx
@@ -1,20 +1,22 @@
 import { type Dispatch, type SetStateAction, useState } from "react";
 import { Outlet } from "react-router-dom";
 import AppShell, { type AppHeaderInfo } from "./components/AppShell";
 import { ThemeProvider } from "./components/ThemeProvider";
+import { ToastViewport } from "./components/ToastViewport";
 
 export interface AppOutletContext {
   setHeaderInfo: Dispatch<SetStateAction<AppHeaderInfo>>;
 }
 
 export default function App() {
   const [headerInfo, setHeaderInfo] = useState<AppHeaderInfo>({});
 
   return (
     <ThemeProvider>
       <AppShell headerInfo={headerInfo}>
         <Outlet context={{ setHeaderInfo }} />
       </AppShell>
+      <ToastViewport />
     </ThemeProvider>
   );
 }
diff --git a/apps/client/src/components/AppShell.tsx b/apps/client/src/components/AppShell.tsx
index e3d8893409c1ca22236f6b51cdc72e6564e52fc0..c03d2408d821a22e6e9bfbf6ab3b3dce2be7eff5 100644
--- a/apps/client/src/components/AppShell.tsx
+++ b/apps/client/src/components/AppShell.tsx
@@ -1,127 +1,150 @@
 import { useMemo, type ReactNode } from "react";
+import { NavLink } from "react-router-dom";
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
 
+const navItems = [
+  { to: "/", label: "Início" },
+  { to: "/tunnel", label: "Tunnel" },
+];
+
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
-      <header
-        className="sticky top-0 z-40 border-b border-[var(--card-border)]/60 bg-[var(--card)]/80 backdrop-blur-2xl"
-      >
+      <header className="sticky top-0 z-40 border-b border-[var(--card-border)]/60 bg-[var(--card)]/70 backdrop-blur-2xl">
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
+          <nav className="flex w-full items-center gap-2 sm:w-auto">
+            {navItems.map((item) => (
+              <NavLink
+                key={item.to}
+                to={item.to}
+                className={({ isActive }) =>
+                  cn(
+                    "rounded-full border border-transparent px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition", 
+                    "hover:text-[var(--text)]",
+                    isActive
+                      ? "border-[var(--card-border)]/80 bg-[var(--card)]/80 text-[var(--text)]"
+                      : "bg-transparent",
+                  )
+                }
+              >
+                {item.label}
+              </NavLink>
+            ))}
+          </nav>
         </div>
       </header>
       <main className={cn("mx-auto w-full max-w-6xl px-6 pb-16 pt-10", "text-[var(--text)]")}>{children}</main>
     </div>
   );
 }
 
 export default AppShell;
diff --git a/apps/client/src/components/ToastViewport.tsx b/apps/client/src/components/ToastViewport.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..3021944574fbcef612658037ceed44c96c43791d
--- /dev/null
+++ b/apps/client/src/components/ToastViewport.tsx
@@ -0,0 +1,66 @@
+import { useEffect, useState } from "react";
+import { createPortal } from "react-dom";
+import { useToastStore } from "../store/useToast";
+import { cn } from "../utils/cn";
+
+function CloseIcon() {
+  return (
+    <svg
+      viewBox="0 0 16 16"
+      fill="none"
+      stroke="currentColor"
+      strokeWidth={1.5}
+      className="h-3.5 w-3.5"
+      aria-hidden="true"
+    >
+      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 4.5 7 7m0-7-7 7" />
+    </svg>
+  );
+}
+
+export function ToastViewport() {
+  const toasts = useToastStore((state) => state.toasts);
+  const dismiss = useToastStore((state) => state.dismiss);
+  const [mounted, setMounted] = useState(false);
+
+  useEffect(() => {
+    setMounted(true);
+    return () => setMounted(false);
+  }, []);
+
+  if (!mounted) return null;
+
+  return createPortal(
+    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-3 sm:bottom-6 sm:right-6">
+      {toasts.map((toast) => (
+        <div
+          key={toast.id}
+          className={cn(
+            "pointer-events-auto rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/95 px-4 py-3 text-sm text-[var(--text)] shadow-lg backdrop-blur",
+            toast.variant === "info" && "border-[var(--accent-2)]/60",
+            toast.variant === "success" && "border-green-500/60",
+            toast.variant === "warning" && "border-amber-500/60",
+            toast.variant === "error" && "border-red-500/60",
+          )}
+        >
+          <div className="flex items-start gap-3">
+            <div className="flex-1">
+              <p className="leading-snug text-[var(--text)]">{toast.message}</p>
+            </div>
+            <button
+              type="button"
+              onClick={() => dismiss(toast.id)}
+              className="rounded-full p-1 text-[var(--text-muted)] transition hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
+              aria-label="Fechar notificação"
+            >
+              <CloseIcon />
+            </button>
+          </div>
+        </div>
+      ))}
+    </div>,
+    document.body,
+  );
+}
+
+export default ToastViewport;
diff --git a/apps/client/src/components/TransferBox.tsx b/apps/client/src/components/TransferBox.tsx
index 92b904d5d7e2062a6c5264429786b8644092743a..fcccfdbd5b92827bde0f8897d82a99ed87dba0bb 100644
--- a/apps/client/src/components/TransferBox.tsx
+++ b/apps/client/src/components/TransferBox.tsx
@@ -1,26 +1,27 @@
 import { useTransfersStore } from "../store/useTransfers";
+import { hasFallbackFile } from "../lib/file/selectFile";
 import { Badge, type BadgeProps } from "./ui/Badge";
 import { Button } from "./ui/Button";
 import { Card } from "./ui/Card";
 
 interface TransferBoxProps {
   onPickFile: () => Promise<void>;
   onResume: (fileId: string) => void;
   onCancelFile: (fileId: string) => void;
 }
 
 function formatBytes(bytes: number) {
   if (bytes === 0) return "0 B";
   const units = ["B", "KB", "MB", "GB", "TB"];
   const i = Math.floor(Math.log(bytes) / Math.log(1024));
   const value = bytes / Math.pow(1024, i);
   return `${value.toFixed(1)} ${units[i]}`;
 }
 
 function formatEta(seconds: number | null) {
   if (!seconds || seconds === Infinity) return "--";
   if (seconds < 60) return `${seconds.toFixed(0)}s`;
   const minutes = Math.floor(seconds / 60);
   const remaining = Math.floor(seconds % 60);
   return `${minutes}m ${remaining}s`;
 }
@@ -41,81 +42,91 @@ function resolveTransferBadge(status: string): { variant: BadgeProps["variant"];
   switch (status) {
     case "completed":
       return { variant: "success", label: "COMPLETED" };
     case "transferring":
       return { variant: "accent", label: "TRANSFERRING" };
     case "paused":
       return { variant: "accentSecondary", label: "PAUSED" };
     case "cancelled":
       return { variant: "danger", label: "CANCELLED" };
     case "error":
       return { variant: "danger", label: "ERROR" };
     default:
       return { variant: "neutral", label: status.toUpperCase() };
   }
 }
 
 export function TransferBox({ onPickFile, onResume, onCancelFile }: TransferBoxProps) {
   const { selectedFile, transfer } = useTransfersStore((state) => {
     const selected = state.selectedFile;
     return {
       selectedFile: selected,
       transfer: selected ? state.transfers[selected.fileId] ?? null : null,
     };
   });
 
+  const needsFallbackReselection =
+    selectedFile?.source === "web-fallback" && selectedFile.fileId
+      ? !hasFallbackFile(selectedFile.fileId)
+      : false;
+
   const totalBytes = transfer?.totalBytes ?? selectedFile?.size ?? 0;
   const transferBadge = transfer ? resolveTransferBadge(transfer.status) : null;
   const progressPercent = transfer
     ? Math.min(100, (transfer.bytesTransferred / Math.max(totalBytes, 1)) * 100)
     : 0;
   const elapsedSeconds = transfer ? (Date.now() - transfer.startedAt) / 1000 : null;
   const averageSpeed = transfer && elapsedSeconds && elapsedSeconds > 0
     ? transfer.bytesTransferred / elapsedSeconds
     : null;
   const eta = transfer && averageSpeed && averageSpeed > 0
     ? (transfer.totalBytes - transfer.bytesTransferred) / averageSpeed
     : null;
 
   return (
     <Card className="flex h-full flex-col gap-6 p-6">
       <div className="flex flex-wrap items-start justify-between gap-4">
         <div className="space-y-2">
           <div className="flex items-center gap-3">
             <h2 className="text-xl font-semibold text-[var(--text)]">Transferência</h2>
             {transferBadge && (
               <Badge variant={transferBadge.variant}>{transferBadge.label}</Badge>
             )}
           </div>
           <p className="text-sm text-[var(--text-muted)]">
             {selectedFile ? selectedFile.name : "Nenhum arquivo selecionado"}
           </p>
         </div>
         <Button type="button" onClick={() => onPickFile()}>
           Selecionar arquivo
         </Button>
       </div>
+      {needsFallbackReselection && (
+        <div className="rounded-2xl border border-dashed border-[var(--accent-2)]/60 bg-[var(--card)]/50 px-4 py-3 text-xs text-[var(--text-muted)]">
+          Modo compatível ativo – re-selecione o mesmo arquivo para retomar.
+        </div>
+      )}
       <div className="space-y-4">
         {selectedFile ? (
           <>
             <div className="grid gap-4 sm:grid-cols-2">
               <div className="space-y-1">
                 <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                   Tamanho
                 </span>
                 <p className="text-sm text-[var(--text)]">{formatBytes(selectedFile.size)}</p>
               </div>
               <div className="space-y-1">
                 <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                   Progresso
                 </span>
                 <p className="text-sm text-[var(--text)]">{progressPercent.toFixed(1)}%</p>
               </div>
             </div>
             <div className="space-y-2">
               <div
                 role="progressbar"
                 aria-valuenow={Math.round(progressPercent)}
                 aria-valuemin={0}
                 aria-valuemax={100}
                 className="h-3 w-full overflow-hidden rounded-full border border-[var(--card-border)]/60 bg-[var(--card)]/50"
               >
diff --git a/apps/client/src/index.tsx b/apps/client/src/index.tsx
index d667eac89b1e70302da4275918a6eee54c8a904e..706c7d1d4dd9e8330fc7f24c2d5b7720607fa158 100644
--- a/apps/client/src/index.tsx
+++ b/apps/client/src/index.tsx
@@ -1,25 +1,27 @@
 import React from "react";
 import ReactDOM from "react-dom/client";
 import { RouterProvider, createBrowserRouter } from "react-router-dom";
 import App from "./App";
 import HomePage from "./pages/Home";
 import RoomPage from "./pages/Room";
+import TunnelPage from "./pages/Tunnel";
 import "./styles/base.css";
 import "./styles/theme.css";
 
 const router = createBrowserRouter([
   {
     path: "/",
     element: <App />,
     children: [
       { index: true, element: <HomePage /> },
       { path: "room/:code", element: <RoomPage /> },
+      { path: "tunnel", element: <TunnelPage /> },
     ],
   },
 ]);
 
 ReactDOM.createRoot(document.getElementById("root")!).render(
   <React.StrictMode>
     <RouterProvider router={router} />
   </React.StrictMode>
 );
diff --git a/apps/client/src/lib/file/selectFile.ts b/apps/client/src/lib/file/selectFile.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d283d7af5b4742f3d8934c508c7b16d5329ed75b
--- /dev/null
+++ b/apps/client/src/lib/file/selectFile.ts
@@ -0,0 +1,123 @@
+import { saveFileHandle } from "../persist/indexeddb";
+import { toast } from "../../store/useToast";
+
+export interface WebSelectFileResult {
+  source: "web";
+  file: File;
+  fileId: string;
+  handle: FileSystemFileHandle;
+}
+
+export interface WebFallbackSelectFileResult {
+  source: "web-fallback";
+  file: File;
+  fileId: string;
+}
+
+export type SelectFileResult = WebSelectFileResult | WebFallbackSelectFileResult;
+
+const fallbackFiles = new Map<string, File>();
+
+export async function computeFileId(name: string, size: number, lastModified: number) {
+  const encoder = new TextEncoder();
+  const data = encoder.encode(`${name}:${size}:${lastModified}`);
+  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
+  return Array.from(new Uint8Array(hashBuffer))
+    .map((b) => b.toString(16).padStart(2, "0"))
+    .join("");
+}
+
+export function getFallbackFile(fileId: string) {
+  return fallbackFiles.get(fileId) ?? null;
+}
+
+export function hasFallbackFile(fileId: string) {
+  return fallbackFiles.has(fileId);
+}
+
+export function clearFallbackFile(fileId: string) {
+  fallbackFiles.delete(fileId);
+}
+
+export async function selectFile(): Promise<SelectFileResult | null> {
+  if (typeof window === "undefined") {
+    return null;
+  }
+
+  if ("showOpenFilePicker" in window) {
+    const [handle] = await (window as any).showOpenFilePicker({ multiple: false });
+    if (!handle) return null;
+    const file = await handle.getFile();
+    const fileId = await computeFileId(file.name, file.size, file.lastModified);
+    await saveFileHandle(fileId, handle).catch(() => undefined);
+    return { source: "web", file, fileId, handle };
+  }
+
+  const input = document.createElement("input");
+  input.type = "file";
+  input.style.position = "fixed";
+  input.style.top = "-1000px";
+  input.style.left = "-1000px";
+  input.style.width = "1px";
+  input.style.height = "1px";
+  input.style.opacity = "0";
+  input.setAttribute("tabindex", "-1");
+
+  return new Promise<SelectFileResult | null>((resolve) => {
+    let settled = false;
+
+    const finalize = (result: SelectFileResult | null) => {
+      if (settled) return;
+      settled = true;
+      cleanup();
+      resolve(result);
+    };
+
+    const cleanup = () => {
+      window.removeEventListener("focus", handleWindowFocus, true);
+      input.remove();
+    };
+
+    const handleWindowFocus = () => {
+      setTimeout(() => {
+        if (!settled && (!input.files || input.files.length === 0)) {
+          finalize(null);
+        }
+      }, 0);
+    };
+
+    input.addEventListener(
+      "change",
+      async () => {
+        const file = input.files?.[0];
+        if (!file) {
+          finalize(null);
+          return;
+        }
+        const fileId = await computeFileId(file.name, file.size, file.lastModified);
+        fallbackFiles.set(fileId, file);
+        toast({
+          message:
+            "Modo compatível ativado. Se recarregar a página, re-selecione o mesmo arquivo para continuar.",
+          variant: "info",
+          duration: 6000,
+        });
+        finalize({ source: "web-fallback", file, fileId });
+      },
+      { once: true },
+    );
+
+    input.addEventListener(
+      "cancel",
+      () => {
+        finalize(null);
+      },
+      { once: true },
+    );
+
+    window.addEventListener("focus", handleWindowFocus, { once: true, capture: true });
+
+    document.body.appendChild(input);
+    input.click();
+  });
+}
diff --git a/apps/client/src/lib/signaling.ts b/apps/client/src/lib/signaling.ts
index d5b4780e4c43419ff8e256916b333505a9cdfbf0..939abb4af9db78b58a9c9f011c0685a716ebcb09 100644
--- a/apps/client/src/lib/signaling.ts
+++ b/apps/client/src/lib/signaling.ts
@@ -1,26 +1,26 @@
-import { nanoid } from "nanoid";
+import { nanoid } from "@/utils/nanoid";
 import {
   SignalingClientMessage,
   SignalingHeartbeat,
   SignalingPeer,
   SignalingServerMessage,
   signalingServerMessageSchema,
 } from "../types/protocol";
 import { getEnv } from "../utils/env";
 
 export type SignalingEventMap = {
   open: void;
   close: { willReconnect: boolean };
   peers: SignalingPeer[];
   "peer-joined": SignalingPeer;
   "peer-left": { peerId: string };
   signal: { from: string; to: string; data: unknown };
   error: { error: Error };
 };
 
 export type SignalingEvent = keyof SignalingEventMap;
 
 const HEARTBEAT_INTERVAL = 10_000;
 const RECONNECT_DELAY = 2_000;
 
 class TypedEventEmitter {
diff --git a/apps/client/src/pages/Home.tsx b/apps/client/src/pages/Home.tsx
index aba6b0e13a1d18b57cdfc278921b5093efa04229..a4f727fdac56867509f199bb06f8de2ba98aeaaa 100644
--- a/apps/client/src/pages/Home.tsx
+++ b/apps/client/src/pages/Home.tsx
@@ -1,28 +1,28 @@
 import { FormEvent, useEffect, useState } from "react";
 import { useNavigate, useOutletContext } from "react-router-dom";
-import { nanoid } from "nanoid";
+import { nanoid } from "@/utils/nanoid";
 import { Card } from "../components/ui/Card";
 import { Button } from "../components/ui/Button";
 import type { AppOutletContext } from "../App";
 
 export function HomePage() {
   const [code, setCode] = useState("");
   const navigate = useNavigate();
   const { setHeaderInfo } = useOutletContext<AppOutletContext>();
 
   useEffect(() => {
     setHeaderInfo({});
   }, [setHeaderInfo]);
 
   function handleSubmit(event: FormEvent) {
     event.preventDefault();
     const trimmed = code.trim() || nanoid(6).toUpperCase();
     navigate(`/room/${trimmed}`);
   }
 
   return (
     <div className="mx-auto max-w-xl">
       <Card className="space-y-6 p-6">
         <div className="space-y-2">
           <h1 className="text-3xl font-bold text-[var(--text)]">FluxShare</h1>
           <p className="text-sm text-[var(--text-muted)]">
diff --git a/apps/client/src/pages/Room.tsx b/apps/client/src/pages/Room.tsx
index d03754390b334c1acbc489d3d343835c9a5941c8..3e71b4f94aebedce3a5d7cb5d7b3d273acb29d1d 100644
--- a/apps/client/src/pages/Room.tsx
+++ b/apps/client/src/pages/Room.tsx
@@ -1,120 +1,130 @@
 import { useCallback, useEffect, useMemo, useRef, useState } from "react";
 import { useNavigate, useOutletContext, useParams } from "react-router-dom";
-import { nanoid } from "nanoid";
+import { nanoid } from "@/utils/nanoid";
 import PeersPanel from "../components/PeersPanel";
 import TransferBox from "../components/TransferBox";
 import { usePeersStore, PeerConnectionStatus } from "../store/usePeers";
 import { useTransfersStore } from "../store/useTransfers";
 import { SignalingClient } from "../lib/signaling";
 import { PeerManager } from "../lib/webrtc/PeerManager";
 import { FileReceiver, FileSender, TransferManifest, CHUNK_SIZE } from "../lib/webrtc/transfer";
 import { getFileHandle, saveFileHandle, saveCheckpoint, getCheckpoint, clearCheckpoint } from "../lib/persist/indexeddb";
+import { selectFile, getFallbackFile, computeFileId, clearFallbackFile } from "../lib/file/selectFile";
 import { isTauri, getFileInfo, readFileRange, writeFileRange } from "../lib/persist/tauri";
 import type { ChunkProvider } from "../lib/webrtc/transfer";
 import { Button } from "../components/ui/Button";
 import { Card } from "../components/ui/Card";
 import type { AppOutletContext } from "../App";
+import { toast } from "../store/useToast";
 
 import FileReaderWorker from "../workers/fileReader.worker?worker";
 
 interface PeerControllers {
   channel: RTCDataChannel;
   sender: FileSender;
   receiver: FileReceiver;
   provider?: ChunkProvider & { dispose?: () => void };
 }
 
 type DownloadWriter =
   | { type: "web"; writer: FileSystemWritableFileStream; handle: FileSystemFileHandle }
   | { type: "tauri"; path: string };
 
 function generateDisplayName() {
   const key = "fluxshare-display-name";
   if (typeof localStorage !== "undefined") {
     const stored = localStorage.getItem(key);
     if (stored) return stored;
     const generated = `Peer-${nanoid(6)}`;
     localStorage.setItem(key, generated);
     return generated;
   }
   return `Peer-${nanoid(6)}`;
 }
 
-async function computeFileId(name: string, size: number, lastModified: number) {
-  const encoder = new TextEncoder();
-  const data = encoder.encode(`${name}:${size}:${lastModified}`);
-  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
-  return Array.from(new Uint8Array(hashBuffer))
-    .map((b) => b.toString(16).padStart(2, "0"))
-    .join("");
-}
-
 function useRoomCode() {
   const params = useParams<{ code: string }>();
   return params.code ?? "";
 }
 
-function createWebChunkProvider(fileId: string, handle: FileSystemFileHandle, chunkSize: number) {
+type WorkerInitPayload = {
+  type: "init";
+  fileId: string;
+  chunkSize: number;
+  handle?: FileSystemFileHandle;
+  file?: File;
+};
+
+function createWorkerChunkProvider(payload: WorkerInitPayload) {
   const worker = new FileReaderWorker();
-  worker.postMessage({ type: "init", fileId, handle, chunkSize });
+  worker.postMessage(payload);
+  const fileId = payload.fileId;
   const pending = new Map<number, { resolve: (buffer: ArrayBuffer) => void; reject: (err: Error) => void }>();
 
   worker.addEventListener("message", (event: MessageEvent) => {
     const data = event.data;
     if (!data) return;
     if (data.type === "chunk" && data.fileId === fileId) {
       const resolver = pending.get(data.index);
       if (resolver) {
         pending.delete(data.index);
         resolver.resolve(data.buffer as ArrayBuffer);
       }
     }
     if (data.type === "error" && data.fileId === fileId) {
       const err = new Error(data.error ?? "unknown error");
       pending.forEach((entry) => entry.reject(err));
       pending.clear();
     }
   });
 
   const provider: ChunkProvider & { dispose: () => void } = {
     async getChunk(index: number) {
       return new Promise<ArrayBuffer>((resolve, reject) => {
         pending.set(index, { resolve, reject });
         worker.postMessage({ type: "chunk", fileId, index });
       });
     },
     dispose() {
       worker.postMessage({ type: "release", fileId });
       worker.terminate();
       pending.clear();
     },
   };
 
   return provider;
 }
 
+function createWebChunkProvider(fileId: string, handle: FileSystemFileHandle, chunkSize: number) {
+  return createWorkerChunkProvider({ type: "init", fileId, handle, chunkSize });
+}
+
+function createFallbackChunkProvider(fileId: string, file: File, chunkSize: number) {
+  return createWorkerChunkProvider({ type: "init", fileId, file, chunkSize });
+}
+
 function createTauriChunkProvider(path: string, chunkSize: number) {
   const provider: ChunkProvider = {
     async getChunk(index: number) {
       const start = index * chunkSize;
       return readFileRange(path, start, chunkSize);
     },
   };
   return provider;
 }
 
 export function RoomPage() {
   const code = useRoomCode();
   const navigate = useNavigate();
   const [displayName] = useState(() => generateDisplayName());
   const selectedFile = useTransfersStore((state) => state.selectedFile);
   const { setHeaderInfo } = useOutletContext<AppOutletContext>();
   const signalingRef = useRef<SignalingClient | null>(null);
   const peerManagerRef = useRef<PeerManager | null>(null);
   const controllersRef = useRef(new Map<string, PeerControllers>());
   const pendingSendRef = useRef(new Map<string, { manifest: TransferManifest; provider: ChunkProvider & { dispose?: () => void } }>());
   const handlesRef = useRef(new Map<string, FileSystemFileHandle>());
   const downloadWritersRef = useRef(new Map<string, DownloadWriter>());
 
   useEffect(() => {
     if (!code) {
@@ -334,110 +344,136 @@ export function RoomPage() {
       finalizeDownload(fileId);
       useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
       clearCheckpoint(fileId).catch(() => undefined);
     });
 
     const pending = pendingSendRef.current.get(peerId);
     if (pending) {
       pendingSendRef.current.delete(peerId);
       sender.start(pending.manifest, pending.provider);
       entry.provider = pending.provider;
     }
   }
 
   async function ensureHandle() {
     const selected = useTransfersStore.getState().selectedFile;
     if (selected?.source !== "web") return;
     const fileId = selected.fileId;
     if (handlesRef.current.has(fileId)) return;
     const handle = await getFileHandle(fileId);
     if (handle) {
       handlesRef.current.set(fileId, handle);
     }
   }
 
   async function handlePickFile() {
+    const previousSelected = useTransfersStore.getState().selectedFile;
     if (isTauri()) {
       const { open } = await import("@tauri-apps/api/dialog");
       const selection = await open({ multiple: false });
       if (!selection || Array.isArray(selection)) return;
       const path = selection;
       const name = path.split(/[\\/]/).pop() ?? "arquivo";
       const info = await getFileInfo(path);
       const fileId = await computeFileId(name, info.size, info.createdAt ?? Date.now());
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
+      useTransfersStore.getState().setSelectedFile({
+        fileId,
+        name,
+        size: info.size,
+        source: "tauri",
+        handleKey: path,
+      });
+      useTransfersStore.getState().upsertTransfer({
+        fileId,
+        peerId: "",
+        direction: "send",
+        bytesTransferred: 0,
+        totalBytes: info.size,
+        status: "idle",
+        startedAt: Date.now(),
+        updatedAt: Date.now(),
+        fileName: name,
+      });
+      if (previousSelected?.source === "web-fallback" && previousSelected.fileId !== fileId) {
+        clearFallbackFile(previousSelected.fileId);
+      }
       return;
     }
 
-    if (!("showOpenFilePicker" in window)) {
-      alert("Seu navegador não suporta File System Access API");
-      return;
+    const selection = await selectFile();
+    if (!selection) return;
+
+    if (selection.source === "web") {
+      const { handle, file, fileId } = selection;
+      handlesRef.current.set(fileId, handle);
+      useTransfersStore.getState().setSelectedFile({
+        fileId,
+        name: file.name,
+        size: file.size,
+        mime: file.type,
+        lastModified: file.lastModified,
+        source: "web",
+        handleKey: fileId,
+      });
+      useTransfersStore.getState().upsertTransfer({
+        fileId,
+        peerId: "",
+        direction: "send",
+        bytesTransferred: 0,
+        totalBytes: file.size,
+        status: "idle",
+        startedAt: Date.now(),
+        updatedAt: Date.now(),
+        fileName: file.name,
+      });
+    } else {
+      const { file, fileId } = selection;
+      useTransfersStore.getState().setSelectedFile({
+        fileId,
+        name: file.name,
+        size: file.size,
+        mime: file.type,
+        lastModified: file.lastModified,
+        source: "web-fallback",
+        handleKey: fileId,
+      });
+      useTransfersStore.getState().upsertTransfer({
+        fileId,
+        peerId: "",
+        direction: "send",
+        bytesTransferred: 0,
+        totalBytes: file.size,
+        status: "idle",
+        startedAt: Date.now(),
+        updatedAt: Date.now(),
+        fileName: file.name,
+      });
     }
 
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
+    if (previousSelected?.source === "web-fallback" && previousSelected.fileId !== selection.fileId) {
+      clearFallbackFile(previousSelected.fileId);
+    }
   }
 
   async function handleConnect(peerId: string) {
     const peerManager = peerManagerRef.current;
     if (!peerManager) return;
     usePeersStore.getState().updatePeerState(peerId, { status: "connecting" });
     await peerManager.connectTo(peerId);
   }
 
   function handleDisconnect(peerId: string) {
     peerManagerRef.current?.disconnect(peerId);
     usePeersStore.getState().updatePeerState(peerId, { status: "disconnected" });
     const controller = controllersRef.current.get(peerId);
     if (controller) {
       controller.provider?.dispose?.();
       controllersRef.current.delete(peerId);
     }
   }
 
   async function finalizeDownload(fileId: string) {
     const writer = downloadWritersRef.current.get(fileId);
     if (writer?.type === "web") {
       await writer.writer.close();
     }
     downloadWritersRef.current.delete(fileId);
@@ -449,50 +485,70 @@ export function RoomPage() {
       alert("Selecione um arquivo primeiro");
       return;
     }
     await ensureHandle();
 
     let provider: ChunkProvider & { dispose?: () => void };
     let manifest: TransferManifest;
 
     if (selected.source === "web") {
       const handle = handlesRef.current.get(selected.fileId);
       if (!handle) {
         alert("Não foi possível acessar o arquivo selecionado");
         return;
       }
       const file = await handle.getFile();
       manifest = {
         type: "MANIFEST",
         fileId: selected.fileId,
         name: file.name,
         size: file.size,
         mime: file.type,
         chunkSize: CHUNK_SIZE,
         totalChunks: Math.ceil(file.size / CHUNK_SIZE),
       };
       provider = createWebChunkProvider(selected.fileId, handle, CHUNK_SIZE);
+    } else if (selected.source === "web-fallback") {
+      const file = getFallbackFile(selected.fileId);
+      if (!file) {
+        toast({
+          message: "Re-selecione o mesmo arquivo para retomar a transferência.",
+          variant: "warning",
+          duration: 6000,
+        });
+        return;
+      }
+      manifest = {
+        type: "MANIFEST",
+        fileId: selected.fileId,
+        name: file.name,
+        size: file.size,
+        mime: file.type,
+        chunkSize: CHUNK_SIZE,
+        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
+      };
+      provider = createFallbackChunkProvider(selected.fileId, file, CHUNK_SIZE);
     } else {
       const path = selected.handleKey;
       const name = selected.name;
       manifest = {
         type: "MANIFEST",
         fileId: selected.fileId,
         name,
         size: selected.size,
         chunkSize: CHUNK_SIZE,
         totalChunks: Math.ceil(selected.size / CHUNK_SIZE),
       };
       provider = createTauriChunkProvider(path, CHUNK_SIZE);
     }
 
     const transferState = useTransfersStore.getState().transfers[selected.fileId];
     if (transferState) {
       useTransfersStore.getState().updateTransfer(selected.fileId, {
         status: "transferring",
         peerId,
         startedAt: transferState.startedAt || Date.now(),
       });
     } else {
       useTransfersStore.getState().upsertTransfer({
         fileId: selected.fileId,
         peerId,
diff --git a/apps/client/src/pages/Tunnel.tsx b/apps/client/src/pages/Tunnel.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..c7447f18848f0c39f37a98493b79b6e7076cbc96
--- /dev/null
+++ b/apps/client/src/pages/Tunnel.tsx
@@ -0,0 +1,157 @@
+import { FormEvent, useEffect, useMemo, useState } from "react";
+import { useOutletContext } from "react-router-dom";
+import { Card } from "../components/ui/Card";
+import { Button } from "../components/ui/Button";
+import type { AppOutletContext } from "../App";
+
+function buildPreviewUrl(port: number) {
+  const normalized = Number.isFinite(port) && port > 0 ? port : 8080;
+  return `https://example-${normalized}.trycloudflare.com`;
+}
+
+export default function TunnelPage() {
+  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
+  const [port, setPort] = useState(8080);
+  const [cloudflaredPath, setCloudflaredPath] = useState("cloudflared");
+  const [publicUrl, setPublicUrl] = useState<string | null>(null);
+  const [loadingAction, setLoadingAction] = useState<"start" | "stop" | null>(null);
+  const [hasStarted, setHasStarted] = useState(false);
+
+  useEffect(() => {
+    setHeaderInfo({});
+  }, [setHeaderInfo]);
+
+  const statusLabel = useMemo(() => {
+    if (loadingAction === "start") {
+      return "Iniciando túnel de exemplo...";
+    }
+    if (loadingAction === "stop") {
+      return "Encerrando túnel...";
+    }
+    if (publicUrl) {
+      return "Tunnel ativo (modo demonstração)";
+    }
+    if (hasStarted) {
+      return "Tunnel parado";
+    }
+    return "Nenhum tunnel iniciado";
+  }, [hasStarted, loadingAction, publicUrl]);
+
+  const handleStart = (event: FormEvent<HTMLFormElement>) => {
+    event.preventDefault();
+    setLoadingAction("start");
+
+    window.setTimeout(() => {
+      setPublicUrl(buildPreviewUrl(port));
+      setHasStarted(true);
+      setLoadingAction(null);
+    }, 400);
+  };
+
+  const handleStop = () => {
+    setLoadingAction("stop");
+
+    window.setTimeout(() => {
+      setPublicUrl(null);
+      setLoadingAction(null);
+    }, 300);
+  };
+
+  const handleCopy = () => {
+    if (publicUrl && typeof navigator !== "undefined" && navigator.clipboard) {
+      navigator.clipboard.writeText(publicUrl).catch(() => undefined);
+    }
+  };
+
+  return (
+    <div className="mx-auto max-w-3xl space-y-8">
+      <div className="space-y-3">
+        <h1 className="text-3xl font-semibold text-[var(--text)]">Cloudflare Tunnel</h1>
+        <p className="text-sm text-[var(--text-muted)]">
+          Esta tela recria o formulário clássico do tunnel como uma prévia visual. A integração com o
+          Cloudflare Tunnel será reativada em uma etapa futura.
+        </p>
+      </div>
+
+      <Card className="space-y-6 p-6">
+        <form className="space-y-6" onSubmit={handleStart}>
+          <div className="grid gap-4 sm:grid-cols-2">
+            <label className="space-y-2 text-sm text-[var(--text-muted)]">
+              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
+                Porta local
+              </span>
+              <input
+                type="number"
+                min={1}
+                className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
+                value={port}
+                onChange={(event) => setPort(Number(event.target.value))}
+                placeholder="8080"
+              />
+            </label>
+            <label className="space-y-2 text-sm text-[var(--text-muted)]">
+              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
+                Caminho do cloudflared
+              </span>
+              <input
+                className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
+                value={cloudflaredPath}
+                onChange={(event) => setCloudflaredPath(event.target.value)}
+                placeholder="Ex: /usr/local/bin/cloudflared"
+              />
+            </label>
+          </div>
+
+          <div className="flex flex-wrap gap-3">
+            <Button type="submit" disabled={loadingAction !== null}>
+              {loadingAction === "start" ? "Iniciando..." : "Iniciar Tunnel"}
+            </Button>
+            <Button
+              type="button"
+              variant="secondary"
+              disabled={loadingAction !== null || !publicUrl}
+              onClick={handleStop}
+            >
+              {loadingAction === "stop" ? "Parando..." : "Parar Tunnel"}
+            </Button>
+          </div>
+        </form>
+
+        <div className="space-y-4">
+          <div>
+            <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
+              Status
+            </span>
+            <div className="mt-2 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)]">
+              {statusLabel}
+            </div>
+          </div>
+
+          {publicUrl ? (
+            <div className="space-y-2">
+              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
+                URL pública (demonstração)
+              </span>
+              <div className="flex flex-wrap items-center gap-3">
+                <div className="flex-1 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-2 font-mono text-sm text-[var(--text)] break-all">
+                  {publicUrl}
+                </div>
+                <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
+                  Copiar link
+                </Button>
+              </div>
+            </div>
+          ) : (
+            <div className="rounded-2xl border border-dashed border-[var(--card-border)]/50 bg-[var(--card)]/40 px-4 py-3 text-sm text-[var(--text-muted)]">
+              Inicie o tunnel para gerar um link de visualização.
+            </div>
+          )}
+        </div>
+
+        <p className="text-xs text-[var(--text-muted)]">
+          Este modo é apenas uma representação visual. Nenhum comando real é executado e nenhum túnel é criado.
+        </p>
+      </Card>
+    </div>
+  );
+}
diff --git a/apps/client/src/store/useToast.ts b/apps/client/src/store/useToast.ts
new file mode 100644
index 0000000000000000000000000000000000000000..babf34446150e9839cb9401c653dfa565c511dfc
--- /dev/null
+++ b/apps/client/src/store/useToast.ts
@@ -0,0 +1,53 @@
+import { create } from "zustand";
+
+export type ToastVariant = "default" | "info" | "success" | "warning" | "error";
+
+export interface ToastItem {
+  id: string;
+  message: string;
+  variant: ToastVariant;
+  duration: number;
+}
+
+interface ToastStore {
+  toasts: ToastItem[];
+  showToast: (toast: Omit<ToastItem, "id"> & { id?: string }) => string;
+  dismiss: (id: string) => void;
+}
+
+const DEFAULT_DURATION = 5000;
+
+function createId() {
+  return Math.random().toString(36).slice(2, 10);
+}
+
+export const useToastStore = create<ToastStore>((set, get) => ({
+  toasts: [],
+  showToast: (toast) => {
+    const id = toast.id ?? createId();
+    const item: ToastItem = {
+      id,
+      message: toast.message,
+      variant: toast.variant ?? "default",
+      duration: toast.duration ?? DEFAULT_DURATION,
+    };
+    set((state) => ({
+      toasts: [...state.toasts.filter((existing) => existing.id !== id), item],
+    }));
+    const duration = toast.duration ?? DEFAULT_DURATION;
+    if (duration !== Infinity && typeof window !== "undefined") {
+      window.setTimeout(() => {
+        get().dismiss(id);
+      }, duration);
+    }
+    return id;
+  },
+  dismiss: (id) =>
+    set((state) => ({
+      toasts: state.toasts.filter((toast) => toast.id !== id),
+    })),
+}));
+
+export function toast(options: Omit<ToastItem, "id"> & { id?: string }) {
+  return useToastStore.getState().showToast(options);
+}
diff --git a/apps/client/src/store/useTransfers.ts b/apps/client/src/store/useTransfers.ts
index 2ea24ea1fb6ee12ec8afc3178bdf09f1e38d6250..3c971c5c9d28a9f7a850208653fcf78d7221f22f 100644
--- a/apps/client/src/store/useTransfers.ts
+++ b/apps/client/src/store/useTransfers.ts
@@ -1,37 +1,37 @@
 import { create } from "zustand";
 import { persist, createJSONStorage } from "zustand/middleware";
 
 export type TransferDirection = "send" | "receive";
 
 export interface SelectedFileMeta {
   fileId: string;
   name: string;
   size: number;
   mime?: string;
   lastModified?: number;
-  source: "web" | "tauri";
+  source: "web" | "web-fallback" | "tauri";
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
 }
 
 interface TransfersStore {
   selectedFile: SelectedFileMeta | null;
   transfers: Record<string, TransferState>;
   setSelectedFile(meta: SelectedFileMeta | null): void;
   upsertTransfer(transfer: TransferState): void;
   updateTransfer(fileId: string, patch: Partial<TransferState>): void;
   removeTransfer(fileId: string): void;
   reset(): void;
diff --git a/apps/client/src/styles/theme.css b/apps/client/src/styles/theme.css
index 1529ac225b58fb60e387042db0c80c9c9fd1a55e..a39fc0839d73243fdcf95839846ee831ec1ce628 100644
--- a/apps/client/src/styles/theme.css
+++ b/apps/client/src/styles/theme.css
@@ -1,111 +1,119 @@
-:root {
+:root,
+[data-theme="dark"] {
   color-scheme: dark;
-  --bg: #0b0d12;
-  --bg-grad-1: #0b0d12;
-  --bg-grad-2: #111428;
+  --bg: #0a0b10;
+  --bg-grad-1: #0a0b10;
+  --bg-grad-2: #111527;
   --card: rgba(255, 255, 255, 0.06);
-  --card-border: rgba(255, 255, 255, 0.18);
-  --text: #e7e9ee;
-  --text-muted: #b6bcc8;
+  --card-border: rgba(255, 255, 255, 0.14);
+  --text: #e6e9f2;
+  --text-muted: #b6bfd3;
   --accent: #7c3aed;
-  --accent-2: #3b82f6;
-  --ring: rgba(124, 58, 237, 0.5);
+  --accent-2: #1e3a8a;
+  --ring: rgba(124, 58, 237, 0.45);
 }
 
 [data-theme="light"] {
   color-scheme: light;
-  --bg: #f6f7fb;
-  --bg-grad-1: #f6f7fb;
-  --bg-grad-2: #eaeef7;
-  --card: rgba(255, 255, 255, 0.7);
+  --bg: #f7f8fc;
+  --bg-grad-1: #f7f8fc;
+  --bg-grad-2: #e9eef9;
+  --card: rgba(255, 255, 255, 0.8);
   --card-border: rgba(17, 17, 17, 0.08);
-  --text: #1c1f25;
-  --text-muted: #5b6473;
+  --text: #1b1f26;
+  --text-muted: #596173;
   --accent: #6d28d9;
   --accent-2: #2563eb;
   --ring: rgba(37, 99, 235, 0.35);
 }
 
 html {
   font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
   background-color: var(--bg);
   color: var(--text);
 }
 
 body {
   margin: 0;
   min-height: 100vh;
   background: radial-gradient(circle at top, var(--bg-grad-1), var(--bg-grad-2));
   color: var(--text);
   transition: background-color 200ms ease, color 200ms ease;
 }
 
 * {
   box-sizing: border-box;
 }
 
 a {
   color: var(--accent-2);
   text-decoration: none;
 }
 
 a:hover {
   text-decoration: underline;
 }
 
+a:focus-visible,
+button:focus-visible,
+[role="button"]:focus-visible {
+  outline: 2px solid var(--ring);
+  outline-offset: 2px;
+}
+
 button,
 input,
 textarea {
   font-family: inherit;
 }
 
 ::selection {
   background: rgba(124, 58, 237, 0.35);
   color: inherit;
 }
 
 .app-shell {
   position: relative;
   min-height: 100vh;
   background: radial-gradient(circle at top, var(--bg-grad-1), var(--bg-grad-2));
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
-    radial-gradient(circle at 50% 80%, rgba(124, 58, 237, 0.18), transparent 65%);
-  filter: blur(90px);
-  opacity: 0.9;
+  background: radial-gradient(circle at 18% 15%, rgba(124, 58, 237, 0.35), transparent 58%),
+    radial-gradient(circle at 78% 22%, rgba(30, 58, 138, 0.3), transparent 62%),
+    radial-gradient(circle at 50% 82%, rgba(15, 23, 42, 0.4), transparent 68%);
+  filter: blur(120px);
+  opacity: 0.85;
 }
 
 .app-shell__mesh {
   position: absolute;
   inset: 0;
   background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 45%, rgba(255, 255, 255, 0.04) 100%);
   mix-blend-mode: screen;
   opacity: 0.35;
 }
 
 .app-shell__grid {
   position: absolute;
   inset: 0;
   background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
     linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
   background-size: 52px 52px;
   opacity: 0.16;
 }
 
 .card-shadow {
   box-shadow: 0 25px 45px -25px rgba(15, 23, 42, 0.55);
 }
diff --git a/apps/client/src/utils/nanoid.ts b/apps/client/src/utils/nanoid.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e1d59bccc8c8a406635dc94d68ea9868badbc987
--- /dev/null
+++ b/apps/client/src/utils/nanoid.ts
@@ -0,0 +1 @@
+export { nanoid, customAlphabet } from "nanoid";
diff --git a/apps/client/src/workers/fileReader.worker.ts b/apps/client/src/workers/fileReader.worker.ts
index c809e37e13feb5eef75270a37b05b4663ff28a68..2187931cecbcfc333fa263bdc65b44ef2441563d 100644
--- a/apps/client/src/workers/fileReader.worker.ts
+++ b/apps/client/src/workers/fileReader.worker.ts
@@ -1,79 +1,97 @@
 interface InitMessage {
   type: "init";
   fileId: string;
-  handle: FileSystemFileHandle;
   chunkSize: number;
+  handle?: FileSystemFileHandle;
+  file?: File;
 }
 
 interface ChunkRequest {
   type: "chunk";
   fileId: string;
   index: number;
 }
 
 interface ReleaseMessage {
   type: "release";
   fileId: string;
 }
 
 type WorkerRequest = InitMessage | ChunkRequest | ReleaseMessage;
 
 type FileContext = {
-  handle: FileSystemFileHandle;
+  handle?: FileSystemFileHandle;
+  file?: File;
   chunkSize: number;
   size: number;
   totalChunks: number;
 };
 
 type FileReaderWorkerScope = typeof globalThis & {
   onmessage: (event: MessageEvent<WorkerRequest>) => void;
   postMessage: (message: unknown, transfer?: Transferable[]) => void;
 };
 
 declare const self: FileReaderWorkerScope;
 
 const files = new Map<string, FileContext>();
 
 self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
   const message = event.data;
   switch (message.type) {
     case "init": {
-      const file = await message.handle.getFile();
+      let sourceFile = message.file ?? null;
+      if (!sourceFile && message.handle) {
+        sourceFile = await message.handle.getFile();
+      }
+      if (!sourceFile) {
+        self.postMessage({
+          type: "error",
+          fileId: message.fileId,
+          error: "no-file-source",
+        });
+        return;
+      }
       files.set(message.fileId, {
         handle: message.handle,
+        file: message.file ?? sourceFile,
         chunkSize: message.chunkSize,
-        size: file.size,
-        totalChunks: Math.ceil(file.size / message.chunkSize),
+        size: sourceFile.size,
+        totalChunks: Math.ceil(sourceFile.size / message.chunkSize),
       });
       self.postMessage({
         type: "ready",
         fileId: message.fileId,
-        size: file.size,
-        totalChunks: Math.ceil(file.size / message.chunkSize),
+        size: sourceFile.size,
+        totalChunks: Math.ceil(sourceFile.size / message.chunkSize),
       });
       break;
     }
     case "chunk": {
       const ctx = files.get(message.fileId);
       if (!ctx) {
         self.postMessage({ type: "error", fileId: message.fileId, error: "file not initialized" });
         return;
       }
-      const file = await ctx.handle.getFile();
+      const file = ctx.file ?? (ctx.handle ? await ctx.handle.getFile() : null);
+      if (!file) {
+        self.postMessage({ type: "error", fileId: message.fileId, error: "file not available" });
+        return;
+      }
       const start = message.index * ctx.chunkSize;
       const end = Math.min(start + ctx.chunkSize, ctx.size);
       const blob = file.slice(start, end);
       const buffer = await blob.arrayBuffer();
       self.postMessage({ type: "chunk", fileId: message.fileId, index: message.index, buffer }, [buffer]);
       break;
     }
     case "release": {
       files.delete(message.fileId);
       break;
     }
     default:
       break;
   }
 };
 
 export default {} as typeof Worker & { new (): Worker };
 
EOF
)