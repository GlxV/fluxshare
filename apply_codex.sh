 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index 232938e94c15935119bb2ebe6a31812888272604..3508d35aa355f029b672512f60693c560037d6e7 100644
--- a/README.md
+++ b/README.md
@@ -1,125 +1,129 @@
 # FluxShare
 
 FluxShare é um cliente desktop multiplataforma (Windows/Linux/macOS) para transferência de arquivos P2P com fallback automático para QUIC e Cloudflare Tunnel. O projeto é distribuído sob a licença MIT e organizado como um monorepo com pnpm.
 
 ## Pré-requisitos
 
 - [Node.js 20+](https://nodejs.org/) com pnpm (`corepack enable`)
 - [Rust](https://www.rust-lang.org/) stable (via rustup)
 - Dependências do Tauri (ver [documentação oficial](https://tauri.app/v1/guides/getting-started/prerequisites))
 - `cloudflared` disponível no `PATH`
 
 ## Instalação
 
 ```bash
 pnpm install
 ```
 
 ## Desenvolvimento
 
 ```bash
-pnpm dev
+# terminal 1 – servidor de sinalização
+pnpm --filter signaling-server dev
+
+# terminal 2 – cliente web
+pnpm --filter fluxshare-client dev
+
+# opcional: cliente Tauri
+pnpm --filter fluxshare-client tauri dev
 ```
 
-Este comando inicia o servidor de sinalização (`apps/signaling-server`) e o cliente Tauri (`apps/client`). O cliente abre a interface React com as páginas:
+O cabeçalho do cliente exibe um botão para alternar entre os temas claro e escuro; a escolha é persistida automaticamente no
+`localStorage`.
 
-- Enviar
-- Receber
-- Peers
-- Tunnel
-- Configurações
-- Logs
+Defina um arquivo `.env` na raiz de `apps/client` com a URL do servidor de sinalização e ICE servers:
 
-### Configuração do servidor de sinalização
+```bash
+VITE_SIGNALING_URL=ws://localhost:5174/ws
+VITE_STUN_URL=stun:stun.l.google.com:19302
+# TURN opcional
+# VITE_TURN_URL=turn://example.com:3478
+# VITE_TURN_USER=user
+# VITE_TURN_PASS=pass
+```
 
-O servidor de sinalização lê a porta da variável de ambiente `PORT`, usando `4000` como padrão. Para ajustar a configuração localmente:
+### Configuração do servidor de sinalização
 
-1. Copie `apps/signaling-server/.env.example` para `apps/signaling-server/.env`.
-2. Edite o valor de `PORT` conforme necessário.
+O servidor expõe um endpoint WebSocket em `/ws`. As mensagens são validadas com `zod` e seguem o protocolo:
 
-Durante os testes e em desenvolvimento, o servidor continuará funcionando caso o arquivo `.env` não exista.
+```json
+// client → server
+{"type":"join","room":"AB12CD","peerId":"p1","displayName":"Alice"}
+{"type":"signal","room":"AB12CD","from":"p1","to":"p2","data":{...}}
+{ "type":"leave","room":"AB12CD","peerId":"p1" }
+{ "type":"heartbeat","peerId":"p1" }
+
+// server → client
+{"type":"peers","room":"AB12CD","peers":[{"peerId":"p2","displayName":"Bob"}]}
+{"type":"peer-joined","peer":{"peerId":"p3","displayName":"Carol"}}
+{"type":"peer-left","peerId":"p2"}
+{"type":"signal","from":"p2","to":"p1","data":{...}}
+```
 
 ## Build de Release
 
 ```bash
 pnpm build
 ```
 
 - Gera o binário Tauri (modo release).
 - Compila o servidor de sinalização (TypeScript → JavaScript) em `apps/signaling-server/dist`.
 
 ## Testes
 
 ```bash
 pnpm test
 ```
 
 Executa:
 
 - Testes de unidade em Rust (chunking, checksums, criptografia).
 - Testes de unidade no servidor de sinalização (validação de mensagens com zod).
 
 ## Estrutura do Repositório
 
 ```
 fluxshare/
-  README.md
-  package.json
-  pnpm-workspace.yaml
   apps/
     client/
-      package.json
-      src-tauri/
-        Cargo.toml
-        src/
-          main.rs
-          commands/
-            files.rs
-            transfer.rs
-            webrtc.rs
-            quic.rs
-            tunnel.rs
-            settings.rs
       src/
-        app/
-          routes/
-            Send.tsx
-            Receive.tsx
-            Peers.tsx
-            Tunnel.tsx
-            Settings.tsx
-            Logs.tsx
-          components/
-            FilePicker.tsx
-            ProgressBar.tsx
-            PeerList.tsx
-            SpeedMeter.tsx
-          lib/
-            api.ts
-            webrtcClient.ts
         App.tsx
         index.tsx
-      vite.config.ts
-      tailwind.config.ts
-      postcss.config.cjs
-      tsconfig.json
-      tsconfig.node.json
+        pages/
+          Home.tsx
+          Room.tsx
+        components/
+          PeersPanel.tsx
+          TransferBox.tsx
+        lib/
+          signaling.ts
+          persist/
+            indexeddb.ts
+            tauri.ts
+          webrtc/
+            PeerManager.ts
+            transfer.ts
+        store/
+          usePeers.ts
+          useTransfers.ts
+        workers/
+          fileReader.worker.ts
+        utils/env.ts
+        types/protocol.ts
+      src-tauri/
+        src/commands/files.rs
+        src/main.rs
     signaling-server/
-      package.json
-      tsconfig.json
       src/index.ts
 ```
 
-## Mensagens WS de Sinalização (exemplos)
-
-```json
-{ "type": "register", "id": "alice" }
-{ "type": "offer", "from": "alice", "to": "bob", "sdp": "..." }
-{ "type": "answer", "from": "bob", "to": "alice", "sdp": "..." }
-{ "type": "ice", "from": "alice", "to": "bob", "candidate": { "candidate": "candidate:0 ..." } }
-{ "type": "bye", "from": "alice", "to": "bob" }
-```
-
 ## Licença
 
 MIT
+
+## Decisões principais
+
+- Protocolo WebSocket foi refeito para suportar salas, heartbeat e broadcast de peers reais.
+- O cliente React utiliza Zustand com persistência parcial (IndexedDB + BroadcastChannel) para manter seleção e progresso entre abas.
+- Transferências usam WebRTC DataChannel confiável com chunking de 16 KiB, controle de backpressure e protocolo de ACK/RESUME.
+- Leituras de arquivo foram delegadas para worker (web) e comando Tauri (`read_file_range`) para preservar memória.
diff --git a/apps/client/package.json b/apps/client/package.json
index 470d7c97edf791ee9a17f1ca6a39f53db6ae5f6a..6d1eb1caa0c035fada072de37e5cb8c73d97494a 100644
--- a/apps/client/package.json
+++ b/apps/client/package.json
@@ -1,33 +1,39 @@
 {
   "name": "fluxshare-client",
   "version": "0.1.0",
   "private": true,
   "type": "module",
   "scripts": {
     "dev": "vite --host",
     "build": "vite build && tauri build",
     "preview": "vite preview",
     "tauri": "tauri"
   },
   "dependencies": {
     "@tanstack/react-query": "^5.32.1",
     "@tauri-apps/api": "^1.5.4",
     "classnames": "^2.5.1",
+    "clsx": "^2.1.1",
+    "idb": "^7.1.1",
+    "idb-keyval": "^6.2.2",
+    "nanoid": "^5.1.6",
     "react": "^18.2.0",
     "react-dom": "^18.2.0",
     "react-router-dom": "^6.23.1",
-    "tailwind-merge": "^2.2.1"
+    "tailwind-merge": "^2.2.1",
+    "zod": "^3.25.76",
+    "zustand": "^4.5.7"
   },
   "devDependencies": {
     "@tauri-apps/cli": "^1.6.3",
     "@types/node": "^20.12.7",
     "@types/react": "^18.2.79",
     "@types/react-dom": "^18.2.25",
     "@vitejs/plugin-react": "^5.0.4",
     "autoprefixer": "^10.4.19",
     "postcss": "^8.4.38",
     "tailwindcss": "^3.4.3",
     "typescript": "^5.4.5",
     "vite": "^5.2.9"
   }
 }
diff --git a/apps/client/src-tauri/src/commands/files.rs b/apps/client/src-tauri/src/commands/files.rs
index 3f3281d83f9801296d2d67ef72d0f5e53928ef44..7170d3bc8441b795754b9a63fa9ae1afc0538494 100644
--- a/apps/client/src-tauri/src/commands/files.rs
+++ b/apps/client/src-tauri/src/commands/files.rs
@@ -1,45 +1,68 @@
-use std::fs;
+use std::fs::{self, OpenOptions};
+use std::io::{Read, Seek, SeekFrom, Write};
 use std::path::PathBuf;
 
 use super::transfer::FileEntry;
 
 #[tauri::command]
 pub fn list_files(paths: Vec<String>) -> Result<Vec<FileEntry>, String> {
     let mut entries = Vec::new();
     for path in paths {
         let path_buf = PathBuf::from(&path);
         let metadata = fs::metadata(&path_buf).map_err(|e| e.to_string())?;
         let name = path_buf
             .file_name()
             .map(|n| n.to_string_lossy().to_string())
             .unwrap_or_else(|| path.clone());
         let checksum = if metadata.is_file() {
             Some(calculate_checksum(&path_buf).map_err(|e| e.to_string())?)
         } else {
             None
         };
         entries.push(FileEntry {
             path: path.clone(),
             name,
             size: metadata.len(),
             is_dir: metadata.is_dir(),
             checksum,
         });
     }
     Ok(entries)
 }
 
+#[tauri::command]
+pub fn read_file_range(path: String, start: u64, length: u64) -> Result<Vec<u8>, String> {
+    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
+    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
+    let mut buffer = vec![0u8; length as usize];
+    let read = file.read(&mut buffer).map_err(|e| e.to_string())?;
+    buffer.truncate(read);
+    Ok(buffer)
+}
+
+#[tauri::command]
+pub fn write_file_range(path: String, start: u64, bytes: Vec<u8>) -> Result<(), String> {
+    let mut file = OpenOptions::new()
+        .create(true)
+        .write(true)
+        .open(&path)
+        .map_err(|e| e.to_string())?;
+    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
+    file.write_all(&bytes).map_err(|e| e.to_string())?;
+    Ok(())
+}
+
 fn calculate_checksum(path: &PathBuf) -> anyhow::Result<String> {
     use std::io::Read;
     let mut file = fs::File::open(path)?;
     let mut hasher = blake3::Hasher::new();
     let mut buffer = [0u8; 8192];
     loop {
         let read = file.read(&mut buffer)?;
         if read == 0 {
             break;
         }
         hasher.update(&buffer[..read]);
     }
     Ok(hasher.finalize().to_hex().to_string())
 }
diff --git a/apps/client/src-tauri/src/main.rs b/apps/client/src-tauri/src/main.rs
index 4967cbba4a377e0c1567ee3c034c4b2afe0e7d90..9ca3185bf2767dc6b2aedfd3dcc4e868a2d8f5a1 100644
--- a/apps/client/src-tauri/src/main.rs
+++ b/apps/client/src-tauri/src/main.rs
@@ -1,38 +1,38 @@
 #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
 
 mod commands {
     pub mod files;
     pub mod quic;
     pub mod settings;
     pub mod transfer;
     pub mod tunnel;
     pub mod webrtc;
 }
 
 use commands::{
-    files::list_files,
+    files::{list_files, read_file_range, write_file_range},
     quic::{quic_start, QuicManager},
     settings::{get_settings, set_settings, SettingsManager},
     transfer::{get_status, send_files, TransferManager},
     tunnel::{start_tunnel, stop_tunnel, TunnelManager},
     webrtc::{start_signaling, webrtc_start, WebRTCManager},
 };
 use tauri::Manager;
 use tracing_subscriber::{fmt, EnvFilter};
 
 fn init_tracing() {
     let base = fmt()
         .with_env_filter(
             EnvFilter::from_default_env()
                 .add_directive("fluxshare=info".parse().unwrap()),
         )
         .with_target(false)
         .json();
 
     if let Some(dir) = dirs::home_dir() {
         let log_dir = dir.join(".fluxshare").join("logs");
         let _ = std::fs::create_dir_all(&log_dir);
 
         let file_appender = tracing_appender::rolling::daily(log_dir, "latest.log");
         let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
 
@@ -52,45 +52,47 @@ fn open_logs_folder(app: tauri::AppHandle) -> Result<(), String> {
         .join("logs");
     tauri::api::shell::open(&app.shell_scope(), path.to_string_lossy(), None)
         .map_err(|e| e.to_string())
 }
 
 fn main() {
     init_tracing();
     let transfer_manager = TransferManager::default();
     let settings_manager = SettingsManager::default();
     let tunnel_manager = TunnelManager::default();
     let webrtc_manager = WebRTCManager::default();
     let quic_manager = QuicManager::default();
 
     settings_manager
         .ensure_initialized()
         .expect("settings init");
 
     tauri::Builder::default()
         .manage(transfer_manager.clone())
         .manage(settings_manager.clone())
         .manage(tunnel_manager.clone())
         .manage(webrtc_manager.clone())
         .manage(quic_manager.clone())
         .invoke_handler(tauri::generate_handler![
             list_files,
+            read_file_range,
+            write_file_range,
             start_signaling,
             webrtc_start,
             quic_start,
             send_files,
             get_status,
             start_tunnel,
             stop_tunnel,
             set_settings,
             get_settings,
             open_logs_folder
         ])
         .setup(move |app| {
             app.listen_global("tauri://close-requested", move |_event| {
                 tracing::info!("shutdown requested");
             });
             Ok(())
         })
         .run(tauri::generate_context!())
         .expect("error while running FluxShare");
 }
diff --git a/apps/client/src/App.tsx b/apps/client/src/App.tsx
index 9f613af64417b21d53976cae6886de666d982d95..c1e3e742dd0944efc1d048be4509f63493935cae 100644
--- a/apps/client/src/App.tsx
+++ b/apps/client/src/App.tsx
@@ -1,37 +1,20 @@
-import { NavLink, Outlet } from "react-router-dom";
+import { type Dispatch, type SetStateAction, useState } from "react";
+import { Outlet } from "react-router-dom";
+import AppShell, { type AppHeaderInfo } from "./components/AppShell";
+import { ThemeProvider } from "./components/ThemeProvider";
 
-const links = [
-  { to: "/", label: "Enviar" },
-  { to: "/receive", label: "Receber" },
-  { to: "/peers", label: "Peers" },
-  { to: "/tunnel", label: "Tunnel" },
-  { to: "/settings", label: "Configurações" },
-  { to: "/logs", label: "Logs" },
-];
+export interface AppOutletContext {
+  setHeaderInfo: Dispatch<SetStateAction<AppHeaderInfo>>;
+}
 
 export default function App() {
+  const [headerInfo, setHeaderInfo] = useState<AppHeaderInfo>({});
+
   return (
-    <div className="min-h-screen bg-bg text-white flex">
-      <aside className="w-52 bg-surface/80 backdrop-blur border-r border-accent/30 p-4 space-y-4">
-        <h1 className="text-xl font-semibold">FluxShare</h1>
-        <nav className="flex flex-col space-y-2">
-          {links.map((link) => (
-            <NavLink
-              key={link.to}
-              to={link.to}
-              className={({ isActive }) =>
-                `px-3 py-2 rounded-md transition ${isActive ? "bg-accent" : "hover:bg-accent/20"}`
-              }
-              end
-            >
-              {link.label}
-            </NavLink>
-          ))}
-        </nav>
-      </aside>
-      <main className="flex-1 p-8 overflow-y-auto">
-        <Outlet />
-      </main>
-    </div>
+    <ThemeProvider>
+      <AppShell headerInfo={headerInfo}>
+        <Outlet context={{ setHeaderInfo }} />
+      </AppShell>
+    </ThemeProvider>
   );
 }
diff --git a/apps/client/src/app/components/FilePicker.tsx b/apps/client/src/app/components/FilePicker.tsx
deleted file mode 100644
index b5cbac794ffa5b16509ebd245bcddf98bb03eef4..0000000000000000000000000000000000000000
--- a/apps/client/src/app/components/FilePicker.tsx
+++ /dev/null
@@ -1,41 +0,0 @@
-import { useState } from "react";
-import { invoke } from "@tauri-apps/api/tauri";
-import { open } from "@tauri-apps/api/dialog";
-
-export interface FileEntry {
-  path: string;
-  name: string;
-  size: number;
-  isDir: boolean;
-  checksum?: string | null;
-}
-
-interface Props {
-  onFiles: (files: FileEntry[]) => void;
-}
-
-export default function FilePicker({ onFiles }: Props) {
-  const [loading, setLoading] = useState(false);
-
-  async function handlePick() {
-    setLoading(true);
-    try {
-      const picked = await open({ multiple: true, directory: false });
-      if (!picked) return;
-      const paths = Array.isArray(picked) ? picked : [picked];
-      const files = (await invoke<FileEntry[]>("list_files", { paths })).map((file) => ({
-        ...file,
-        checksum: file.checksum ?? null,
-      }));
-      onFiles(files);
-    } finally {
-      setLoading(false);
-    }
-  }
-
-  return (
-    <button onClick={handlePick} disabled={loading}>
-      {loading ? "Carregando..." : "Selecionar arquivos"}
-    </button>
-  );
-}
diff --git a/apps/client/src/app/components/PeerList.tsx b/apps/client/src/app/components/PeerList.tsx
deleted file mode 100644
index 301aff3ca426d0e35cec0808a82e3be929cc7465..0000000000000000000000000000000000000000
--- a/apps/client/src/app/components/PeerList.tsx
+++ /dev/null
@@ -1,32 +0,0 @@
-interface PeerInfo {
-  id: string;
-  status: "online" | "offline";
-}
-
-interface Props {
-  peers: PeerInfo[];
-  onSelect?: (peer: PeerInfo) => void;
-}
-
-export default function PeerList({ peers, onSelect }: Props) {
-  return (
-    <div className="space-y-2">
-      {peers.map((peer) => (
-        <button
-          key={peer.id}
-          className={`w-full flex items-center justify-between px-4 py-2 rounded-md bg-surface/70 border border-white/10 hover:border-accent/60`}
-          onClick={() => onSelect?.(peer)}
-        >
-          <span>{peer.id}</span>
-          <span
-            className={`text-xs uppercase tracking-wide ${
-              peer.status === "online" ? "text-green-400" : "text-white/40"
-            }`}
-          >
-            {peer.status}
-          </span>
-        </button>
-      ))}
-    </div>
-  );
-}
diff --git a/apps/client/src/app/components/ProgressBar.tsx b/apps/client/src/app/components/ProgressBar.tsx
deleted file mode 100644
index dc896c9b5a512c8b93e34b85d0c28824342f8c37..0000000000000000000000000000000000000000
--- a/apps/client/src/app/components/ProgressBar.tsx
+++ /dev/null
@@ -1,18 +0,0 @@
-interface Props {
-  value: number; // 0-1
-  label?: string;
-}
-
-export default function ProgressBar({ value, label }: Props) {
-  return (
-    <div className="space-y-1">
-      {label && <div className="text-sm text-white/70">{label}</div>}
-      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
-        <div
-          className="h-full bg-accent transition-all"
-          style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }}
-        />
-      </div>
-    </div>
-  );
-}
diff --git a/apps/client/src/app/components/SpeedMeter.tsx b/apps/client/src/app/components/SpeedMeter.tsx
deleted file mode 100644
index 2dbd8414b26f5aa96e6cef9e29fb97e6826f8123..0000000000000000000000000000000000000000
--- a/apps/client/src/app/components/SpeedMeter.tsx
+++ /dev/null
@@ -1,23 +0,0 @@
-interface Props {
-  rate: number; // bytes/sec
-  etaSeconds?: number | null;
-}
-
-function formatBytes(bytes: number) {
-  if (bytes <= 0) return "0 B";
-  const units = ["B", "KiB", "MiB", "GiB"];
-  const idx = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
-  const value = bytes / 2 ** (idx * 10);
-  return `${value.toFixed(1)} ${units[idx]}`;
-}
-
-export default function SpeedMeter({ rate, etaSeconds }: Props) {
-  return (
-    <div className="flex items-center gap-4 text-sm text-white/80">
-      <span>Velocidade: {formatBytes(rate)}/s</span>
-      {etaSeconds != null && Number.isFinite(etaSeconds) && (
-        <span>ETA: {Math.max(0, etaSeconds).toFixed(0)}s</span>
-      )}
-    </div>
-  );
-}
diff --git a/apps/client/src/app/lib/api.ts b/apps/client/src/app/lib/api.ts
deleted file mode 100644
index 67f64a05709e5bd15b045a1f133a5c828bf2791c..0000000000000000000000000000000000000000
--- a/apps/client/src/app/lib/api.ts
+++ /dev/null
@@ -1,50 +0,0 @@
-import { invoke } from "@tauri-apps/api/tauri";
-import type { FileEntry } from "../components/FilePicker";
-
-type SendOptions = {
-  encrypt?: boolean;
-  password?: string;
-};
-
-export interface TransferStatus {
-  sessionId: string;
-  totalBytes: number;
-  transferredBytes: number;
-  fileProgress: Array<{
-    path: string;
-    transferred: number;
-    total: number;
-    done: boolean;
-  }>;
-  rate: number;
-  etaSeconds: number | null;
-  state: string;
-}
-
-export async function sendFiles(
-  sessionId: string,
-  files: FileEntry[],
-  options: SendOptions
-) {
-  return invoke("send_files", { sessionId, files, options });
-}
-
-export async function getStatus(sessionId: string) {
-  return invoke<TransferStatus>("get_status", { sessionId });
-}
-
-export async function startTunnel(localPort: number) {
-  return invoke<{ publicUrl: string }>("start_tunnel", { localPort });
-}
-
-export async function stopTunnel() {
-  return invoke("stop_tunnel");
-}
-
-export async function getSettings() {
-  return invoke<Record<string, unknown>>("get_settings");
-}
-
-export async function setSettings(settings: Record<string, unknown>) {
-  return invoke("set_settings", { settings });
-}
diff --git a/apps/client/src/app/lib/webrtcClient.ts b/apps/client/src/app/lib/webrtcClient.ts
deleted file mode 100644
index 7970b8c089cac90508d63fab25dfabfceb8391b0..0000000000000000000000000000000000000000
--- a/apps/client/src/app/lib/webrtcClient.ts
+++ /dev/null
@@ -1,75 +0,0 @@
-export interface SignalingMessage {
-  type: "register" | "offer" | "answer" | "ice" | "bye";
-  id?: string;
-  from?: string;
-  to?: string;
-  sdp?: string;
-  candidate?: unknown;
-}
-
-export class WebRTCClient {
-  private ws?: WebSocket;
-  private pc?: RTCPeerConnection;
-  private dc?: RTCDataChannel;
-  private remoteId?: string;
-
-  constructor(private signalingUrl: string, private selfId: string) {}
-
-  connect() {
-    this.ws = new WebSocket(this.signalingUrl);
-    this.ws.addEventListener("open", () => {
-      this.send({ type: "register", id: this.selfId });
-    });
-  }
-
-  async createOffer(targetId: string) {
-    this.remoteId = targetId;
-    this.ensurePeerConnection();
-    this.dc = this.pc!.createDataChannel("fluxshare", { ordered: true });
-    const offer = await this.pc!.createOffer();
-    await this.pc!.setLocalDescription(offer);
-    this.send({ type: "offer", from: this.selfId, to: targetId, sdp: offer.sdp });
-  }
-
-  async handleOffer(message: SignalingMessage) {
-    this.remoteId = message.from;
-    this.ensurePeerConnection();
-    await this.pc!.setRemoteDescription({ type: "offer", sdp: message.sdp! });
-    const answer = await this.pc!.createAnswer();
-    await this.pc!.setLocalDescription(answer);
-    this.send({ type: "answer", from: this.selfId, to: message.from, sdp: answer.sdp });
-  }
-
-  async handleAnswer(message: SignalingMessage) {
-    this.remoteId = message.from;
-    await this.pc?.setRemoteDescription({ type: "answer", sdp: message.sdp! });
-  }
-
-  async handleIce(message: SignalingMessage) {
-    if (message.candidate) {
-      await this.pc?.addIceCandidate(message.candidate as RTCIceCandidateInit);
-    }
-  }
-
-  private ensurePeerConnection() {
-    if (this.pc) return;
-    this.pc = new RTCPeerConnection({
-      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
-    });
-
-    this.pc.addEventListener("icecandidate", (ev) => {
-      if (ev.candidate && this.remoteId) {
-        this.send({
-          type: "ice",
-          from: this.selfId,
-          to: this.remoteId,
-          candidate: ev.candidate.toJSON(),
-        });
-      }
-    });
-  }
-
-  private send(msg: SignalingMessage) {
-    this.ws?.send(JSON.stringify(msg));
-  }
-}
diff --git a/apps/client/src/app/routes/Logs.tsx b/apps/client/src/app/routes/Logs.tsx
deleted file mode 100644
index 8e3156fd359b94c56b3bdd524dfc4fbe702984b5..0000000000000000000000000000000000000000
--- a/apps/client/src/app/routes/Logs.tsx
+++ /dev/null
@@ -1,36 +0,0 @@
-import { useEffect, useState } from "react";
-import { readTextFile } from "@tauri-apps/api/fs";
-import { homeDir } from "@tauri-apps/api/path";
-import { invoke } from "@tauri-apps/api/tauri";
-
-export default function Logs() {
-  const [content, setContent] = useState<string>("");
-
-  useEffect(() => {
-    async function load() {
-      const dir = await homeDir();
-      const file = `${dir}.fluxshare/logs/latest.log`;
-      try {
-        const text = await readTextFile(file);
-        setContent(text);
-      } catch (err) {
-        setContent(`Sem logs disponíveis ainda. (${String(err)})`);
-      }
-    }
-    load();
-  }, []);
-
-  async function handleOpenFolder() {
-    await invoke("open_logs_folder");
-  }
-
-  return (
-    <div className="space-y-4">
-      <h2 className="text-2xl font-semibold">Logs</h2>
-      <pre className="bg-black/40 text-xs p-4 rounded-lg h-96 overflow-auto border border-white/10 whitespace-pre-wrap">
-        {content}
-      </pre>
-      <button onClick={handleOpenFolder}>Abrir pasta de logs</button>
-    </div>
-  );
-}
diff --git a/apps/client/src/app/routes/Peers.tsx b/apps/client/src/app/routes/Peers.tsx
deleted file mode 100644
index ca4eaed97e28a18005c119c693e8129f98749ad3..0000000000000000000000000000000000000000
--- a/apps/client/src/app/routes/Peers.tsx
+++ /dev/null
@@ -1,40 +0,0 @@
-import { useState } from "react";
-import PeerList from "../components/PeerList";
-
-const dummyPeers = [
-  { id: "alice", status: "online" as const },
-  { id: "bob", status: "offline" as const },
-];
-
-export default function Peers() {
-  const [selfId, setSelfId] = useState("peer-" + crypto.randomUUID().slice(0, 6));
-  const [targetId, setTargetId] = useState("");
-
-  return (
-    <div className="space-y-4">
-      <h2 className="text-2xl font-semibold">Peers</h2>
-      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
-        <div className="space-y-2">
-          <label className="text-sm text-white/70">Seu ID</label>
-          <input
-            className="bg-surface border border-white/10 rounded px-3 py-2 w-full"
-            value={selfId}
-            onChange={(e) => setSelfId(e.target.value)}
-          />
-          <p className="text-xs text-white/40">Compartilhe este ID com quem for enviar/receber arquivos.</p>
-        </div>
-        <div className="space-y-2">
-          <label className="text-sm text-white/70">ID do destinatário</label>
-          <input
-            className="bg-surface border border-white/10 rounded px-3 py-2 w-full"
-            value={targetId}
-            onChange={(e) => setTargetId(e.target.value)}
-          />
-          <p className="text-xs text-white/40">Será usado ao iniciar uma sessão WebRTC ou QUIC.</p>
-        </div>
-      </div>
-
-      <PeerList peers={dummyPeers} onSelect={(peer) => setTargetId(peer.id)} />
-    </div>
-  );
-}
diff --git a/apps/client/src/app/routes/Receive.tsx b/apps/client/src/app/routes/Receive.tsx
deleted file mode 100644
index bbe8bfdcdb3feea41978bcc643aa80e1b4b94122..0000000000000000000000000000000000000000
--- a/apps/client/src/app/routes/Receive.tsx
+++ /dev/null
@@ -1,10 +0,0 @@
-export default function Receive() {
-  return (
-    <div className="space-y-4">
-      <h2 className="text-2xl font-semibold">Receber arquivos</h2>
-      <p className="text-white/70 text-sm">
-        Aguardando ofertas de peers. Configure seu ID na aba "Peers" e mantenha o aplicativo aberto.
-      </p>
-    </div>
-  );
-}
diff --git a/apps/client/src/app/routes/Send.tsx b/apps/client/src/app/routes/Send.tsx
deleted file mode 100644
index d2815247d382460ebd1bf07fde45b6cd9cea51af..0000000000000000000000000000000000000000
--- a/apps/client/src/app/routes/Send.tsx
+++ /dev/null
@@ -1,83 +0,0 @@
-import { useEffect, useMemo, useState } from "react";
-import FilePicker, { FileEntry } from "../components/FilePicker";
-import ProgressBar from "../components/ProgressBar";
-import SpeedMeter from "../components/SpeedMeter";
-import { getStatus, sendFiles } from "../lib/api";
-
-export default function Send() {
-  const [files, setFiles] = useState<FileEntry[]>([]);
-  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
-  const [status, setStatus] = useState<any>(null);
-  const [encrypt, setEncrypt] = useState(false);
-  const [password, setPassword] = useState("");
-
-  useEffect(() => {
-    if (!sessionId) return;
-    const id = setInterval(async () => {
-      const s = await getStatus(sessionId).catch(() => null);
-      if (s) setStatus(s);
-    }, 1000);
-    return () => clearInterval(id);
-  }, [sessionId]);
-
-  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
-
-  async function handleSend() {
-    await sendFiles(sessionId, files, { encrypt, password: encrypt ? password : undefined });
-  }
-
-  return (
-    <div className="space-y-6">
-      <div className="flex items-center gap-4">
-        <FilePicker onFiles={setFiles} />
-        <label className="flex items-center gap-2 text-sm">
-          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
-          Criptografia (ChaCha20-Poly1305)
-        </label>
-        {encrypt && (
-          <input
-            type="password"
-            value={password}
-            onChange={(e) => setPassword(e.target.value)}
-            placeholder="Senha compartilhada"
-            className="bg-surface border border-white/10 rounded px-3 py-2"
-          />
-        )}
-        <button onClick={handleSend} disabled={files.length === 0}>
-          Enviar
-        </button>
-      </div>
-
-      <div className="bg-surface/80 border border-white/10 rounded-lg p-4 space-y-4">
-        <div className="flex items-center justify-between text-sm text-white/80">
-          <span>Arquivos selecionados: {files.length}</span>
-          <span>Total: {(totalSize / (1024 * 1024)).toFixed(2)} MiB</span>
-        </div>
-        {files.map((file) => (
-          <div key={file.path} className="space-y-2 border-t border-white/5 pt-3">
-            <div className="flex justify-between text-sm">
-              <span>{file.name}</span>
-              <span>{(file.size / (1024 * 1024)).toFixed(2)} MiB</span>
-            </div>
-            <ProgressBar
-              value={
-                status?.fileProgress?.find((f: any) => f.path === file.path)?.transferred / file.size || 0
-              }
-            />
-          </div>
-        ))}
-
-        {status && (
-          <div className="space-y-2">
-            <ProgressBar
-              value={status.totalBytes ? status.transferredBytes / status.totalBytes : 0}
-              label={`Progresso total (${status.transferredBytes}/${status.totalBytes} bytes)`}
-            />
-            <SpeedMeter rate={status.rate ?? 0} etaSeconds={status.etaSeconds ?? null} />
-            <div className="text-xs text-white/50">Estado: {status.state}</div>
-          </div>
-        )}
-      </div>
-    </div>
-  );
-}
diff --git a/apps/client/src/app/routes/Settings.tsx b/apps/client/src/app/routes/Settings.tsx
deleted file mode 100644
index a9606416d8d738d8da7eb6075b8061e9efaf6327..0000000000000000000000000000000000000000
--- a/apps/client/src/app/routes/Settings.tsx
+++ /dev/null
@@ -1,80 +0,0 @@
-import { useEffect, useState } from "react";
-import { getSettings, setSettings } from "../lib/api";
-
-interface SettingsData {
-  chunkSize: number;
-  parallelChunks: number;
-  iceTimeoutMs: number;
-  cloudflaredPath: string;
-}
-
-export default function Settings() {
-  const [settings, setState] = useState<SettingsData | null>(null);
-  const [saving, setSaving] = useState(false);
-
-  useEffect(() => {
-    getSettings().then((s) => setState(s as SettingsData));
-  }, []);
-
-  async function handleSave() {
-    if (!settings) return;
-    setSaving(true);
-    try {
-      await setSettings(settings as any);
-    } finally {
-      setSaving(false);
-    }
-  }
-
-  function update<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
-    setState((prev) => (prev ? { ...prev, [key]: value } : prev));
-  }
-
-  if (!settings) return <div>Carregando configurações...</div>;
-
-  return (
-    <div className="space-y-4">
-      <h2 className="text-2xl font-semibold">Configurações</h2>
-      <div className="grid gap-4 max-w-xl">
-        <label className="flex flex-col text-sm text-white/70">
-          Tamanho do chunk (MiB)
-          <input
-            type="number"
-            value={settings.chunkSize / (1024 * 1024)}
-            onChange={(e) => update("chunkSize", Number(e.target.value) * 1024 * 1024)}
-            className="bg-surface border border-white/10 rounded px-3 py-2"
-          />
-        </label>
-        <label className="flex flex-col text-sm text-white/70">
-          Conexões paralelas
-          <input
-            type="number"
-            value={settings.parallelChunks}
-            onChange={(e) => update("parallelChunks", Number(e.target.value))}
-            className="bg-surface border border-white/10 rounded px-3 py-2"
-          />
-        </label>
-        <label className="flex flex-col text-sm text-white/70">
-          Timeout ICE (ms)
-          <input
-            type="number"
-            value={settings.iceTimeoutMs}
-            onChange={(e) => update("iceTimeoutMs", Number(e.target.value))}
-            className="bg-surface border border-white/10 rounded px-3 py-2"
-          />
-        </label>
-        <label className="flex flex-col text-sm text-white/70">
-          Caminho cloudflared
-          <input
-            value={settings.cloudflaredPath}
-            onChange={(e) => update("cloudflaredPath", e.target.value)}
-            className="bg-surface border border-white/10 rounded px-3 py-2"
-          />
-        </label>
-      </div>
-      <button onClick={handleSave} disabled={saving}>
-        {saving ? "Salvando..." : "Salvar"}
-      </button>
-    </div>
-  );
-}
diff --git a/apps/client/src/app/routes/Tunnel.tsx b/apps/client/src/app/routes/Tunnel.tsx
deleted file mode 100644
index 0ec897ea2c41ef4cae27ab24a1e81e3363d18869..0000000000000000000000000000000000000000
--- a/apps/client/src/app/routes/Tunnel.tsx
+++ /dev/null
@@ -1,71 +0,0 @@
-import { useState } from "react";
-import { startTunnel, stopTunnel } from "../lib/api";
-
-export default function Tunnel() {
-  const [url, setUrl] = useState<string | null>(null);
-  const [port, setPort] = useState(8080);
-  const [loading, setLoading] = useState(false);
-
-  async function handleStart() {
-    setLoading(true);
-    try {
-      const { publicUrl } = await startTunnel(port);
-      setUrl(publicUrl);
-    } finally {
-      setLoading(false);
-    }
-  }
-
-  async function handleStop() {
-    setLoading(true);
-    try {
-      await stopTunnel();
-      setUrl(null);
-    } finally {
-      setLoading(false);
-    }
-  }
-
-  return (
-    <div className="space-y-6">
-      <div className="space-y-2">
-        <h2 className="text-2xl font-semibold">Cloudflare Tunnel</h2>
-        <p className="text-sm text-white/70">
-          Cria um túnel rápido usando o cloudflared. O link público serve os arquivos disponibilizados no servidor HTTP local.
-        </p>
-      </div>
-
-      <div className="space-y-4 bg-surface/80 border border-white/10 rounded-lg p-4">
-        <div className="flex items-center gap-4">
-          <label className="text-sm text-white/70">
-            Porta local
-            <input
-              type="number"
-              value={port}
-              onChange={(e) => setPort(Number(e.target.value))}
-              className="block bg-surface border border-white/10 rounded px-3 py-2 mt-1"
-            />
-          </label>
-          <button onClick={handleStart} disabled={loading}>
-            {loading ? "Iniciando..." : "Iniciar Tunnel"}
-          </button>
-          <button onClick={handleStop} disabled={loading}>
-            Parar Tunnel
-          </button>
-        </div>
-
-        {url && (
-          <div className="space-y-2">
-            <div className="text-sm text-white/80">URL pública</div>
-            <div className="bg-black/40 border border-accent/40 rounded px-3 py-2 font-mono text-sm break-all">{url}</div>
-            <button onClick={() => navigator.clipboard.writeText(url)}>Copiar link</button>
-          </div>
-        )}
-
-        <p className="text-xs text-white/50">
-          Aviso: o link é público. Apenas compartilhe com pessoas confiáveis.
-        </p>
-      </div>
-    </div>
-  );
-}
diff --git a/apps/client/src/components/AppShell.tsx b/apps/client/src/components/AppShell.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..e3d8893409c1ca22236f6b51cdc72e6564e52fc0
--- /dev/null
+++ b/apps/client/src/components/AppShell.tsx
@@ -0,0 +1,127 @@
+import { useMemo, type ReactNode } from "react";
+import { useTheme } from "./ThemeProvider";
+import { Button } from "./ui/Button";
+import { Card } from "./ui/Card";
+import { cn } from "../utils/cn";
+
+export interface AppHeaderInfo {
+  roomCode?: string;
+  inviteUrl?: string;
+  onCopyInvite?: () => void;
+}
+
+interface AppShellProps {
+  children: ReactNode;
+  headerInfo?: AppHeaderInfo;
+}
+
+function SunIcon(props: React.SVGProps<SVGSVGElement>) {
+  return (
+    <svg
+      viewBox="0 0 24 24"
+      fill="none"
+      stroke="currentColor"
+      strokeWidth={1.5}
+      {...props}
+    >
+      <path
+        strokeLinecap="round"
+        strokeLinejoin="round"
+        d="M12 5V3m0 18v-2m7-7h2M3 12h2m13.364 6.364 1.414 1.414M4.222 4.222l1.414 1.414m0 12.728L4.222 19.778m15.556-15.556-1.414 1.414M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
+      />
+    </svg>
+  );
+}
+
+function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
+  return (
+    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
+      <path
+        strokeLinecap="round"
+        strokeLinejoin="round"
+        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
+      />
+    </svg>
+  );
+}
+
+export function AppShell({ children, headerInfo }: AppShellProps) {
+  const { theme, toggleTheme } = useTheme();
+
+  const roomLabel = useMemo(() => {
+    if (!headerInfo?.roomCode) return "Nenhuma sala";
+    return headerInfo.roomCode;
+  }, [headerInfo?.roomCode]);
+
+  const handleCopy = () => {
+    if (headerInfo?.onCopyInvite) {
+      headerInfo.onCopyInvite();
+      return;
+    }
+    if (headerInfo?.inviteUrl && typeof navigator !== "undefined" && navigator.clipboard) {
+      navigator.clipboard.writeText(headerInfo.inviteUrl).catch(() => undefined);
+    }
+  };
+
+  return (
+    <div className="app-shell">
+      <div className="app-shell__background">
+        <div className="app-shell__gradient" />
+        <div className="app-shell__mesh" />
+        <div className="app-shell__grid" />
+      </div>
+      <header
+        className="sticky top-0 z-40 border-b border-[var(--card-border)]/60 bg-[var(--card)]/80 backdrop-blur-2xl"
+      >
+        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
+          <div className="flex flex-wrap items-center gap-3">
+            <span className="text-xl font-semibold tracking-tight text-[var(--text)]">
+              FluxShare
+            </span>
+            <span className="text-sm text-[var(--text-muted)]">
+              Compartilhamento P2P em tempo real
+            </span>
+          </div>
+          <div className="flex flex-wrap items-center gap-3">
+            <Card
+              noShadow
+              className="flex items-center gap-3 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/90 px-4 py-2"
+            >
+              <div className="flex flex-col">
+                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
+                  Sala
+                </span>
+                <span className="font-mono text-sm text-[var(--text)]">{roomLabel}</span>
+              </div>
+              <Button
+                variant="ghost"
+                size="sm"
+                disabled={!headerInfo?.inviteUrl && !headerInfo?.onCopyInvite}
+                onClick={handleCopy}
+                className="min-w-[88px] justify-center"
+              >
+                Copiar link
+              </Button>
+            </Card>
+            <Button
+              variant="ghost"
+              size="sm"
+              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
+              onClick={toggleTheme}
+              className="h-10 w-10 rounded-full border border-[var(--card-border)]/70 bg-[var(--card)]/80 p-0"
+            >
+              {theme === "dark" ? (
+                <SunIcon className="h-5 w-5" />
+              ) : (
+                <MoonIcon className="h-5 w-5" />
+              )}
+            </Button>
+          </div>
+        </div>
+      </header>
+      <main className={cn("mx-auto w-full max-w-6xl px-6 pb-16 pt-10", "text-[var(--text)]")}>{children}</main>
+    </div>
+  );
+}
+
+export default AppShell;
diff --git a/apps/client/src/components/PeersPanel.tsx b/apps/client/src/components/PeersPanel.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..ce652a1fd47369a5ee95c68b2135f3c077721ac1
--- /dev/null
+++ b/apps/client/src/components/PeersPanel.tsx
@@ -0,0 +1,115 @@
+import { usePeersStore } from "../store/usePeers";
+import { useTransfersStore } from "../store/useTransfers";
+import { Badge, type BadgeProps } from "./ui/Badge";
+import { Button } from "./ui/Button";
+import { Card } from "./ui/Card";
+
+interface PeersPanelProps {
+  selfPeerId: string;
+  onConnect: (peerId: string) => void;
+  onDisconnect: (peerId: string) => void;
+  onSend: (peerId: string) => void;
+  onCancel: (peerId: string) => void;
+}
+
+function resolvePeerStatus(
+  status: string,
+  transferStatus: string | null,
+): { label: string; variant: BadgeProps["variant"] } {
+  if (transferStatus === "transferring") {
+    return { label: "TRANSFERRING", variant: "accent" };
+  }
+  if (transferStatus === "completed") {
+    return { label: "DONE", variant: "success" };
+  }
+  if (transferStatus === "paused") {
+    return { label: "PAUSED", variant: "accentSecondary" };
+  }
+  if (transferStatus === "cancelled" || transferStatus === "error") {
+    return { label: "DISCONNECTED", variant: "danger" };
+  }
+  if (status === "connecting") {
+    return { label: "CONNECTING", variant: "accentSecondary" };
+  }
+  if (status === "connected") {
+    return { label: "CONNECTED", variant: "success" };
+  }
+  if (status === "failed") {
+    return { label: "DISCONNECTED", variant: "danger" };
+  }
+  return { label: "DISCONNECTED", variant: "neutral" };
+}
+
+export function PeersPanel({ selfPeerId, onConnect, onDisconnect, onSend, onCancel }: PeersPanelProps) {
+  const peers = usePeersStore((state) =>
+    Object.values(state.peers).filter((peer) => peer.peerId !== selfPeerId),
+  );
+  const transfers = useTransfersStore((state) => state.transfers);
+
+  return (
+    <Card className="space-y-6 p-6">
+      <div className="flex flex-col gap-1">
+        <h2 className="text-xl font-semibold text-[var(--text)]">Peers na sala</h2>
+        <p className="text-sm text-[var(--text-muted)]">Você é {selfPeerId || "--"}</p>
+      </div>
+      {peers.length === 0 ? (
+        <p className="rounded-2xl border border-dashed border-[var(--card-border)]/60 bg-[var(--card)]/50 px-4 py-6 text-center text-sm text-[var(--text-muted)]">
+          Aguarde: nenhum peer apareceu na sala ainda.
+        </p>
+      ) : (
+        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
+          {peers.map((peer) => {
+            const transfer = Object.values(transfers).find(
+              (entry) => entry.peerId === peer.peerId,
+            );
+            const badge = resolvePeerStatus(peer.status, transfer?.status ?? null);
+            return (
+              <div
+                key={peer.peerId}
+                className="card-shadow flex h-full flex-col justify-between gap-4 rounded-2xl border border-[var(--card-border)]/80 bg-[var(--card)]/80 p-5 backdrop-blur-2xl transition duration-200 hover:shadow-[0_28px_55px_-30px_rgba(15,23,42,0.6)]"
+              >
+                <div className="space-y-2">
+                  <div className="flex items-center justify-between gap-3">
+                    <div>
+                      <p className="text-base font-semibold text-[var(--text)]">
+                        {peer.displayName}
+                      </p>
+                      <p className="text-xs font-mono text-[var(--text-muted)]">
+                        {peer.peerId}
+                      </p>
+                    </div>
+                    <Badge variant={badge.variant}>{badge.label}</Badge>
+                  </div>
+                  {transfer && (
+                    <p className="text-xs text-[var(--text-muted)]">
+                      Transferência {transfer.status} • {Math.round(
+                        (transfer.bytesTransferred / Math.max(transfer.totalBytes, 1)) * 100,
+                      )}
+                      %
+                    </p>
+                  )}
+                </div>
+                <div className="flex flex-wrap gap-2">
+                  <Button type="button" variant="secondary" onClick={() => onConnect(peer.peerId)}>
+                    Conectar
+                  </Button>
+                  <Button type="button" variant="outline" onClick={() => onDisconnect(peer.peerId)}>
+                    Desconectar
+                  </Button>
+                  <Button type="button" onClick={() => onSend(peer.peerId)}>
+                    Enviar arquivo
+                  </Button>
+                  <Button type="button" variant="danger" onClick={() => onCancel(peer.peerId)}>
+                    Cancelar
+                  </Button>
+                </div>
+              </div>
+            );
+          })}
+        </div>
+      )}
+    </Card>
+  );
+}
+
+export default PeersPanel;
diff --git a/apps/client/src/components/ThemeProvider.tsx b/apps/client/src/components/ThemeProvider.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..876afe756c7ba17c2d8fd19364c8da29d0b3744b
--- /dev/null
+++ b/apps/client/src/components/ThemeProvider.tsx
@@ -0,0 +1,86 @@
+import {
+  createContext,
+  useCallback,
+  useContext,
+  useEffect,
+  useMemo,
+  useState,
+  type ReactNode,
+} from "react";
+
+const STORAGE_KEY = "fluxshare-theme";
+
+type ThemeMode = "light" | "dark";
+
+interface ThemeContextValue {
+  theme: ThemeMode;
+  toggleTheme: () => void;
+}
+
+const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
+
+function getPreferredTheme(): ThemeMode {
+  if (typeof window === "undefined") {
+    return "dark";
+  }
+  const stored = window.localStorage?.getItem(STORAGE_KEY) as ThemeMode | null;
+  if (stored === "light" || stored === "dark") {
+    return stored;
+  }
+  const media = typeof window.matchMedia === "function"
+    ? window.matchMedia("(prefers-color-scheme: dark)")
+    : null;
+  return media?.matches ? "dark" : "light";
+}
+
+function applyTheme(theme: ThemeMode) {
+  if (typeof document === "undefined") return;
+  document.documentElement.dataset.theme = theme;
+}
+
+export function ThemeProvider({ children }: { children: ReactNode }) {
+  const [theme, setTheme] = useState<ThemeMode>(() => {
+    const initial = getPreferredTheme();
+    if (typeof document !== "undefined") {
+      applyTheme(initial);
+    }
+    return initial;
+  });
+
+  useEffect(() => {
+    applyTheme(theme);
+    if (typeof window !== "undefined" && window.localStorage) {
+      window.localStorage.setItem(STORAGE_KEY, theme);
+    }
+  }, [theme]);
+
+  useEffect(() => {
+    const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
+      ? window.matchMedia("(prefers-color-scheme: dark)")
+      : null;
+    if (!media) return;
+    const listener = (event: MediaQueryListEvent) => {
+      const stored = window.localStorage?.getItem(STORAGE_KEY) as ThemeMode | null;
+      if (stored === "light" || stored === "dark") return;
+      setTheme(event.matches ? "dark" : "light");
+    };
+    media.addEventListener("change", listener);
+    return () => media.removeEventListener("change", listener);
+  }, []);
+
+  const toggleTheme = useCallback(() => {
+    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
+  }, []);
+
+  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
+
+  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
+}
+
+export function useTheme() {
+  const context = useContext(ThemeContext);
+  if (!context) {
+    throw new Error("useTheme must be used inside ThemeProvider");
+  }
+  return context;
+}
diff --git a/apps/client/src/components/TransferBox.tsx b/apps/client/src/components/TransferBox.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..92b904d5d7e2062a6c5264429786b8644092743a
--- /dev/null
+++ b/apps/client/src/components/TransferBox.tsx
@@ -0,0 +1,164 @@
+import { useTransfersStore } from "../store/useTransfers";
+import { Badge, type BadgeProps } from "./ui/Badge";
+import { Button } from "./ui/Button";
+import { Card } from "./ui/Card";
+
+interface TransferBoxProps {
+  onPickFile: () => Promise<void>;
+  onResume: (fileId: string) => void;
+  onCancelFile: (fileId: string) => void;
+}
+
+function formatBytes(bytes: number) {
+  if (bytes === 0) return "0 B";
+  const units = ["B", "KB", "MB", "GB", "TB"];
+  const i = Math.floor(Math.log(bytes) / Math.log(1024));
+  const value = bytes / Math.pow(1024, i);
+  return `${value.toFixed(1)} ${units[i]}`;
+}
+
+function formatEta(seconds: number | null) {
+  if (!seconds || seconds === Infinity) return "--";
+  if (seconds < 60) return `${seconds.toFixed(0)}s`;
+  const minutes = Math.floor(seconds / 60);
+  const remaining = Math.floor(seconds % 60);
+  return `${minutes}m ${remaining}s`;
+}
+
+function formatSpeed(speedBytes: number | null) {
+  if (!speedBytes || !Number.isFinite(speedBytes) || speedBytes <= 0) return "--";
+  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
+  let value = speedBytes;
+  let unitIndex = 0;
+  while (value >= 1024 && unitIndex < units.length - 1) {
+    value /= 1024;
+    unitIndex += 1;
+  }
+  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
+}
+
+function resolveTransferBadge(status: string): { variant: BadgeProps["variant"]; label: string } {
+  switch (status) {
+    case "completed":
+      return { variant: "success", label: "COMPLETED" };
+    case "transferring":
+      return { variant: "accent", label: "TRANSFERRING" };
+    case "paused":
+      return { variant: "accentSecondary", label: "PAUSED" };
+    case "cancelled":
+      return { variant: "danger", label: "CANCELLED" };
+    case "error":
+      return { variant: "danger", label: "ERROR" };
+    default:
+      return { variant: "neutral", label: status.toUpperCase() };
+  }
+}
+
+export function TransferBox({ onPickFile, onResume, onCancelFile }: TransferBoxProps) {
+  const { selectedFile, transfer } = useTransfersStore((state) => {
+    const selected = state.selectedFile;
+    return {
+      selectedFile: selected,
+      transfer: selected ? state.transfers[selected.fileId] ?? null : null,
+    };
+  });
+
+  const totalBytes = transfer?.totalBytes ?? selectedFile?.size ?? 0;
+  const transferBadge = transfer ? resolveTransferBadge(transfer.status) : null;
+  const progressPercent = transfer
+    ? Math.min(100, (transfer.bytesTransferred / Math.max(totalBytes, 1)) * 100)
+    : 0;
+  const elapsedSeconds = transfer ? (Date.now() - transfer.startedAt) / 1000 : null;
+  const averageSpeed = transfer && elapsedSeconds && elapsedSeconds > 0
+    ? transfer.bytesTransferred / elapsedSeconds
+    : null;
+  const eta = transfer && averageSpeed && averageSpeed > 0
+    ? (transfer.totalBytes - transfer.bytesTransferred) / averageSpeed
+    : null;
+
+  return (
+    <Card className="flex h-full flex-col gap-6 p-6">
+      <div className="flex flex-wrap items-start justify-between gap-4">
+        <div className="space-y-2">
+          <div className="flex items-center gap-3">
+            <h2 className="text-xl font-semibold text-[var(--text)]">Transferência</h2>
+            {transferBadge && (
+              <Badge variant={transferBadge.variant}>{transferBadge.label}</Badge>
+            )}
+          </div>
+          <p className="text-sm text-[var(--text-muted)]">
+            {selectedFile ? selectedFile.name : "Nenhum arquivo selecionado"}
+          </p>
+        </div>
+        <Button type="button" onClick={() => onPickFile()}>
+          Selecionar arquivo
+        </Button>
+      </div>
+      <div className="space-y-4">
+        {selectedFile ? (
+          <>
+            <div className="grid gap-4 sm:grid-cols-2">
+              <div className="space-y-1">
+                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
+                  Tamanho
+                </span>
+                <p className="text-sm text-[var(--text)]">{formatBytes(selectedFile.size)}</p>
+              </div>
+              <div className="space-y-1">
+                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
+                  Progresso
+                </span>
+                <p className="text-sm text-[var(--text)]">{progressPercent.toFixed(1)}%</p>
+              </div>
+            </div>
+            <div className="space-y-2">
+              <div
+                role="progressbar"
+                aria-valuenow={Math.round(progressPercent)}
+                aria-valuemin={0}
+                aria-valuemax={100}
+                className="h-3 w-full overflow-hidden rounded-full border border-[var(--card-border)]/60 bg-[var(--card)]/50"
+              >
+                <div
+                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
+                  style={{ width: `${progressPercent}%` }}
+                />
+              </div>
+              <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-muted)]">
+                <span>ETA: {formatEta(eta)}</span>
+                <span>Velocidade média: {formatSpeed(averageSpeed)}</span>
+                {transfer && (
+                  <span>
+                    Recebido: {formatBytes(transfer.bytesTransferred)} / {formatBytes(totalBytes)}
+                  </span>
+                )}
+              </div>
+            </div>
+            <div className="flex flex-wrap gap-2">
+              <Button
+                type="button"
+                variant="secondary"
+                onClick={() => selectedFile && onResume(selectedFile.fileId)}
+              >
+                Retomar
+              </Button>
+              <Button
+                type="button"
+                variant="danger"
+                onClick={() => selectedFile && onCancelFile(selectedFile.fileId)}
+              >
+                Cancelar
+              </Button>
+            </div>
+          </>
+        ) : (
+          <div className="rounded-2xl border border-dashed border-[var(--card-border)]/60 bg-[var(--card)]/40 px-6 py-10 text-center text-sm text-[var(--text-muted)]">
+            Escolha um arquivo para iniciar uma nova transferência.
+          </div>
+        )}
+      </div>
+    </Card>
+  );
+}
+
+export default TransferBox;
diff --git a/apps/client/src/components/ui/Badge.tsx b/apps/client/src/components/ui/Badge.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..ab143e06f408964dbb1fec1b6a92898aed1e7e1e
--- /dev/null
+++ b/apps/client/src/components/ui/Badge.tsx
@@ -0,0 +1,28 @@
+import { cn } from "../../utils/cn";
+
+type BadgeVariant = "neutral" | "accent" | "accentSecondary" | "success" | "danger";
+
+export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
+  variant?: BadgeVariant;
+}
+
+const variantClasses: Record<BadgeVariant, string> = {
+  neutral: "bg-white/10 text-[var(--text-muted)]",
+  accent: "bg-[var(--accent)]/25 text-[var(--accent)]",
+  accentSecondary: "bg-[var(--accent-2)]/25 text-[var(--accent-2)]",
+  success: "bg-emerald-500/20 text-emerald-300",
+  danger: "bg-red-500/20 text-red-300",
+};
+
+export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
+  return (
+    <span
+      className={cn(
+        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
+        variantClasses[variant],
+        className,
+      )}
+      {...props}
+    />
+  );
+}
diff --git a/apps/client/src/components/ui/Button.tsx b/apps/client/src/components/ui/Button.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..2bf9a3278a48caf05a1881ba22c2c7fc58785f3f
--- /dev/null
+++ b/apps/client/src/components/ui/Button.tsx
@@ -0,0 +1,48 @@
+import { forwardRef } from "react";
+import { cn } from "../../utils/cn";
+
+type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
+type ButtonSize = "md" | "sm";
+
+export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
+  variant?: ButtonVariant;
+  size?: ButtonSize;
+}
+
+const variantClasses: Record<ButtonVariant, string> = {
+  primary:
+    "bg-[var(--accent)] text-white shadow-[0_20px_45px_-20px_rgba(124,58,237,0.75)] hover:brightness-110",
+  secondary:
+    "bg-[var(--card)]/70 text-[var(--text)] border border-[var(--card-border)]/80 hover:border-[var(--accent)]/70",
+  ghost: "bg-transparent text-[var(--text)] hover:bg-white/10",
+  outline:
+    "border border-[var(--card-border)]/80 text-[var(--text)] hover:border-[var(--accent)]/70",
+  danger: "bg-red-500/80 text-white hover:bg-red-400/90",
+};
+
+const sizeClasses: Record<ButtonSize, string> = {
+  md: "h-10 px-4 text-sm",
+  sm: "h-9 px-3 text-xs",
+};
+
+export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
+  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => {
+    return (
+      <button
+        ref={ref}
+        className={cn(
+          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition duration-200",
+          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2",
+          "disabled:cursor-not-allowed disabled:opacity-50",
+          variantClasses[variant],
+          sizeClasses[size],
+          className,
+        )}
+        disabled={disabled}
+        {...props}
+      />
+    );
+  },
+);
+
+Button.displayName = "Button";
diff --git a/apps/client/src/components/ui/Card.tsx b/apps/client/src/components/ui/Card.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..99538467de136e788feeb5c84c882fedb4867b59
--- /dev/null
+++ b/apps/client/src/components/ui/Card.tsx
@@ -0,0 +1,19 @@
+import { cn } from "../../utils/cn";
+
+interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
+  noShadow?: boolean;
+}
+
+export function Card({ className, noShadow = false, ...props }: CardProps) {
+  return (
+    <div
+      className={cn(
+        "rounded-3xl border border-[var(--card-border)]/80 bg-[var(--card)]/85 backdrop-blur-2xl",
+        "transition-shadow duration-200",
+        noShadow ? undefined : "card-shadow",
+        className,
+      )}
+      {...props}
+    />
+  );
+}
diff --git a/apps/client/src/index.tsx b/apps/client/src/index.tsx
index 93d407cedaf6a6328877da9f005d9e4c0ac6094b..d667eac89b1e70302da4275918a6eee54c8a904e 100644
--- a/apps/client/src/index.tsx
+++ b/apps/client/src/index.tsx
@@ -1,32 +1,25 @@
 import React from "react";
 import ReactDOM from "react-dom/client";
 import { RouterProvider, createBrowserRouter } from "react-router-dom";
 import App from "./App";
-import Send from "./app/routes/Send";
-import Receive from "./app/routes/Receive";
-import Peers from "./app/routes/Peers";
-import Tunnel from "./app/routes/Tunnel";
-import Settings from "./app/routes/Settings";
-import Logs from "./app/routes/Logs";
-import "./styles.css";
+import HomePage from "./pages/Home";
+import RoomPage from "./pages/Room";
+import "./styles/base.css";
+import "./styles/theme.css";
 
 const router = createBrowserRouter([
   {
     path: "/",
     element: <App />,
     children: [
-      { index: true, element: <Send /> },
-      { path: "receive", element: <Receive /> },
-      { path: "peers", element: <Peers /> },
-      { path: "tunnel", element: <Tunnel /> },
-      { path: "settings", element: <Settings /> },
-      { path: "logs", element: <Logs /> },
+      { index: true, element: <HomePage /> },
+      { path: "room/:code", element: <RoomPage /> },
     ],
   },
 ]);
 
 ReactDOM.createRoot(document.getElementById("root")!).render(
   <React.StrictMode>
     <RouterProvider router={router} />
   </React.StrictMode>
 );
diff --git a/apps/client/src/lib/persist/indexeddb.ts b/apps/client/src/lib/persist/indexeddb.ts
new file mode 100644
index 0000000000000000000000000000000000000000..009b0fc5a48f778ee85ab8a960fbdefdb441dfb2
--- /dev/null
+++ b/apps/client/src/lib/persist/indexeddb.ts
@@ -0,0 +1,74 @@
+import { openDB, IDBPDatabase } from "idb";
+
+const DB_NAME = "fluxshare";
+const DB_VERSION = 1;
+const HANDLE_STORE = "handles";
+const CHECKPOINT_STORE = "checkpoints";
+
+export interface TransferCheckpoint {
+  fileId: string;
+  nextChunkIndex: number;
+  receivedBytes: number;
+  updatedAt: number;
+}
+
+type FluxshareDB = IDBPDatabase<unknown>;
+
+let dbPromise: Promise<FluxshareDB> | null = null;
+
+async function getDb(): Promise<FluxshareDB> {
+  if (!dbPromise) {
+    dbPromise = openDB(DB_NAME, DB_VERSION, {
+      upgrade(db) {
+        if (!db.objectStoreNames.contains(HANDLE_STORE)) {
+          db.createObjectStore(HANDLE_STORE);
+        }
+        if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
+          db.createObjectStore(CHECKPOINT_STORE);
+        }
+      },
+    });
+  }
+  return dbPromise;
+}
+
+export async function saveFileHandle(fileId: string, handle: FileSystemFileHandle) {
+  const db = await getDb();
+  await db.put(HANDLE_STORE, handle, fileId);
+}
+
+export async function getFileHandle(fileId: string) {
+  const db = await getDb();
+  return (await db.get(HANDLE_STORE, fileId)) as FileSystemFileHandle | undefined;
+}
+
+export async function removeFileHandle(fileId: string) {
+  const db = await getDb();
+  await db.delete(HANDLE_STORE, fileId);
+}
+
+export async function saveCheckpoint(checkpoint: TransferCheckpoint) {
+  const db = await getDb();
+  await db.put(CHECKPOINT_STORE, checkpoint, checkpoint.fileId);
+}
+
+export async function getCheckpoint(fileId: string) {
+  const db = await getDb();
+  return (await db.get(CHECKPOINT_STORE, fileId)) as TransferCheckpoint | undefined;
+}
+
+export async function getAllCheckpoints() {
+  const db = await getDb();
+  const values: TransferCheckpoint[] = [];
+  let cursor = await db.transaction(CHECKPOINT_STORE).store.openCursor();
+  while (cursor) {
+    values.push(cursor.value as TransferCheckpoint);
+    cursor = await cursor.continue();
+  }
+  return values;
+}
+
+export async function clearCheckpoint(fileId: string) {
+  const db = await getDb();
+  await db.delete(CHECKPOINT_STORE, fileId);
+}
diff --git a/apps/client/src/lib/persist/tauri.ts b/apps/client/src/lib/persist/tauri.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7deb3249fdac87d35fa36cbb838773d1896d4421
--- /dev/null
+++ b/apps/client/src/lib/persist/tauri.ts
@@ -0,0 +1,43 @@
+import { exists, readTextFile } from "@tauri-apps/api/fs";
+import { invoke } from "@tauri-apps/api/tauri";
+
+export function isTauri() {
+  return typeof window !== "undefined" && "__TAURI_IPC__" in window;
+}
+
+export async function ensureFile(path: string) {
+  if (!(await exists(path))) {
+    throw new Error(`File not found: ${path}`);
+  }
+}
+
+export async function readFileRange(path: string, start: number, length: number): Promise<ArrayBuffer> {
+  const bytes = (await invoke("read_file_range", { path, start, length })) as number[];
+  return Uint8Array.from(bytes).buffer;
+}
+
+export async function writeFileRange(path: string, start: number, data: Uint8Array) {
+  await invoke("write_file_range", { path, start, bytes: Array.from(data) });
+}
+
+export async function readFileText(path: string) {
+  return readTextFile(path);
+}
+
+export async function getFileInfo(path: string) {
+  const entries = (await invoke("list_files", { paths: [path] })) as Array<{
+    size: number;
+    checksum?: string | null;
+    isDir: boolean;
+    name: string;
+    path: string;
+  }>;
+  const [entry] = entries;
+  if (!entry) {
+    throw new Error(`File not found: ${path}`);
+  }
+  return {
+    size: entry.size ?? 0,
+    createdAt: undefined as number | undefined,
+  };
+}
diff --git a/apps/client/src/lib/signaling.ts b/apps/client/src/lib/signaling.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d5b4780e4c43419ff8e256916b333505a9cdfbf0
--- /dev/null
+++ b/apps/client/src/lib/signaling.ts
@@ -0,0 +1,199 @@
+import { nanoid } from "nanoid";
+import {
+  SignalingClientMessage,
+  SignalingHeartbeat,
+  SignalingPeer,
+  SignalingServerMessage,
+  signalingServerMessageSchema,
+} from "../types/protocol";
+import { getEnv } from "../utils/env";
+
+export type SignalingEventMap = {
+  open: void;
+  close: { willReconnect: boolean };
+  peers: SignalingPeer[];
+  "peer-joined": SignalingPeer;
+  "peer-left": { peerId: string };
+  signal: { from: string; to: string; data: unknown };
+  error: { error: Error };
+};
+
+export type SignalingEvent = keyof SignalingEventMap;
+
+const HEARTBEAT_INTERVAL = 10_000;
+const RECONNECT_DELAY = 2_000;
+
+class TypedEventEmitter {
+  private listeners = new Map<SignalingEvent, Set<(payload: any) => void>>();
+
+  on<T extends SignalingEvent>(event: T, handler: (payload: SignalingEventMap[T]) => void) {
+    if (!this.listeners.has(event)) {
+      this.listeners.set(event, new Set());
+    }
+    this.listeners.get(event)!.add(handler as any);
+    return () => this.off(event, handler as any);
+  }
+
+  off<T extends SignalingEvent>(event: T, handler: (payload: SignalingEventMap[T]) => void) {
+    this.listeners.get(event)?.delete(handler as any);
+  }
+
+  emit<T extends SignalingEvent>(event: T, payload: SignalingEventMap[T]) {
+    this.listeners.get(event)?.forEach((handler) => {
+      try {
+        handler(payload);
+      } catch (error) {
+        console.error("fluxshare:signaling:listener", error);
+      }
+    });
+  }
+}
+
+export interface SignalingClientOptions {
+  room: string;
+  peerId?: string;
+  displayName: string;
+}
+
+export class SignalingClient {
+  private readonly url: string;
+  private readonly room: string;
+  private readonly displayName: string;
+  private readonly emitter = new TypedEventEmitter();
+  private ws: WebSocket | null = null;
+  private heartbeatTimer: number | null = null;
+  private reconnectTimer: number | null = null;
+  private manualClose = false;
+  public readonly peerId: string;
+
+  constructor(options: SignalingClientOptions) {
+    const { signalingUrl } = getEnv();
+    this.url = signalingUrl;
+    this.room = options.room;
+    this.displayName = options.displayName;
+    this.peerId = options.peerId ?? nanoid(10);
+  }
+
+  on = this.emitter.on.bind(this.emitter);
+  off = this.emitter.off.bind(this.emitter);
+
+  connect() {
+    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
+      return;
+    }
+    this.manualClose = false;
+    const ws = new WebSocket(this.url);
+    this.ws = ws;
+
+    ws.addEventListener("open", () => {
+      console.log("fluxshare:signaling", "connected");
+      this.send({
+        type: "join",
+        room: this.room,
+        peerId: this.peerId,
+        displayName: this.displayName,
+      });
+      this.startHeartbeat();
+      this.emitter.emit("open", undefined);
+    });
+
+    ws.addEventListener("close", () => {
+      console.log("fluxshare:signaling", "closed");
+      this.stopHeartbeat();
+      const shouldReconnect = !this.manualClose;
+      if (shouldReconnect) {
+        this.scheduleReconnect();
+      }
+      this.emitter.emit("close", { willReconnect: shouldReconnect });
+    });
+
+    ws.addEventListener("error", (event) => {
+      console.error("fluxshare:signaling", "error", event);
+      this.emitter.emit("error", { error: new Error("signaling socket error") });
+    });
+
+    ws.addEventListener("message", (event) => {
+      try {
+        const payload = JSON.parse(event.data.toString());
+        const parsed: SignalingServerMessage = signalingServerMessageSchema.parse(payload);
+        this.handleServerMessage(parsed);
+      } catch (error) {
+        console.error("fluxshare:signaling", "invalid payload", error);
+      }
+    });
+  }
+
+  disconnect() {
+    this.manualClose = true;
+    this.stopHeartbeat();
+    if (this.reconnectTimer !== null) {
+      clearTimeout(this.reconnectTimer);
+      this.reconnectTimer = null;
+    }
+    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
+      this.send({ type: "leave", room: this.room, peerId: this.peerId });
+    }
+    this.ws?.close();
+    this.ws = null;
+  }
+
+  sendSignal(to: string, data: unknown) {
+    this.send({ type: "signal", room: this.room, from: this.peerId, to, data });
+  }
+
+  private scheduleReconnect() {
+    if (this.reconnectTimer !== null) {
+      return;
+    }
+    this.reconnectTimer = window.setTimeout(() => {
+      this.reconnectTimer = null;
+      this.connect();
+    }, RECONNECT_DELAY);
+  }
+
+  private startHeartbeat() {
+    this.stopHeartbeat();
+    this.heartbeatTimer = window.setInterval(() => {
+      const heartbeat: SignalingHeartbeat = { type: "heartbeat", peerId: this.peerId };
+      this.send(heartbeat);
+    }, HEARTBEAT_INTERVAL) as unknown as number;
+  }
+
+  private stopHeartbeat() {
+    if (this.heartbeatTimer !== null) {
+      clearInterval(this.heartbeatTimer);
+      this.heartbeatTimer = null;
+    }
+  }
+
+  private send(message: SignalingClientMessage) {
+    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
+      console.warn("fluxshare:signaling", "socket not ready, dropping", message.type);
+      return;
+    }
+    this.ws.send(JSON.stringify(message));
+  }
+
+  private handleServerMessage(message: SignalingServerMessage) {
+    switch (message.type) {
+      case "peers":
+        this.emitter.emit("peers", message.peers);
+        break;
+      case "peer-joined":
+        this.emitter.emit("peer-joined", message.peer);
+        break;
+      case "peer-left":
+        this.emitter.emit("peer-left", { peerId: message.peerId });
+        break;
+      case "signal":
+        this.emitter.emit("signal", {
+          from: message.from,
+          to: message.to,
+          data: message.data,
+        });
+        break;
+      default:
+        break;
+    }
+  }
+}
diff --git a/apps/client/src/lib/webrtc/PeerManager.ts b/apps/client/src/lib/webrtc/PeerManager.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bb1314e3dd9dd534640000c998f3c569eb1bedf3
--- /dev/null
+++ b/apps/client/src/lib/webrtc/PeerManager.ts
@@ -0,0 +1,185 @@
+import { SignalingClient } from "../signaling";
+import { getEnv } from "../../utils/env";
+
+export type PeerConnectionState =
+  | "new"
+  | "connecting"
+  | "connected"
+  | "disconnected"
+  | "failed"
+  | "closed";
+
+export type PeerManagerEventMap = {
+  "connection-state": { peerId: string; state: PeerConnectionState };
+  "data-channel": { peerId: string; channel: RTCDataChannel };
+  "ice-connection-state": { peerId: string; state: RTCIceConnectionState };
+};
+
+export type PeerManagerEvent = keyof PeerManagerEventMap;
+
+export type PeerSignal =
+  | { type: "offer"; sdp: RTCSessionDescriptionInit }
+  | { type: "answer"; sdp: RTCSessionDescriptionInit }
+  | { type: "candidate"; candidate: RTCIceCandidateInit };
+
+class EventEmitter {
+  private listeners = new Map<PeerManagerEvent, Set<(payload: any) => void>>();
+
+  on<T extends PeerManagerEvent>(event: T, handler: (payload: PeerManagerEventMap[T]) => void) {
+    if (!this.listeners.has(event)) {
+      this.listeners.set(event, new Set());
+    }
+    this.listeners.get(event)!.add(handler as any);
+    return () => this.off(event, handler as any);
+  }
+
+  off<T extends PeerManagerEvent>(event: T, handler: (payload: PeerManagerEventMap[T]) => void) {
+    this.listeners.get(event)?.delete(handler as any);
+  }
+
+  emit<T extends PeerManagerEvent>(event: T, payload: PeerManagerEventMap[T]) {
+    this.listeners.get(event)?.forEach((listener) => {
+      try {
+        listener(payload);
+      } catch (error) {
+        console.error("fluxshare:peer-manager:listener", error);
+      }
+    });
+  }
+}
+
+interface PeerConnectionEntry {
+  peerId: string;
+  connection: RTCPeerConnection;
+  channel: RTCDataChannel | null;
+  isOffering: boolean;
+}
+
+export class PeerManager {
+  private readonly signaling: SignalingClient;
+  private readonly emitter = new EventEmitter();
+  private readonly peers = new Map<string, PeerConnectionEntry>();
+
+  constructor(signaling: SignalingClient) {
+    this.signaling = signaling;
+    this.signaling.on("signal", ({ from, data }) => {
+      this.handleSignal(from, data as PeerSignal);
+    });
+  }
+
+  on = this.emitter.on.bind(this.emitter);
+  off = this.emitter.off.bind(this.emitter);
+
+  async connectTo(peerId: string) {
+    const entry = this.ensurePeer(peerId);
+    entry.isOffering = true;
+    const channel = entry.connection.createDataChannel("fluxshare", {
+      ordered: true,
+    });
+    this.prepareDataChannel(peerId, channel);
+    const offer = await entry.connection.createOffer();
+    await entry.connection.setLocalDescription(offer);
+    this.signaling.sendSignal(peerId, { type: "offer", sdp: offer });
+    return channel;
+  }
+
+  async handleSignal(from: string, signal: PeerSignal) {
+    const entry = this.ensurePeer(from);
+    switch (signal.type) {
+      case "offer": {
+        entry.isOffering = false;
+        await entry.connection.setRemoteDescription(signal.sdp);
+        const answer = await entry.connection.createAnswer();
+        await entry.connection.setLocalDescription(answer);
+        this.signaling.sendSignal(from, { type: "answer", sdp: answer });
+        break;
+      }
+      case "answer": {
+        await entry.connection.setRemoteDescription(signal.sdp);
+        break;
+      }
+      case "candidate": {
+        if (signal.candidate) {
+          try {
+            await entry.connection.addIceCandidate(signal.candidate);
+          } catch (error) {
+            console.error("fluxshare:peer-manager", "failed to add ICE", error);
+          }
+        }
+        break;
+      }
+      default:
+        break;
+    }
+  }
+
+  disconnect(peerId: string) {
+    const entry = this.peers.get(peerId);
+    if (!entry) return;
+    entry.connection.close();
+    this.peers.delete(peerId);
+  }
+
+  private ensurePeer(peerId: string): PeerConnectionEntry {
+    const existing = this.peers.get(peerId);
+    if (existing) {
+      return existing;
+    }
+
+    const { iceServers } = getEnv();
+    const connection = new RTCPeerConnection({ iceServers });
+    const entry: PeerConnectionEntry = {
+      peerId,
+      connection,
+      channel: null,
+      isOffering: false,
+    };
+
+    connection.onicecandidate = (event) => {
+      if (event.candidate) {
+        this.signaling.sendSignal(peerId, { type: "candidate", candidate: event.candidate.toJSON() });
+      }
+    };
+
+    connection.onconnectionstatechange = () => {
+      const state = connection.connectionState as PeerConnectionState;
+      this.emitter.emit("connection-state", { peerId, state });
+      if (state === "failed" || state === "closed" || state === "disconnected") {
+        // leave data channel cleanup to consumer
+      }
+    };
+
+    connection.oniceconnectionstatechange = () => {
+      this.emitter.emit("ice-connection-state", {
+        peerId,
+        state: connection.iceConnectionState,
+      });
+    };
+
+    connection.ondatachannel = (event) => {
+      const channel = event.channel;
+      this.prepareDataChannel(peerId, channel);
+    };
+
+    this.peers.set(peerId, entry);
+    return entry;
+  }
+
+  private prepareDataChannel(peerId: string, channel: RTCDataChannel) {
+    const entry = this.peers.get(peerId);
+    if (!entry) return;
+    channel.binaryType = "arraybuffer";
+    channel.bufferedAmountLowThreshold = 1_000_000;
+    entry.channel = channel;
+    channel.addEventListener("open", () => {
+      console.log("fluxshare:webrtc", `datachannel open with ${peerId}`);
+      this.emitter.emit("data-channel", { peerId, channel });
+    });
+    channel.addEventListener("close", () => {
+      console.log("fluxshare:webrtc", `datachannel closed with ${peerId}`);
+    });
+    channel.addEventListener("error", (event) => {
+      console.error("fluxshare:webrtc", "datachannel error", event);
+    });
+  }
+}
diff --git a/apps/client/src/lib/webrtc/transfer.ts b/apps/client/src/lib/webrtc/transfer.ts
new file mode 100644
index 0000000000000000000000000000000000000000..eb5ba12ffc2331a81027bbcc681db3d679844dfa
--- /dev/null
+++ b/apps/client/src/lib/webrtc/transfer.ts
@@ -0,0 +1,294 @@
+export const CHUNK_SIZE = 16_384;
+export const BACKPRESSURE_HIGH = 8_000_000;
+export const BACKPRESSURE_LOW = 1_000_000;
+
+export type TransferManifest = {
+  type: "MANIFEST";
+  fileId: string;
+  name: string;
+  size: number;
+  mime?: string;
+  chunkSize: number;
+  totalChunks: number;
+};
+
+export type TransferAck = { type: "ACK"; nextChunkIndex: number };
+export type TransferDone = { type: "DONE" };
+export type TransferCancel = { type: "CANCEL"; reason?: string };
+export type TransferResumeRequest = {
+  type: "RESUME_REQ";
+  fileId: string;
+  haveUntilChunk: number;
+};
+export type TransferResumeOk = { type: "RESUME_OK"; startFrom: number };
+
+export type ControlMessage =
+  | TransferManifest
+  | TransferAck
+  | TransferDone
+  | TransferCancel
+  | TransferResumeRequest
+  | TransferResumeOk;
+
+export type TransferEventMap = {
+  progress: { fileId: string; bytesSent: number; totalBytes: number; chunkIndex: number };
+  completed: { fileId: string };
+  cancelled: { fileId: string; reason?: string };
+  error: { fileId: string; error: Error };
+  "chunk-received": { fileId: string; chunkIndex: number; chunk: ArrayBuffer };
+  manifest: { manifest: TransferManifest };
+};
+
+export type TransferEvent = keyof TransferEventMap;
+
+class TransferEmitter {
+  private listeners = new Map<TransferEvent, Set<(payload: any) => void>>();
+
+  on<T extends TransferEvent>(event: T, handler: (payload: TransferEventMap[T]) => void) {
+    if (!this.listeners.has(event)) {
+      this.listeners.set(event, new Set());
+    }
+    this.listeners.get(event)!.add(handler as any);
+    return () => this.off(event, handler as any);
+  }
+
+  off<T extends TransferEvent>(event: T, handler: (payload: TransferEventMap[T]) => void) {
+    this.listeners.get(event)?.delete(handler as any);
+  }
+
+  emit<T extends TransferEvent>(event: T, payload: TransferEventMap[T]) {
+    this.listeners.get(event)?.forEach((listener) => {
+      try {
+        listener(payload);
+      } catch (error) {
+        console.error("fluxshare:transfer:listener", error);
+      }
+    });
+  }
+}
+
+export interface ChunkProvider {
+  getChunk(index: number): Promise<ArrayBuffer>;
+}
+
+export interface ChunkWriter {
+  (index: number, chunk: ArrayBuffer): Promise<void> | void;
+}
+
+export class FileSender {
+  private readonly channel: RTCDataChannel;
+  private readonly emitter = new TransferEmitter();
+  private manifest: TransferManifest | null = null;
+  private provider: ChunkProvider | null = null;
+  private nextIndex = 0;
+  private sending = false;
+
+  constructor(channel: RTCDataChannel) {
+    this.channel = channel;
+    this.channel.addEventListener("message", (event) => {
+      if (typeof event.data === "string") {
+        const message = parseControlMessage(event.data);
+        if (message) {
+          this.handleControl(message);
+        }
+      }
+    });
+  }
+
+  on = this.emitter.on.bind(this.emitter);
+  off = this.emitter.off.bind(this.emitter);
+
+  async start(manifest: TransferManifest, provider: ChunkProvider) {
+    this.manifest = manifest;
+    this.provider = provider;
+    this.nextIndex = 0;
+    this.sending = true;
+    this.sendControl(manifest);
+  }
+
+  cancel(reason?: string) {
+    this.sendControl({ type: "CANCEL", reason });
+    this.sending = false;
+  }
+
+  private async handleControl(message: ControlMessage) {
+    if (!this.manifest) {
+      return;
+    }
+    switch (message.type) {
+      case "ACK": {
+        this.nextIndex = message.nextChunkIndex;
+        await this.sendChunks();
+        break;
+      }
+      case "CANCEL": {
+        this.sending = false;
+        this.emitter.emit("cancelled", { fileId: this.manifest.fileId, reason: message.reason });
+        break;
+      }
+      case "RESUME_REQ": {
+        this.nextIndex = message.haveUntilChunk;
+        this.sendControl({ type: "RESUME_OK", startFrom: this.nextIndex });
+        await this.sendChunks();
+        break;
+      }
+      default:
+        break;
+    }
+  }
+
+  private async sendChunks() {
+    if (!this.manifest || !this.provider || !this.sending) return;
+    for (let index = this.nextIndex; index < this.manifest.totalChunks; index += 1) {
+      if (!this.sending) {
+        this.nextIndex = index;
+        return;
+      }
+      const chunk = await this.provider.getChunk(index);
+      await this.waitForBackpressure();
+      this.channel.send(chunk);
+      this.emitter.emit("progress", {
+        fileId: this.manifest.fileId,
+        bytesSent: Math.min((index + 1) * this.manifest.chunkSize, this.manifest.size),
+        totalBytes: this.manifest.size,
+        chunkIndex: index,
+      });
+      this.nextIndex = index + 1;
+    }
+    this.sendControl({ type: "DONE" });
+    this.emitter.emit("completed", { fileId: this.manifest.fileId });
+    this.sending = false;
+  }
+
+  private waitForBackpressure(): Promise<void> {
+    if (this.channel.bufferedAmount <= BACKPRESSURE_HIGH) {
+      return Promise.resolve();
+    }
+    return new Promise((resolve) => {
+      const listener = () => {
+        if (this.channel.bufferedAmount <= BACKPRESSURE_LOW) {
+          this.channel.removeEventListener("bufferedamountlow", listener);
+          resolve();
+        }
+      };
+      this.channel.addEventListener("bufferedamountlow", listener);
+    });
+  }
+
+  private sendControl(message: ControlMessage) {
+    this.channel.send(JSON.stringify(message));
+  }
+}
+
+export class FileReceiver {
+  private readonly channel: RTCDataChannel;
+  private readonly emitter = new TransferEmitter();
+  private writer: ChunkWriter | null = null;
+  private manifest: TransferManifest | null = null;
+  private chunkCounter = 0;
+  private bytesReceived = 0;
+
+  constructor(channel: RTCDataChannel) {
+    this.channel = channel;
+    this.channel.addEventListener("message", (event) => {
+      if (typeof event.data === "string") {
+        const control = parseControlMessage(event.data);
+        if (control) {
+          this.handleControl(control);
+        }
+      } else if (event.data instanceof ArrayBuffer) {
+        this.handleChunk(event.data);
+      } else if (event.data instanceof Blob) {
+        event.data.arrayBuffer().then((buffer) => this.handleChunk(buffer));
+      }
+    });
+  }
+
+  on = this.emitter.on.bind(this.emitter);
+  off = this.emitter.off.bind(this.emitter);
+
+  async setWriter(writer: ChunkWriter) {
+    this.writer = writer;
+  }
+
+  private async handleControl(message: ControlMessage) {
+    switch (message.type) {
+      case "MANIFEST": {
+        this.manifest = message;
+        this.chunkCounter = 0;
+        this.bytesReceived = 0;
+        this.emitter.emit("manifest", { manifest: message });
+        this.sendControl({ type: "ACK", nextChunkIndex: 0 });
+        break;
+      }
+      case "DONE": {
+        if (this.manifest) {
+          this.emitter.emit("completed", { fileId: this.manifest.fileId });
+        }
+        break;
+      }
+      case "CANCEL": {
+        if (this.manifest) {
+          this.emitter.emit("cancelled", { fileId: this.manifest.fileId, reason: message.reason });
+        }
+        break;
+      }
+      case "RESUME_OK": {
+        this.chunkCounter = message.startFrom;
+        this.bytesReceived = message.startFrom * (this.manifest?.chunkSize ?? 0);
+        break;
+      }
+      default:
+        break;
+    }
+  }
+
+  private async handleChunk(chunk: ArrayBuffer) {
+    if (!this.manifest) return;
+    const index = this.chunkCounter;
+    this.chunkCounter += 1;
+    this.bytesReceived += chunk.byteLength;
+    if (this.writer) {
+      await this.writer(index, chunk);
+    }
+    this.emitter.emit("chunk-received", {
+      fileId: this.manifest.fileId,
+      chunkIndex: index,
+      chunk,
+    });
+    if (this.chunkCounter % 128 === 0 || this.chunkCounter >= this.manifest.totalChunks) {
+      this.sendControl({ type: "ACK", nextChunkIndex: this.chunkCounter });
+    }
+    if (this.chunkCounter >= this.manifest.totalChunks) {
+      this.sendControl({ type: "DONE" });
+      this.emitter.emit("completed", { fileId: this.manifest.fileId });
+    }
+  }
+
+  requestResume(haveUntilChunk: number) {
+    if (!this.manifest) return;
+    this.sendControl({ type: "RESUME_REQ", fileId: this.manifest.fileId, haveUntilChunk });
+  }
+
+  cancel(reason?: string) {
+    if (!this.manifest) return;
+    this.sendControl({ type: "CANCEL", reason });
+  }
+
+  private sendControl(message: ControlMessage) {
+    this.channel.send(JSON.stringify(message));
+  }
+}
+
+function parseControlMessage(data: string): ControlMessage | null {
+  try {
+    const parsed = JSON.parse(data);
+    if (!parsed || typeof parsed.type !== "string") {
+      return null;
+    }
+    return parsed as ControlMessage;
+  } catch (error) {
+    console.error("fluxshare:transfer", "invalid control message", error);
+    return null;
+  }
+}
diff --git a/apps/client/src/pages/Home.tsx b/apps/client/src/pages/Home.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..aba6b0e13a1d18b57cdfc278921b5093efa04229
--- /dev/null
+++ b/apps/client/src/pages/Home.tsx
@@ -0,0 +1,53 @@
+import { FormEvent, useEffect, useState } from "react";
+import { useNavigate, useOutletContext } from "react-router-dom";
+import { nanoid } from "nanoid";
+import { Card } from "../components/ui/Card";
+import { Button } from "../components/ui/Button";
+import type { AppOutletContext } from "../App";
+
+export function HomePage() {
+  const [code, setCode] = useState("");
+  const navigate = useNavigate();
+  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
+
+  useEffect(() => {
+    setHeaderInfo({});
+  }, [setHeaderInfo]);
+
+  function handleSubmit(event: FormEvent) {
+    event.preventDefault();
+    const trimmed = code.trim() || nanoid(6).toUpperCase();
+    navigate(`/room/${trimmed}`);
+  }
+
+  return (
+    <div className="mx-auto max-w-xl">
+      <Card className="space-y-6 p-6">
+        <div className="space-y-2">
+          <h1 className="text-3xl font-bold text-[var(--text)]">FluxShare</h1>
+          <p className="text-sm text-[var(--text-muted)]">
+            Entre com um código de sala para iniciar uma sessão de compartilhamento P2P.
+          </p>
+        </div>
+        <form onSubmit={handleSubmit} className="space-y-4">
+          <div className="space-y-2">
+            <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
+              Código da sala
+            </label>
+            <input
+              className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
+              value={code}
+              onChange={(event) => setCode(event.target.value.toUpperCase())}
+              placeholder="Ex: AB12CD"
+            />
+          </div>
+          <Button type="submit" className="w-full">
+            Entrar ou criar sala
+          </Button>
+        </form>
+      </Card>
+    </div>
+  );
+}
+
+export default HomePage;
diff --git a/apps/client/src/pages/Room.tsx b/apps/client/src/pages/Room.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..d03754390b334c1acbc489d3d343835c9a5941c8
--- /dev/null
+++ b/apps/client/src/pages/Room.tsx
@@ -0,0 +1,606 @@
+import { useCallback, useEffect, useMemo, useRef, useState } from "react";
+import { useNavigate, useOutletContext, useParams } from "react-router-dom";
+import { nanoid } from "nanoid";
+import PeersPanel from "../components/PeersPanel";
+import TransferBox from "../components/TransferBox";
+import { usePeersStore, PeerConnectionStatus } from "../store/usePeers";
+import { useTransfersStore } from "../store/useTransfers";
+import { SignalingClient } from "../lib/signaling";
+import { PeerManager } from "../lib/webrtc/PeerManager";
+import { FileReceiver, FileSender, TransferManifest, CHUNK_SIZE } from "../lib/webrtc/transfer";
+import { getFileHandle, saveFileHandle, saveCheckpoint, getCheckpoint, clearCheckpoint } from "../lib/persist/indexeddb";
+import { isTauri, getFileInfo, readFileRange, writeFileRange } from "../lib/persist/tauri";
+import type { ChunkProvider } from "../lib/webrtc/transfer";
+import { Button } from "../components/ui/Button";
+import { Card } from "../components/ui/Card";
+import type { AppOutletContext } from "../App";
+
+import FileReaderWorker from "../workers/fileReader.worker?worker";
+
+interface PeerControllers {
+  channel: RTCDataChannel;
+  sender: FileSender;
+  receiver: FileReceiver;
+  provider?: ChunkProvider & { dispose?: () => void };
+}
+
+type DownloadWriter =
+  | { type: "web"; writer: FileSystemWritableFileStream; handle: FileSystemFileHandle }
+  | { type: "tauri"; path: string };
+
+function generateDisplayName() {
+  const key = "fluxshare-display-name";
+  if (typeof localStorage !== "undefined") {
+    const stored = localStorage.getItem(key);
+    if (stored) return stored;
+    const generated = `Peer-${nanoid(6)}`;
+    localStorage.setItem(key, generated);
+    return generated;
+  }
+  return `Peer-${nanoid(6)}`;
+}
+
+async function computeFileId(name: string, size: number, lastModified: number) {
+  const encoder = new TextEncoder();
+  const data = encoder.encode(`${name}:${size}:${lastModified}`);
+  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
+  return Array.from(new Uint8Array(hashBuffer))
+    .map((b) => b.toString(16).padStart(2, "0"))
+    .join("");
+}
+
+function useRoomCode() {
+  const params = useParams<{ code: string }>();
+  return params.code ?? "";
+}
+
+function createWebChunkProvider(fileId: string, handle: FileSystemFileHandle, chunkSize: number) {
+  const worker = new FileReaderWorker();
+  worker.postMessage({ type: "init", fileId, handle, chunkSize });
+  const pending = new Map<number, { resolve: (buffer: ArrayBuffer) => void; reject: (err: Error) => void }>();
+
+  worker.addEventListener("message", (event: MessageEvent) => {
+    const data = event.data;
+    if (!data) return;
+    if (data.type === "chunk" && data.fileId === fileId) {
+      const resolver = pending.get(data.index);
+      if (resolver) {
+        pending.delete(data.index);
+        resolver.resolve(data.buffer as ArrayBuffer);
+      }
+    }
+    if (data.type === "error" && data.fileId === fileId) {
+      const err = new Error(data.error ?? "unknown error");
+      pending.forEach((entry) => entry.reject(err));
+      pending.clear();
+    }
+  });
+
+  const provider: ChunkProvider & { dispose: () => void } = {
+    async getChunk(index: number) {
+      return new Promise<ArrayBuffer>((resolve, reject) => {
+        pending.set(index, { resolve, reject });
+        worker.postMessage({ type: "chunk", fileId, index });
+      });
+    },
+    dispose() {
+      worker.postMessage({ type: "release", fileId });
+      worker.terminate();
+      pending.clear();
+    },
+  };
+
+  return provider;
+}
+
+function createTauriChunkProvider(path: string, chunkSize: number) {
+  const provider: ChunkProvider = {
+    async getChunk(index: number) {
+      const start = index * chunkSize;
+      return readFileRange(path, start, chunkSize);
+    },
+  };
+  return provider;
+}
+
+export function RoomPage() {
+  const code = useRoomCode();
+  const navigate = useNavigate();
+  const [displayName] = useState(() => generateDisplayName());
+  const selectedFile = useTransfersStore((state) => state.selectedFile);
+  const { setHeaderInfo } = useOutletContext<AppOutletContext>();
+  const signalingRef = useRef<SignalingClient | null>(null);
+  const peerManagerRef = useRef<PeerManager | null>(null);
+  const controllersRef = useRef(new Map<string, PeerControllers>());
+  const pendingSendRef = useRef(new Map<string, { manifest: TransferManifest; provider: ChunkProvider & { dispose?: () => void } }>());
+  const handlesRef = useRef(new Map<string, FileSystemFileHandle>());
+  const downloadWritersRef = useRef(new Map<string, DownloadWriter>());
+
+  useEffect(() => {
+    if (!code) {
+      navigate("/");
+      return;
+    }
+    const signaling = new SignalingClient({ room: code, displayName });
+    signalingRef.current = signaling;
+    const peerManager = new PeerManager(signaling);
+    peerManagerRef.current = peerManager;
+    usePeersStore.getState().reset();
+
+    const unsubscribers: Array<() => void> = [];
+
+    unsubscribers.push(
+      signaling.on("peers", (peers) => {
+        const items = peers.map((peer) => ({
+          peerId: peer.peerId,
+          displayName: peer.displayName,
+          status: "idle" as const,
+          lastUpdated: Date.now(),
+        }));
+        usePeersStore.getState().setPeers(items);
+      }),
+    );
+
+    unsubscribers.push(
+      signaling.on("peer-joined", (peer) => {
+        usePeersStore.getState().upsertPeer({
+          peerId: peer.peerId,
+          displayName: peer.displayName,
+          status: "idle",
+          lastUpdated: Date.now(),
+        });
+      }),
+    );
+
+    unsubscribers.push(
+      signaling.on("peer-left", ({ peerId }) => {
+        usePeersStore.getState().removePeer(peerId);
+        const controller = controllersRef.current.get(peerId);
+        if (controller) {
+          controller.provider?.dispose?.();
+          controllersRef.current.delete(peerId);
+        }
+      }),
+    );
+
+    unsubscribers.push(
+      peerManager.on("connection-state", ({ peerId, state }) => {
+        const statusMap: Record<string, PeerConnectionStatus> = {
+          new: "connecting",
+          connecting: "connecting",
+          connected: "connected",
+          disconnected: "disconnected",
+          failed: "failed",
+          closed: "disconnected",
+        };
+        usePeersStore.getState().updatePeerState(peerId, { status: statusMap[state] ?? "idle" });
+      }),
+    );
+
+    unsubscribers.push(
+      peerManager.on("data-channel", ({ peerId, channel }) => {
+        setupPeerChannel(peerId, channel);
+      }),
+    );
+
+    signaling.connect();
+
+    return () => {
+      unsubscribers.forEach((fn) => fn());
+      signaling.disconnect();
+      controllersRef.current.forEach((controller) => controller.provider?.dispose?.());
+      controllersRef.current.clear();
+      pendingSendRef.current.clear();
+      handlesRef.current.clear();
+      downloadWritersRef.current.forEach((writer) => {
+        if (writer.type === "web") {
+          void writer.writer.close();
+        }
+      });
+      downloadWritersRef.current.clear();
+    };
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [code, displayName]);
+
+  useEffect(() => {
+    const selected = selectedFile;
+    if (!selected) return;
+    if (selected.source === "web" && !handlesRef.current.has(selected.fileId)) {
+      getFileHandle(selected.fileId).then((handle) => {
+        if (handle) {
+          handlesRef.current.set(selected.fileId, handle);
+        }
+      });
+    }
+  }, [selectedFile]);
+
+  function setupPeerChannel(peerId: string, channel: RTCDataChannel) {
+    const sender = new FileSender(channel);
+    const receiver = new FileReceiver(channel);
+    const entry: PeerControllers = { channel, sender, receiver };
+    controllersRef.current.set(peerId, entry);
+
+    sender.on("progress", ({ fileId, bytesSent, totalBytes }) => {
+      useTransfersStore.getState().updateTransfer(fileId, {
+        bytesTransferred: bytesSent,
+        totalBytes,
+        status: "transferring",
+      });
+    });
+
+    sender.on("completed", ({ fileId }) => {
+      useTransfersStore.getState().updateTransfer(fileId, {
+        status: "completed",
+        bytesTransferred: useTransfersStore.getState().transfers[fileId]?.totalBytes ?? 0,
+      });
+      pendingSendRef.current.delete(peerId);
+      entry.provider?.dispose?.();
+    });
+
+    sender.on("cancelled", ({ fileId }) => {
+      useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
+      entry.provider?.dispose?.();
+    });
+
+    receiver.on("manifest", async ({ manifest }) => {
+      const checkpoint = await getCheckpoint(manifest.fileId).catch(() => undefined);
+      const existing = useTransfersStore.getState().transfers[manifest.fileId];
+      let targetHandleKey = existing?.targetHandleKey;
+      let startBytes = checkpoint?.receivedBytes ?? 0;
+
+      if (isTauri()) {
+        if (!targetHandleKey) {
+          const { save } = await import("@tauri-apps/api/dialog");
+          const target = await save({ defaultPath: manifest.name });
+          if (!target) {
+            receiver.cancel("receiver-declined");
+            useTransfersStore.getState().updateTransfer(manifest.fileId, { status: "cancelled" });
+            return;
+          }
+          targetHandleKey = target;
+        }
+        downloadWritersRef.current.set(manifest.fileId, { type: "tauri", path: targetHandleKey });
+      } else {
+        if (!("showSaveFilePicker" in window)) {
+          alert("Seu navegador não suporta salvar arquivos");
+          receiver.cancel("unsupported");
+          return;
+        }
+        const key = targetHandleKey ?? `${manifest.fileId}:recv`;
+        let handle = await getFileHandle(key);
+        if (!handle) {
+          handle = await (window as any).showSaveFilePicker({ suggestedName: manifest.name });
+          if (!handle) {
+            receiver.cancel("no-handle");
+            return;
+          }
+          await saveFileHandle(key, handle);
+        }
+        const writer = await handle.createWritable({ keepExistingData: true });
+        if (startBytes > 0) {
+          await writer.truncate(startBytes);
+          await writer.seek(startBytes);
+        }
+        downloadWritersRef.current.set(manifest.fileId, { type: "web", writer, handle });
+        targetHandleKey = key;
+      }
+
+      useTransfersStore.getState().upsertTransfer({
+        fileId: manifest.fileId,
+        peerId,
+        direction: "receive",
+        bytesTransferred: startBytes,
+        totalBytes: manifest.size,
+        status: "transferring",
+        startedAt: Date.now(),
+        updatedAt: Date.now(),
+        targetHandleKey,
+        fileName: manifest.name,
+      });
+
+      if (checkpoint && checkpoint.nextChunkIndex > 0) {
+        receiver.requestResume(checkpoint.nextChunkIndex);
+      }
+    });
+
+    receiver.on("chunk-received", async ({ fileId, chunkIndex, chunk }) => {
+      const writer = downloadWritersRef.current.get(fileId);
+      if (writer?.type === "web") {
+        await writer.writer.write(chunk);
+      } else if (writer?.type === "tauri") {
+        await writeFileRange(writer.path, chunkIndex * CHUNK_SIZE, new Uint8Array(chunk));
+      }
+
+      const transfer = useTransfersStore.getState().transfers[fileId];
+      const nextBytes = transfer ? Math.min(transfer.totalBytes, (chunkIndex + 1) * CHUNK_SIZE) : (chunkIndex + 1) * CHUNK_SIZE;
+      useTransfersStore.getState().updateTransfer(fileId, {
+        bytesTransferred: nextBytes,
+      });
+      await saveCheckpoint({
+        fileId,
+        nextChunkIndex: chunkIndex + 1,
+        receivedBytes: nextBytes,
+        updatedAt: Date.now(),
+      });
+    });
+
+    receiver.on("completed", async ({ fileId }) => {
+      await finalizeDownload(fileId);
+      useTransfersStore.getState().updateTransfer(fileId, { status: "completed" });
+      await clearCheckpoint(fileId).catch(() => undefined);
+    });
+
+    receiver.on("cancelled", ({ fileId }) => {
+      finalizeDownload(fileId);
+      useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
+      clearCheckpoint(fileId).catch(() => undefined);
+    });
+
+    const pending = pendingSendRef.current.get(peerId);
+    if (pending) {
+      pendingSendRef.current.delete(peerId);
+      sender.start(pending.manifest, pending.provider);
+      entry.provider = pending.provider;
+    }
+  }
+
+  async function ensureHandle() {
+    const selected = useTransfersStore.getState().selectedFile;
+    if (selected?.source !== "web") return;
+    const fileId = selected.fileId;
+    if (handlesRef.current.has(fileId)) return;
+    const handle = await getFileHandle(fileId);
+    if (handle) {
+      handlesRef.current.set(fileId, handle);
+    }
+  }
+
+  async function handlePickFile() {
+    if (isTauri()) {
+      const { open } = await import("@tauri-apps/api/dialog");
+      const selection = await open({ multiple: false });
+      if (!selection || Array.isArray(selection)) return;
+      const path = selection;
+      const name = path.split(/[\\/]/).pop() ?? "arquivo";
+      const info = await getFileInfo(path);
+      const fileId = await computeFileId(name, info.size, info.createdAt ?? Date.now());
+    useTransfersStore.getState().setSelectedFile({
+      fileId,
+      name,
+      size: info.size,
+      source: "tauri",
+      handleKey: path,
+    });
+    useTransfersStore.getState().upsertTransfer({
+      fileId,
+      peerId: "",
+      direction: "send",
+      bytesTransferred: 0,
+      totalBytes: info.size,
+      status: "idle",
+      startedAt: Date.now(),
+      updatedAt: Date.now(),
+      fileName: name,
+    });
+      return;
+    }
+
+    if (!("showOpenFilePicker" in window)) {
+      alert("Seu navegador não suporta File System Access API");
+      return;
+    }
+
+    const [handle] = await (window as any).showOpenFilePicker({ multiple: false });
+    if (!handle) return;
+    const file = await handle.getFile();
+    const fileId = await computeFileId(file.name, file.size, file.lastModified);
+    handlesRef.current.set(fileId, handle);
+    await saveFileHandle(fileId, handle);
+    useTransfersStore.getState().setSelectedFile({
+      fileId,
+      name: file.name,
+      size: file.size,
+      mime: file.type,
+      lastModified: file.lastModified,
+      source: "web",
+      handleKey: fileId,
+    });
+    useTransfersStore.getState().upsertTransfer({
+      fileId,
+      peerId: "",
+      direction: "send",
+      bytesTransferred: 0,
+      totalBytes: file.size,
+      status: "idle",
+      startedAt: Date.now(),
+      updatedAt: Date.now(),
+      fileName: file.name,
+    });
+  }
+
+  async function handleConnect(peerId: string) {
+    const peerManager = peerManagerRef.current;
+    if (!peerManager) return;
+    usePeersStore.getState().updatePeerState(peerId, { status: "connecting" });
+    await peerManager.connectTo(peerId);
+  }
+
+  function handleDisconnect(peerId: string) {
+    peerManagerRef.current?.disconnect(peerId);
+    usePeersStore.getState().updatePeerState(peerId, { status: "disconnected" });
+    const controller = controllersRef.current.get(peerId);
+    if (controller) {
+      controller.provider?.dispose?.();
+      controllersRef.current.delete(peerId);
+    }
+  }
+
+  async function finalizeDownload(fileId: string) {
+    const writer = downloadWritersRef.current.get(fileId);
+    if (writer?.type === "web") {
+      await writer.writer.close();
+    }
+    downloadWritersRef.current.delete(fileId);
+  }
+
+  async function startSendToPeer(peerId: string) {
+    const selected = useTransfersStore.getState().selectedFile;
+    if (!selected) {
+      alert("Selecione um arquivo primeiro");
+      return;
+    }
+    await ensureHandle();
+
+    let provider: ChunkProvider & { dispose?: () => void };
+    let manifest: TransferManifest;
+
+    if (selected.source === "web") {
+      const handle = handlesRef.current.get(selected.fileId);
+      if (!handle) {
+        alert("Não foi possível acessar o arquivo selecionado");
+        return;
+      }
+      const file = await handle.getFile();
+      manifest = {
+        type: "MANIFEST",
+        fileId: selected.fileId,
+        name: file.name,
+        size: file.size,
+        mime: file.type,
+        chunkSize: CHUNK_SIZE,
+        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
+      };
+      provider = createWebChunkProvider(selected.fileId, handle, CHUNK_SIZE);
+    } else {
+      const path = selected.handleKey;
+      const name = selected.name;
+      manifest = {
+        type: "MANIFEST",
+        fileId: selected.fileId,
+        name,
+        size: selected.size,
+        chunkSize: CHUNK_SIZE,
+        totalChunks: Math.ceil(selected.size / CHUNK_SIZE),
+      };
+      provider = createTauriChunkProvider(path, CHUNK_SIZE);
+    }
+
+    const transferState = useTransfersStore.getState().transfers[selected.fileId];
+    if (transferState) {
+      useTransfersStore.getState().updateTransfer(selected.fileId, {
+        status: "transferring",
+        peerId,
+        startedAt: transferState.startedAt || Date.now(),
+      });
+    } else {
+      useTransfersStore.getState().upsertTransfer({
+        fileId: selected.fileId,
+        peerId,
+        direction: "send",
+        bytesTransferred: 0,
+        totalBytes: manifest.size,
+        status: "transferring",
+        startedAt: Date.now(),
+        updatedAt: Date.now(),
+      });
+    }
+
+    const controller = controllersRef.current.get(peerId);
+    if (controller) {
+      controller.provider?.dispose?.();
+      controller.provider = provider;
+      controller.sender.start(manifest, provider);
+    } else {
+      pendingSendRef.current.set(peerId, { manifest, provider });
+      peerManagerRef.current?.connectTo(peerId);
+    }
+  }
+
+  function handlePeerCancel(peerId: string) {
+    const controller = controllersRef.current.get(peerId);
+    if (controller) {
+      controller.sender.cancel("cancelled-by-user");
+      controller.provider?.dispose?.();
+      controllersRef.current.delete(peerId);
+    }
+  }
+
+  function handleCancelFile(fileId: string) {
+    const transfer = useTransfersStore.getState().transfers[fileId];
+    if (!transfer) return;
+    if (transfer.peerId) {
+      handlePeerCancel(transfer.peerId);
+    }
+    useTransfersStore.getState().updateTransfer(fileId, { status: "cancelled" });
+    clearCheckpoint(fileId).catch(() => undefined);
+  }
+
+  function handleResume(fileId: string) {
+    const transfer = useTransfersStore.getState().transfers[fileId];
+    if (!transfer || !transfer.peerId) return;
+    startSendToPeer(transfer.peerId);
+  }
+
+  const inviteUrl = useMemo(() => {
+    if (typeof window === "undefined") return "";
+    return `${window.location.origin}/room/${code}`;
+  }, [code]);
+
+  const copyInvite = useCallback(() => {
+    if (typeof navigator !== "undefined" && navigator.clipboard) {
+      navigator.clipboard.writeText(inviteUrl).catch(() => undefined);
+    }
+  }, [inviteUrl]);
+
+  useEffect(() => {
+    setHeaderInfo({
+      roomCode: code,
+      inviteUrl,
+      onCopyInvite: copyInvite,
+    });
+    return () => setHeaderInfo({});
+  }, [code, inviteUrl, copyInvite, setHeaderInfo]);
+
+  return (
+    <div className="space-y-8">
+      <Card className="space-y-4 p-6">
+        <div className="flex flex-wrap items-start justify-between gap-4">
+          <div className="space-y-2">
+            <h1 className="text-2xl font-bold text-[var(--text)]">Sala {code}</h1>
+            <p className="text-sm text-[var(--text-muted)]">
+              Compartilhe o link abaixo para convidar novos peers.
+            </p>
+          </div>
+          <Button
+            type="button"
+            variant="outline"
+            onClick={copyInvite}
+            title="Copiar link de convite para a área de transferência"
+          >
+            Copiar convite
+          </Button>
+        </div>
+        <button
+          type="button"
+          onClick={copyInvite}
+          title="Copiar link de convite para a área de transferência"
+          className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-left font-mono text-sm text-[var(--text)] transition hover:border-[var(--accent)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
+        >
+          {inviteUrl}
+        </button>
+      </Card>
+      <div className="grid gap-6 lg:grid-cols-2">
+        <TransferBox onPickFile={handlePickFile} onResume={handleResume} onCancelFile={handleCancelFile} />
+        <PeersPanel
+          selfPeerId={signalingRef.current?.peerId ?? ""}
+          onConnect={handleConnect}
+          onDisconnect={handleDisconnect}
+          onSend={startSendToPeer}
+          onCancel={handlePeerCancel}
+        />
+      </div>
+    </div>
+  );
+}
+
+export default RoomPage;
diff --git a/apps/client/src/store/usePeers.ts b/apps/client/src/store/usePeers.ts
new file mode 100644
index 0000000000000000000000000000000000000000..072723490eac55551184f759d762a1883f01e394
--- /dev/null
+++ b/apps/client/src/store/usePeers.ts
@@ -0,0 +1,61 @@
+import { create } from "zustand";
+
+export type PeerConnectionStatus =
+  | "idle"
+  | "connecting"
+  | "connected"
+  | "disconnected"
+  | "failed";
+
+export interface PeerInfo {
+  peerId: string;
+  displayName: string;
+  status: PeerConnectionStatus;
+  iceState?: RTCIceConnectionState;
+  lastUpdated: number;
+}
+
+interface PeersState {
+  peers: Record<string, PeerInfo>;
+  setPeers: (peers: PeerInfo[]) => void;
+  upsertPeer: (peer: PeerInfo) => void;
+  updatePeerState: (peerId: string, patch: Partial<PeerInfo>) => void;
+  removePeer: (peerId: string) => void;
+  reset: () => void;
+}
+
+export const usePeersStore = create<PeersState>((set) => ({
+  peers: {},
+  setPeers: (peers) =>
+    set(() => ({
+      peers: Object.fromEntries(peers.map((peer) => [peer.peerId, peer])),
+    })),
+  upsertPeer: (peer) =>
+    set((state) => ({
+      peers: {
+        ...state.peers,
+        [peer.peerId]: peer,
+      },
+    })),
+  updatePeerState: (peerId, patch) =>
+    set((state) => {
+      const existing = state.peers[peerId];
+      if (!existing) return state;
+      return {
+        peers: {
+          ...state.peers,
+          [peerId]: {
+            ...existing,
+            ...patch,
+            lastUpdated: Date.now(),
+          },
+        },
+      };
+    }),
+  removePeer: (peerId) =>
+    set((state) => {
+      const { [peerId]: _removed, ...rest } = state.peers;
+      return { peers: rest };
+    }),
+  reset: () => set({ peers: {} }),
+}));
diff --git a/apps/client/src/store/useTransfers.ts b/apps/client/src/store/useTransfers.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2ea24ea1fb6ee12ec8afc3178bdf09f1e38d6250
--- /dev/null
+++ b/apps/client/src/store/useTransfers.ts
@@ -0,0 +1,132 @@
+import { create } from "zustand";
+import { persist, createJSONStorage } from "zustand/middleware";
+
+export type TransferDirection = "send" | "receive";
+
+export interface SelectedFileMeta {
+  fileId: string;
+  name: string;
+  size: number;
+  mime?: string;
+  lastModified?: number;
+  source: "web" | "tauri";
+  handleKey: string;
+}
+
+export interface TransferState {
+  fileId: string;
+  peerId: string;
+  direction: TransferDirection;
+  bytesTransferred: number;
+  totalBytes: number;
+  status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
+  startedAt: number;
+  updatedAt: number;
+  error?: string;
+  targetHandleKey?: string;
+  fileName?: string;
+}
+
+interface TransfersStore {
+  selectedFile: SelectedFileMeta | null;
+  transfers: Record<string, TransferState>;
+  setSelectedFile(meta: SelectedFileMeta | null): void;
+  upsertTransfer(transfer: TransferState): void;
+  updateTransfer(fileId: string, patch: Partial<TransferState>): void;
+  removeTransfer(fileId: string): void;
+  reset(): void;
+}
+
+function broadcastState(state: Pick<TransfersStore, "selectedFile" | "transfers">) {
+  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
+  const channel = new BroadcastChannel("fluxshare");
+  channel.postMessage({ type: "transfers-update", state });
+  channel.close();
+}
+
+type PersistedTransfersState = Pick<TransfersStore, "selectedFile" | "transfers">;
+
+const storage = createJSONStorage<PersistedTransfersState>(() => {
+  if (typeof window === "undefined" || !window.localStorage) {
+    const noopStorage: Storage = {
+      length: 0,
+      clear: () => undefined,
+      getItem: () => null,
+      key: () => null,
+      removeItem: () => undefined,
+      setItem: () => undefined,
+    };
+    return noopStorage;
+  }
+  return window.localStorage;
+});
+
+export const useTransfersStore = create<TransfersStore>()(
+  persist(
+    (set, get) => ({
+      selectedFile: null,
+      transfers: {},
+      setSelectedFile: (meta) => {
+        set({ selectedFile: meta });
+        broadcastState({ selectedFile: meta, transfers: get().transfers });
+      },
+      upsertTransfer: (transfer) => {
+        set((state) => ({
+          transfers: { ...state.transfers, [transfer.fileId]: transfer },
+        }));
+        broadcastState({ selectedFile: get().selectedFile, transfers: get().transfers });
+      },
+      updateTransfer: (fileId, patch) => {
+        set((state) => {
+          const existing = state.transfers[fileId];
+          if (!existing) return state;
+          const next = {
+            ...existing,
+            ...patch,
+            updatedAt: Date.now(),
+          };
+          return {
+            transfers: { ...state.transfers, [fileId]: next },
+          };
+        });
+        broadcastState({ selectedFile: get().selectedFile, transfers: get().transfers });
+      },
+      removeTransfer: (fileId) => {
+        set((state) => {
+          const { [fileId]: _removed, ...rest } = state.transfers;
+          return { transfers: rest };
+        });
+        broadcastState({ selectedFile: get().selectedFile, transfers: get().transfers });
+      },
+      reset: () => {
+        set({ selectedFile: null, transfers: {} });
+        broadcastState({ selectedFile: null, transfers: {} });
+      },
+    }),
+    {
+      name: "fluxshare-transfers",
+      storage,
+      partialize: (state) => ({
+        selectedFile: state.selectedFile,
+        transfers: state.transfers,
+      }),
+      onRehydrateStorage: () => (state) => {
+        if (!state) return;
+        broadcastState({ selectedFile: state.selectedFile, transfers: state.transfers });
+      },
+    },
+  ),
+);
+
+if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
+  const channel = new BroadcastChannel("fluxshare");
+  channel.addEventListener("message", (event) => {
+    if (!event.data || event.data.type !== "transfers-update") return;
+    const { selectedFile, transfers } = event.data.state as Pick<TransfersStore, "selectedFile" | "transfers">;
+    const store = useTransfersStore.getState();
+    useTransfersStore.setState({
+      selectedFile,
+      transfers,
+    });
+  });
+}
diff --git a/apps/client/src/styles.css b/apps/client/src/styles.css
deleted file mode 100644
index 9495caa9f1fb00a11de17ed4b76ab44b464bfbe5..0000000000000000000000000000000000000000
--- a/apps/client/src/styles.css
+++ /dev/null
@@ -1,19 +0,0 @@
-@tailwind base;
-@tailwind components;
-@tailwind utilities;
-
-:root {
-  color-scheme: dark;
-  background-color: #0f1016;
-  color: #f0f3ff;
-}
-
-body {
-  margin: 0;
-  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
-  background-color: #0f1016;
-}
-
-button {
-  @apply bg-accent text-white px-4 py-2 rounded-md transition hover:bg-accent-soft;
-}
diff --git a/apps/client/src/styles/base.css b/apps/client/src/styles/base.css
new file mode 100644
index 0000000000000000000000000000000000000000..b5c61c956711f981a41e95f7fcf0038436cfbb22
--- /dev/null
+++ b/apps/client/src/styles/base.css
@@ -0,0 +1,3 @@
+@tailwind base;
+@tailwind components;
+@tailwind utilities;
diff --git a/apps/client/src/styles/theme.css b/apps/client/src/styles/theme.css
new file mode 100644
index 0000000000000000000000000000000000000000..1529ac225b58fb60e387042db0c80c9c9fd1a55e
--- /dev/null
+++ b/apps/client/src/styles/theme.css
@@ -0,0 +1,111 @@
+:root {
+  color-scheme: dark;
+  --bg: #0b0d12;
+  --bg-grad-1: #0b0d12;
+  --bg-grad-2: #111428;
+  --card: rgba(255, 255, 255, 0.06);
+  --card-border: rgba(255, 255, 255, 0.18);
+  --text: #e7e9ee;
+  --text-muted: #b6bcc8;
+  --accent: #7c3aed;
+  --accent-2: #3b82f6;
+  --ring: rgba(124, 58, 237, 0.5);
+}
+
+[data-theme="light"] {
+  color-scheme: light;
+  --bg: #f6f7fb;
+  --bg-grad-1: #f6f7fb;
+  --bg-grad-2: #eaeef7;
+  --card: rgba(255, 255, 255, 0.7);
+  --card-border: rgba(17, 17, 17, 0.08);
+  --text: #1c1f25;
+  --text-muted: #5b6473;
+  --accent: #6d28d9;
+  --accent-2: #2563eb;
+  --ring: rgba(37, 99, 235, 0.35);
+}
+
+html {
+  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
+  background-color: var(--bg);
+  color: var(--text);
+}
+
+body {
+  margin: 0;
+  min-height: 100vh;
+  background: radial-gradient(circle at top, var(--bg-grad-1), var(--bg-grad-2));
+  color: var(--text);
+  transition: background-color 200ms ease, color 200ms ease;
+}
+
+* {
+  box-sizing: border-box;
+}
+
+a {
+  color: var(--accent-2);
+  text-decoration: none;
+}
+
+a:hover {
+  text-decoration: underline;
+}
+
+button,
+input,
+textarea {
+  font-family: inherit;
+}
+
+::selection {
+  background: rgba(124, 58, 237, 0.35);
+  color: inherit;
+}
+
+.app-shell {
+  position: relative;
+  min-height: 100vh;
+  background: radial-gradient(circle at top, var(--bg-grad-1), var(--bg-grad-2));
+  color: var(--text);
+  isolation: isolate;
+}
+
+.app-shell__background {
+  position: fixed;
+  inset: 0;
+  z-index: -1;
+  pointer-events: none;
+}
+
+.app-shell__gradient {
+  position: absolute;
+  inset: -20%;
+  background: radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.25), transparent 55%),
+    radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.22), transparent 60%),
+    radial-gradient(circle at 50% 80%, rgba(124, 58, 237, 0.18), transparent 65%);
+  filter: blur(90px);
+  opacity: 0.9;
+}
+
+.app-shell__mesh {
+  position: absolute;
+  inset: 0;
+  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 45%, rgba(255, 255, 255, 0.04) 100%);
+  mix-blend-mode: screen;
+  opacity: 0.35;
+}
+
+.app-shell__grid {
+  position: absolute;
+  inset: 0;
+  background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
+    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
+  background-size: 52px 52px;
+  opacity: 0.16;
+}
+
+.card-shadow {
+  box-shadow: 0 25px 45px -25px rgba(15, 23, 42, 0.55);
+}
diff --git a/apps/client/src/types/protocol.ts b/apps/client/src/types/protocol.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e2fe8fd3a0b8835df13155faa164713d81cf977a
--- /dev/null
+++ b/apps/client/src/types/protocol.ts
@@ -0,0 +1,76 @@
+import { z } from "zod";
+
+export const signalingPeerSchema = z.object({
+  peerId: z.string(),
+  displayName: z.string(),
+});
+
+export const signalingPeersMessageSchema = z.object({
+  type: z.literal("peers"),
+  room: z.string(),
+  peers: z.array(signalingPeerSchema),
+});
+
+export const signalingSignalMessageSchema = z.object({
+  type: z.literal("signal"),
+  from: z.string(),
+  to: z.string(),
+  data: z.unknown(),
+});
+
+export const signalingPeerJoinedSchema = z.object({
+  type: z.literal("peer-joined"),
+  peer: signalingPeerSchema,
+});
+
+export const signalingPeerLeftSchema = z.object({
+  type: z.literal("peer-left"),
+  peerId: z.string(),
+});
+
+export const signalingServerMessageSchema = z.discriminatedUnion("type", [
+  signalingPeersMessageSchema,
+  signalingSignalMessageSchema,
+  signalingPeerJoinedSchema,
+  signalingPeerLeftSchema,
+]);
+
+export type SignalingServerMessage = z.infer<typeof signalingServerMessageSchema>;
+export type SignalingPeer = z.infer<typeof signalingPeerSchema>;
+
+export const signalingJoinMessageSchema = z.object({
+  type: z.literal("join"),
+  room: z.string(),
+  peerId: z.string(),
+  displayName: z.string(),
+});
+
+export const signalingSignalPayloadSchema = z.object({
+  type: z.literal("signal"),
+  room: z.string(),
+  from: z.string(),
+  to: z.string(),
+  data: z.unknown(),
+});
+
+export const signalingLeaveMessageSchema = z.object({
+  type: z.literal("leave"),
+  room: z.string(),
+  peerId: z.string(),
+});
+
+export const signalingHeartbeatSchema = z.object({
+  type: z.literal("heartbeat"),
+  peerId: z.string(),
+});
+
+export type SignalingJoinMessage = z.infer<typeof signalingJoinMessageSchema>;
+export type SignalingSignalPayload = z.infer<typeof signalingSignalPayloadSchema>;
+export type SignalingLeaveMessage = z.infer<typeof signalingLeaveMessageSchema>;
+export type SignalingHeartbeat = z.infer<typeof signalingHeartbeatSchema>;
+
+export type SignalingClientMessage =
+  | SignalingJoinMessage
+  | SignalingSignalPayload
+  | SignalingLeaveMessage
+  | SignalingHeartbeat;
diff --git a/apps/client/src/utils/cn.ts b/apps/client/src/utils/cn.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bcb94123d7e0e05608f3514bac8e17f0998a6c1e
--- /dev/null
+++ b/apps/client/src/utils/cn.ts
@@ -0,0 +1,6 @@
+import classNames from "classnames";
+import { twMerge } from "tailwind-merge";
+
+export function cn(...inputs: classNames.ArgumentArray) {
+  return twMerge(classNames(inputs));
+}
diff --git a/apps/client/src/utils/env.ts b/apps/client/src/utils/env.ts
new file mode 100644
index 0000000000000000000000000000000000000000..880a402d0fc266607fc1c003d56da11530c1abc4
--- /dev/null
+++ b/apps/client/src/utils/env.ts
@@ -0,0 +1,26 @@
+const DEFAULT_SIGNALING = "ws://localhost:5174/ws";
+const DEFAULT_STUN = "stun:stun.l.google.com:19302";
+
+type EnvConfig = {
+  signalingUrl: string;
+  iceServers: RTCIceServer[];
+};
+
+export function getEnv(): EnvConfig {
+  const env = import.meta.env ?? {};
+  const signalingUrl = (env.VITE_SIGNALING_URL as string | undefined) ?? DEFAULT_SIGNALING;
+  const stun = (env.VITE_STUN_URL as string | undefined) ?? DEFAULT_STUN;
+  const turnUrl = env.VITE_TURN_URL as string | undefined;
+  const turnUser = env.VITE_TURN_USER as string | undefined;
+  const turnPass = env.VITE_TURN_PASS as string | undefined;
+
+  const iceServers: RTCIceServer[] = [{ urls: stun }];
+  if (turnUrl && turnUser && turnPass) {
+    iceServers.push({ urls: turnUrl, username: turnUser, credential: turnPass });
+  }
+
+  return {
+    signalingUrl,
+    iceServers,
+  };
+}
diff --git a/apps/client/src/vite-env.d.ts b/apps/client/src/vite-env.d.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0552206572a60767e845315d6cbec663b769c61d
--- /dev/null
+++ b/apps/client/src/vite-env.d.ts
@@ -0,0 +1,13 @@
+/// <reference types="vite/client" />
+
+declare interface ImportMetaEnv {
+  readonly VITE_SIGNALING_URL?: string;
+  readonly VITE_STUN_URL?: string;
+  readonly VITE_TURN_URL?: string;
+  readonly VITE_TURN_USER?: string;
+  readonly VITE_TURN_PASS?: string;
+}
+
+interface ImportMeta {
+  readonly env: ImportMetaEnv;
+}
diff --git a/apps/client/src/workers/fileReader.worker.ts b/apps/client/src/workers/fileReader.worker.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c809e37e13feb5eef75270a37b05b4663ff28a68
--- /dev/null
+++ b/apps/client/src/workers/fileReader.worker.ts
@@ -0,0 +1,79 @@
+interface InitMessage {
+  type: "init";
+  fileId: string;
+  handle: FileSystemFileHandle;
+  chunkSize: number;
+}
+
+interface ChunkRequest {
+  type: "chunk";
+  fileId: string;
+  index: number;
+}
+
+interface ReleaseMessage {
+  type: "release";
+  fileId: string;
+}
+
+type WorkerRequest = InitMessage | ChunkRequest | ReleaseMessage;
+
+type FileContext = {
+  handle: FileSystemFileHandle;
+  chunkSize: number;
+  size: number;
+  totalChunks: number;
+};
+
+type FileReaderWorkerScope = typeof globalThis & {
+  onmessage: (event: MessageEvent<WorkerRequest>) => void;
+  postMessage: (message: unknown, transfer?: Transferable[]) => void;
+};
+
+declare const self: FileReaderWorkerScope;
+
+const files = new Map<string, FileContext>();
+
+self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
+  const message = event.data;
+  switch (message.type) {
+    case "init": {
+      const file = await message.handle.getFile();
+      files.set(message.fileId, {
+        handle: message.handle,
+        chunkSize: message.chunkSize,
+        size: file.size,
+        totalChunks: Math.ceil(file.size / message.chunkSize),
+      });
+      self.postMessage({
+        type: "ready",
+        fileId: message.fileId,
+        size: file.size,
+        totalChunks: Math.ceil(file.size / message.chunkSize),
+      });
+      break;
+    }
+    case "chunk": {
+      const ctx = files.get(message.fileId);
+      if (!ctx) {
+        self.postMessage({ type: "error", fileId: message.fileId, error: "file not initialized" });
+        return;
+      }
+      const file = await ctx.handle.getFile();
+      const start = message.index * ctx.chunkSize;
+      const end = Math.min(start + ctx.chunkSize, ctx.size);
+      const blob = file.slice(start, end);
+      const buffer = await blob.arrayBuffer();
+      self.postMessage({ type: "chunk", fileId: message.fileId, index: message.index, buffer }, [buffer]);
+      break;
+    }
+    case "release": {
+      files.delete(message.fileId);
+      break;
+    }
+    default:
+      break;
+  }
+};
+
+export default {} as typeof Worker & { new (): Worker };
diff --git a/apps/client/tailwind.config.ts b/apps/client/tailwind.config.ts
index 2393c45dab1be6218eb7bfd55846bca91046bfcd..03fa71375db1d5d28a0fff55498927919efd3f69 100644
--- a/apps/client/tailwind.config.ts
+++ b/apps/client/tailwind.config.ts
@@ -1,21 +1,21 @@
 import type { Config } from "tailwindcss";
 
 const config: Config = {
   content: ["./index.html", "./src/**/*.{ts,tsx}"],
-  darkMode: "class",
+  darkMode: ["class", "[data-theme='dark']"],
   theme: {
     extend: {
       colors: {
         bg: "#0f1016",
         surface: "#151826",
         accent: {
           DEFAULT: "#6c5ce7",
           soft: "#4a47a3",
         },
       },
     },
   },
   plugins: [],
 };
 
 export default config;
diff --git a/apps/client/tsconfig.json b/apps/client/tsconfig.json
index 6bfd4ebdf8a7a8cbf52529c94cb4347771227bac..c59f4d514cde8b4e1522272686d10a3b983bb03c 100644
--- a/apps/client/tsconfig.json
+++ b/apps/client/tsconfig.json
@@ -1,16 +1,20 @@
 {
   "compilerOptions": {
     "target": "ES2020",
     "useDefineForClassFields": true,
     "module": "ESNext",
     "lib": ["DOM", "DOM.Iterable", "ESNext"],
-    "moduleResolution": "Node",
+    "moduleResolution": "Bundler",
     "strict": true,
     "resolveJsonModule": true,
     "esModuleInterop": true,
     "jsx": "react-jsx",
-    "types": ["vite/client"]
+    "skipLibCheck": true,
+    "types": ["vite/client", "node"],
+    "paths": {
+      "@/*": ["./src/*"]
+    }
   },
   "include": ["src"],
   "references": [{ "path": "./tsconfig.node.json" }]
 }
diff --git a/apps/client/vite.config.ts b/apps/client/vite.config.ts
index 3849d370debbfdecb59f44b7d660ee3388773c41..285fe72bf20baecd7e9bec921bc53a81be809acb 100644
--- a/apps/client/vite.config.ts
+++ b/apps/client/vite.config.ts
@@ -1,9 +1,15 @@
+import { fileURLToPath, URL } from "node:url";
 import { defineConfig } from "vite";
 import react from "@vitejs/plugin-react";
 
 export default defineConfig(() => ({
   plugins: [react()],
   server: {
     port: 5173,
   },
+  resolve: {
+    alias: {
+      "@": fileURLToPath(new URL("./src", import.meta.url)),
+    },
+  },
 }));
diff --git a/apps/signaling-server/src/index.test.ts b/apps/signaling-server/src/index.test.ts
index ce08ce076e951f90aa22572844b8829642bebe7a..0465a74ece048278db95d7bae41a13d2e2d52018 100644
--- a/apps/signaling-server/src/index.test.ts
+++ b/apps/signaling-server/src/index.test.ts
@@ -1,19 +1,35 @@
 import { describe, expect, it } from "vitest";
-import { messageSchema } from "./index";
+import { clientMessageSchema, serverMessageSchema } from "./index";
 
-describe("message schema", () => {
-  it("accepts valid offer", () => {
+describe("client message schema", () => {
+  it("accepts join message", () => {
     const msg = {
-      type: "offer",
-      from: "alice",
-      to: "bob",
-      sdp: "v=0...",
-    };
-    expect(() => messageSchema.parse(msg)).not.toThrow();
+      type: "join",
+      room: "AB12CD",
+      peerId: "alice",
+      displayName: "Alice",
+    } as const;
+    expect(() => clientMessageSchema.parse(msg)).not.toThrow();
   });
 
-  it("rejects invalid register", () => {
-    const msg = { type: "register", id: "" };
-    expect(() => messageSchema.parse(msg)).toThrow();
+  it("rejects malformed signal", () => {
+    const msg = { type: "signal", room: "", from: "a", to: "", data: {} };
+    expect(() => clientMessageSchema.parse(msg)).toThrow();
+  });
+});
+
+describe("server message schema", () => {
+  it("accepts peers payload", () => {
+    const msg = {
+      type: "peers",
+      room: "AB12CD",
+      peers: [{ peerId: "p1", displayName: "Alice" }],
+    } as const;
+    expect(() => serverMessageSchema.parse(msg)).not.toThrow();
+  });
+
+  it("rejects peer-left without id", () => {
+    const msg = { type: "peer-left" };
+    expect(() => serverMessageSchema.parse(msg)).toThrow();
   });
 });
diff --git a/apps/signaling-server/src/index.ts b/apps/signaling-server/src/index.ts
index 50acb7c61160ab1694311d752425a96cac679d9e..4784acfc3655fe106d4af3b682c64f39f402a532 100644
--- a/apps/signaling-server/src/index.ts
+++ b/apps/signaling-server/src/index.ts
@@ -1,110 +1,310 @@
 import express from "express";
 import http from "http";
 import { WebSocketServer, WebSocket } from "ws";
 import { z } from "zod";
 
+type RoomCode = string;
+type PeerId = string;
+
+const log = (...args: unknown[]) => console.log("[signaling]", ...args);
+const warn = (...args: unknown[]) => console.warn("[signaling]", ...args);
+
+const HEARTBEAT_INTERVAL = 10_000; // ms
+const HEARTBEAT_TIMEOUT = 30_000; // ms
+
 const app = express();
 app.use(express.json());
 
 app.get("/health", (_req, res) => {
   res.status(200).json({ ok: true });
 });
 
 const server = http.createServer(app);
 
-const messageSchema = z.discriminatedUnion("type", [
-  z.object({ type: z.literal("register"), id: z.string().min(1) }),
+const baseMessageSchema = z.object({
+  room: z.string().min(1),
+});
+
+const clientMessageSchema = z.discriminatedUnion("type", [
+  z
+    .object({
+      type: z.literal("join"),
+      peerId: z.string().min(1),
+      displayName: z.string().min(1),
+    })
+    .merge(baseMessageSchema),
+  z
+    .object({
+      type: z.literal("signal"),
+      from: z.string().min(1),
+      to: z.string().min(1),
+      data: z.unknown(),
+    })
+    .merge(baseMessageSchema),
+  z
+    .object({
+      type: z.literal("leave"),
+      peerId: z.string().min(1),
+    })
+    .merge(baseMessageSchema),
   z.object({
-    type: z.literal("offer"),
-    from: z.string().min(1),
-    to: z.string().min(1),
-    sdp: z.string().min(1),
+    type: z.literal("heartbeat"),
+    peerId: z.string().min(1),
+  }),
+]);
+
+const serverMessageSchema = z.discriminatedUnion("type", [
+  z.object({
+    type: z.literal("peers"),
+    room: z.string().min(1),
+    peers: z.array(
+      z.object({
+        peerId: z.string().min(1),
+        displayName: z.string().min(1),
+      }),
+    ),
   }),
   z.object({
-    type: z.literal("answer"),
+    type: z.literal("signal"),
     from: z.string().min(1),
     to: z.string().min(1),
-    sdp: z.string().min(1),
+    data: z.unknown(),
   }),
   z.object({
-    type: z.literal("ice"),
-    from: z.string().min(1),
-    to: z.string().min(1),
-    candidate: z.any(),
+    type: z.literal("peer-joined"),
+    peer: z.object({
+      peerId: z.string().min(1),
+      displayName: z.string().min(1),
+    }),
   }),
   z.object({
-    type: z.literal("bye"),
-    from: z.string().min(1),
-    to: z.string().min(1),
+    type: z.literal("peer-left"),
+    peerId: z.string().min(1),
   }),
 ]);
 
-type Message = z.infer<typeof messageSchema>;
+type ClientMessage = z.infer<typeof clientMessageSchema>;
+type ServerMessage = z.infer<typeof serverMessageSchema>;
+
+interface RoomPeer {
+  peerId: PeerId;
+  displayName: string;
+  socket: WebSocket;
+  lastSeen: number;
+}
 
-const clients = new Map<string, WebSocket>();
+const rooms = new Map<RoomCode, Map<PeerId, RoomPeer>>();
 
 const wss = new WebSocketServer({ server, path: "/ws" });
 
 wss.on("connection", (socket) => {
-  let clientId: string | null = null;
-  console.log("[ws] new connection");
+  log("new connection");
 
-  socket.on("message", (data) => {
+  socket.on("message", (raw) => {
+    let parsed: ClientMessage;
     try {
-      const parsed = messageSchema.parse(JSON.parse(data.toString()));
-      handleMessage(socket, parsed);
-    } catch (err) {
-      console.warn("[ws] invalid message", err);
-      socket.send(JSON.stringify({ type: "error", message: "invalid payload" }));
+      parsed = clientMessageSchema.parse(JSON.parse(raw.toString()));
+    } catch (error) {
+      warn("invalid message", error);
+      safeSend(socket, { type: "error", message: "invalid payload" });
+      return;
     }
+
+    handleMessage(socket, parsed);
   });
 
   socket.on("close", () => {
-    if (clientId && clients.get(clientId) === socket) {
-      clients.delete(clientId);
-      broadcast({ type: "bye", from: clientId, to: "*" });
+    handleDisconnect(socket);
+  });
+
+  socket.on("error", (error) => {
+    warn("socket error", error);
+  });
+});
+
+function handleMessage(socket: WebSocket, msg: ClientMessage) {
+  switch (msg.type) {
+    case "join":
+      handleJoin(socket, msg);
+      break;
+    case "signal":
+      handleSignal(msg);
+      break;
+    case "leave":
+      handleLeave(msg.room, msg.peerId);
+      break;
+    case "heartbeat":
+      refreshHeartbeat(msg.peerId);
+      break;
+    default:
+      warn("unsupported message", msg);
+  }
+}
+
+function handleJoin(socket: WebSocket, msg: Extract<ClientMessage, { type: "join" }>) {
+  const { room, peerId, displayName } = msg;
+  const peers = ensureRoom(room);
+  const existing = peers.get(peerId);
+  if (existing) {
+    log(`peer ${peerId} rejoining room ${room}`);
+    existing.socket.terminate();
+  }
+
+  const record: RoomPeer = {
+    peerId,
+    displayName,
+    socket,
+    lastSeen: Date.now(),
+  };
+  peers.set(peerId, record);
+
+  socket.once("close", () => {
+    if (peers.get(peerId)?.socket === socket) {
+      handleLeave(room, peerId);
     }
-    console.log("[ws] connection closed", clientId);
   });
 
-  function handleMessage(ws: WebSocket, msg: Message) {
-    switch (msg.type) {
-      case "register": {
-        clientId = msg.id;
-        clients.set(msg.id, ws);
-        ws.send(JSON.stringify({ type: "ack", id: msg.id }));
-        console.log(`[ws] registered ${msg.id}`);
-        break;
-      }
-      case "offer":
-      case "answer":
-      case "ice":
-      case "bye": {
-        forward(msg.to, msg);
-        break;
+  safeSend(socket, {
+    type: "peers",
+    room,
+    peers: Array.from(peers.values())
+      .filter((peer) => peer.peerId !== peerId)
+      .map(({ peerId: id, displayName: name }) => ({ peerId: id, displayName: name })),
+  });
+
+  broadcast(room, peerId, {
+    type: "peer-joined",
+    peer: { peerId, displayName },
+  });
+  broadcastPeers(room);
+
+  log(`peer ${peerId} joined room ${room}`);
+}
+
+function handleSignal(msg: Extract<ClientMessage, { type: "signal" }>) {
+  const peers = rooms.get(msg.room);
+  if (!peers) {
+    warn(`room ${msg.room} not found for signal`);
+    return;
+  }
+  const target = peers.get(msg.to);
+  if (!target) {
+    warn(`target ${msg.to} missing in room ${msg.room}`);
+    return;
+  }
+  safeSend(target.socket, {
+    type: "signal",
+    from: msg.from,
+    to: msg.to,
+    data: msg.data,
+  });
+}
+
+function ensureRoom(room: RoomCode) {
+  let peers = rooms.get(room);
+  if (!peers) {
+    peers = new Map();
+    rooms.set(room, peers);
+  }
+  return peers;
+}
+
+function handleLeave(room: RoomCode, peerId: PeerId) {
+  const peers = rooms.get(room);
+  if (!peers) {
+    return;
+  }
+  const existing = peers.get(peerId);
+  if (!existing) {
+    return;
+  }
+  peers.delete(peerId);
+  try {
+    existing.socket.terminate();
+  } catch (err) {
+    warn("error terminating socket", err);
+  }
+  broadcast(room, peerId, { type: "peer-left", peerId });
+  broadcastPeers(room);
+  log(`peer ${peerId} left room ${room}`);
+  if (peers.size === 0) {
+    rooms.delete(room);
+  }
+}
+
+function handleDisconnect(socket: WebSocket) {
+  for (const [room, peers] of rooms.entries()) {
+    for (const peer of peers.values()) {
+      if (peer.socket === socket) {
+        handleLeave(room, peer.peerId);
+        return;
       }
-      default:
-        console.warn("[ws] unsupported message", msg);
     }
   }
-});
+}
 
-function forward(targetId: string, msg: Message) {
-  const target = clients.get(targetId);
-  if (!target || target.readyState !== WebSocket.OPEN) {
-    console.warn(`[ws] target ${targetId} not available`);
+function refreshHeartbeat(peerId: PeerId) {
+  for (const peers of rooms.values()) {
+    const peer = peers.get(peerId);
+    if (peer) {
+      peer.lastSeen = Date.now();
+    }
+  }
+}
+
+function broadcast(room: RoomCode, excludePeerId: PeerId, message: ServerMessage) {
+  const peers = rooms.get(room);
+  if (!peers) {
     return;
   }
-  target.send(JSON.stringify(msg));
+  const payload = JSON.stringify(message);
+  for (const peer of peers.values()) {
+    if (peer.peerId === excludePeerId) {
+      continue;
+    }
+    if (peer.socket.readyState === WebSocket.OPEN) {
+      peer.socket.send(payload);
+    }
+  }
 }
 
-function broadcast(msg: Message) {
-  const payload = JSON.stringify(msg);
-  for (const ws of clients.values()) {
-    if (ws.readyState === WebSocket.OPEN) {
-      ws.send(payload);
+function broadcastPeers(room: RoomCode) {
+  const peers = rooms.get(room);
+  if (!peers) {
+    return;
+  }
+  const payload: ServerMessage = {
+    type: "peers",
+    room,
+    peers: Array.from(peers.values()).map(({ peerId, displayName }) => ({
+      peerId,
+      displayName,
+    })),
+  };
+  const serialized = JSON.stringify(payload);
+  for (const peer of peers.values()) {
+    if (peer.socket.readyState === WebSocket.OPEN) {
+      peer.socket.send(serialized);
     }
   }
 }
 
-export { app, server, wss, messageSchema };
+function safeSend(socket: WebSocket, message: Record<string, unknown>) {
+  if (socket.readyState === WebSocket.OPEN) {
+    socket.send(JSON.stringify(message));
+  }
+}
+
+setInterval(() => {
+  const now = Date.now();
+  for (const [room, peers] of rooms.entries()) {
+    for (const peer of peers.values()) {
+      if (now - peer.lastSeen > HEARTBEAT_TIMEOUT) {
+        warn(`peer ${peer.peerId} timed out in room ${room}`);
+        handleLeave(room, peer.peerId);
+      }
+    }
+  }
+}, HEARTBEAT_INTERVAL).unref?.();
+
+export { app, server, wss, clientMessageSchema, serverMessageSchema };
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index c51048a2e00b6707904e73fdfec999bb654cf888..3046b69f2e156eaa53529b5857a650e48dcddc95 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1,58 +1,76 @@
 lockfileVersion: '6.0'
 
 settings:
   autoInstallPeers: true
   excludeLinksFromLockfile: false
 
 importers:
 
   .: {}
 
   apps/client:
     dependencies:
       '@tanstack/react-query':
         specifier: ^5.32.1
         version: 5.90.2(react@18.3.1)
       '@tauri-apps/api':
         specifier: ^1.5.4
         version: 1.6.0
       classnames:
         specifier: ^2.5.1
         version: 2.5.1
+      clsx:
+        specifier: ^2.1.1
+        version: 2.1.1
+      idb:
+        specifier: ^7.1.1
+        version: 7.1.1
+      idb-keyval:
+        specifier: ^6.2.2
+        version: 6.2.2
+      nanoid:
+        specifier: ^5.1.6
+        version: 5.1.6
       react:
         specifier: ^18.2.0
         version: 18.3.1
       react-dom:
         specifier: ^18.2.0
         version: 18.3.1(react@18.3.1)
       react-router-dom:
         specifier: ^6.23.1
         version: 6.30.1(react-dom@18.3.1)(react@18.3.1)
       tailwind-merge:
         specifier: ^2.2.1
         version: 2.6.0
+      zod:
+        specifier: ^3.25.76
+        version: 3.25.76
+      zustand:
+        specifier: ^4.5.7
+        version: 4.5.7(@types/react@18.3.25)(react@18.3.1)
     devDependencies:
       '@tauri-apps/cli':
         specifier: ^1.6.3
         version: 1.6.3
       '@types/node':
         specifier: ^20.12.7
         version: 20.19.19
       '@types/react':
         specifier: ^18.2.79
         version: 18.3.25
       '@types/react-dom':
         specifier: ^18.2.25
         version: 18.3.7(@types/react@18.3.25)
       '@vitejs/plugin-react':
         specifier: ^5.0.4
         version: 5.0.4(vite@5.4.20)
       autoprefixer:
         specifier: ^10.4.19
         version: 10.4.21(postcss@8.5.6)
       postcss:
         specifier: ^8.4.38
         version: 8.5.6
       tailwindcss:
         specifier: ^3.4.3
         version: 3.4.18
@@ -1172,74 +1190,72 @@ packages:
   /@types/express@4.17.23:
     resolution: {integrity: sha512-Crp6WY9aTYP3qPi2wGDo9iUe/rceX01UMhnF1jmwDcKCFM6cx7YhGP/Mpr3y9AASpfHixIG0E6azCcL5OcDHsQ==}
     dependencies:
       '@types/body-parser': 1.19.6
       '@types/express-serve-static-core': 4.19.6
       '@types/qs': 6.14.0
       '@types/serve-static': 1.15.9
     dev: true
 
   /@types/http-errors@2.0.5:
     resolution: {integrity: sha512-r8Tayk8HJnX0FztbZN7oVqGccWgw98T/0neJphO91KkmOzug1KkofZURD4UaD5uH8AqcFLfdPErnBod0u71/qg==}
     dev: true
 
   /@types/mime@1.3.5:
     resolution: {integrity: sha512-/pyBZWSLD2n0dcHE3hq8s8ZvcETHtEuF+3E7XVt0Ig2nvsVQXdghHVcEkIWjy9A0wKfTn97a/PSDYohKIlnP/w==}
     dev: true
 
   /@types/node@20.19.19:
     resolution: {integrity: sha512-pb1Uqj5WJP7wrcbLU7Ru4QtA0+3kAXrkutGiD26wUKzSMgNNaPARTUDQmElUXp64kh3cWdou3Q0C7qwwxqSFmg==}
     dependencies:
       undici-types: 6.21.0
     dev: true
 
   /@types/prop-types@15.7.15:
     resolution: {integrity: sha512-F6bEyamV9jKGAFBEmlQnesRPGOQqS2+Uwi0Em15xenOxHaf2hv6L8YCVn3rPdPJOiJfPiCnLIRyvwVaqMY3MIw==}
-    dev: true
 
   /@types/qs@6.14.0:
     resolution: {integrity: sha512-eOunJqu0K1923aExK6y8p6fsihYEn/BYuQ4g0CxAAgFc4b/ZLN4CrsRZ55srTdqoiLzU2B2evC+apEIxprEzkQ==}
     dev: true
 
   /@types/range-parser@1.2.7:
     resolution: {integrity: sha512-hKormJbkJqzQGhziax5PItDUTMAM9uE2XXQmM37dyd4hVM+5aVl7oVxMVUiVQn2oCQFN/LKCZdvSM0pFRqbSmQ==}
     dev: true
 
   /@types/react-dom@18.3.7(@types/react@18.3.25):
     resolution: {integrity: sha512-MEe3UeoENYVFXzoXEWsvcpg6ZvlrFNlOQ7EOsvhI3CfAXwzPfO8Qwuxd40nepsYKqyyVQnTdEfv68q91yLcKrQ==}
     peerDependencies:
       '@types/react': ^18.0.0
     dependencies:
       '@types/react': 18.3.25
     dev: true
 
   /@types/react@18.3.25:
     resolution: {integrity: sha512-oSVZmGtDPmRZtVDqvdKUi/qgCsWp5IDY29wp8na8Bj4B3cc99hfNzvNhlMkVVxctkAOGUA3Km7MMpBHAnWfcIA==}
     dependencies:
       '@types/prop-types': 15.7.15
       csstype: 3.1.3
-    dev: true
 
   /@types/send@0.17.5:
     resolution: {integrity: sha512-z6F2D3cOStZvuk2SaP6YrwkNO65iTZcwA2ZkSABegdkAh/lf+Aa/YQndZVfmEXT5vgAp6zv06VQ3ejSVjAny4w==}
     dependencies:
       '@types/mime': 1.3.5
       '@types/node': 20.19.19
     dev: true
 
   /@types/send@1.2.0:
     resolution: {integrity: sha512-zBF6vZJn1IaMpg3xUF25VK3gd3l8zwE0ZLRX7dsQyQi+jp4E8mMDJNGDYnYse+bQhYwWERTxVwHpi3dMOq7RKQ==}
     dependencies:
       '@types/node': 20.19.19
     dev: true
 
   /@types/serve-static@1.15.9:
     resolution: {integrity: sha512-dOTIuqpWLyl3BBXU3maNQsS4A3zuuoYRNIvYSxxhebPfXg2mzWQEPne/nlJ37yOse6uGgR386uTpdsx4D0QZWA==}
     dependencies:
       '@types/http-errors': 2.0.5
       '@types/node': 20.19.19
       '@types/send': 0.17.5
     dev: true
 
   /@types/ws@8.18.1:
     resolution: {integrity: sha512-ThVF6DCVhA8kUGy+aazFQ4kXQ7E1Ty7A3ypFOe0IcJV8O/M511G99AW24irKrW56Wt44yG9+ij8FaqoBGkuBXg==}
     dependencies:
@@ -1500,50 +1516,55 @@ packages:
   /check-error@1.0.3:
     resolution: {integrity: sha512-iKEoDYaRmd1mxM90a2OEfWhjsjPpYPuQ+lMYsoxB126+t8fw7ySEO48nmDg5COTjxDI65/Y2OWpeEHk3ZOe8zg==}
     dependencies:
       get-func-name: 2.0.2
     dev: true
 
   /chokidar@3.6.0:
     resolution: {integrity: sha512-7VT13fmjotKpGipCW9JEQAusEPE+Ei8nl6/g4FBAmIm0GOOLMua9NDDo/DWp0ZAxCr3cPq5ZpBqmPAQgDda2Pw==}
     engines: {node: '>= 8.10.0'}
     dependencies:
       anymatch: 3.1.3
       braces: 3.0.3
       glob-parent: 5.1.2
       is-binary-path: 2.1.0
       is-glob: 4.0.3
       normalize-path: 3.0.0
       readdirp: 3.6.0
     optionalDependencies:
       fsevents: 2.3.3
     dev: true
 
   /classnames@2.5.1:
     resolution: {integrity: sha512-saHYOzhIQs6wy2sVxTM6bUDsQO4F50V9RQ22qBpEdCW+I+/Wmke2HOl6lS6dTpdxVhb88/I6+Hs+438c3lfUow==}
     dev: false
 
+  /clsx@2.1.1:
+    resolution: {integrity: sha512-eYm0QWBtUrBWZWG0d386OGAw16Z995PiOVo2B7bjWSbHedGl5e0ZWaq65kOGgUSNesEIDkB9ISbTg/JK9dhCZA==}
+    engines: {node: '>=6'}
+    dev: false
+
   /color-convert@2.0.1:
     resolution: {integrity: sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==}
     engines: {node: '>=7.0.0'}
     dependencies:
       color-name: 1.1.4
     dev: true
 
   /color-name@1.1.4:
     resolution: {integrity: sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==}
     dev: true
 
   /commander@4.1.1:
     resolution: {integrity: sha512-NOKm8xhkzAjzFx8B2v5OAHT+u5pRQc2UCa2Vq9jYL/31o2wi9mxBA7LIFs3sV5VSC49z6pEhfbMULvShKj26WA==}
     engines: {node: '>= 6'}
     dev: true
 
   /confbox@0.1.8:
     resolution: {integrity: sha512-RMtmw0iFkeR4YV+fUOSucriAQNb9g8zFR52MWCtl+cCZOFRNL6zeB395vPzFhEjjn4fMxXudmELnl/KF/WrK6w==}
     dev: true
 
   /content-disposition@0.5.4:
     resolution: {integrity: sha512-FveZTNuGw04cxlAiWbzi6zTAL/lhehaWbTtgluJh4/E95DqMwTmha3KZN1aAWA8cFIhHzMZUvLevkw5Rqk+tSQ==}
     engines: {node: '>= 0.6'}
     dependencies:
       safe-buffer: 5.2.1
@@ -1562,51 +1583,50 @@ packages:
     resolution: {integrity: sha512-QADzlaHc8icV8I7vbaJXJwod9HWYp8uCqf1xa4OfNu1T7JVxQIrUgOWtHdNDtPiywmFbiS12VjotIXLrKM3orQ==}
     dev: false
 
   /cookie@0.7.1:
     resolution: {integrity: sha512-6DnInpx7SJ2AK3+CTUE/ZM0vWTUboZCegxhC2xiIydHR9jNuTAASBrfEpHhiGOZw/nX51bHt6YQl8jsGo4y/0w==}
     engines: {node: '>= 0.6'}
     dev: false
 
   /cross-spawn@7.0.6:
     resolution: {integrity: sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==}
     engines: {node: '>= 8'}
     dependencies:
       path-key: 3.1.1
       shebang-command: 2.0.0
       which: 2.0.2
     dev: true
 
   /cssesc@3.0.0:
     resolution: {integrity: sha512-/Tb/JcjK111nNScGob5MNtsntNM1aCNUDipB/TkwZFhyDrrE47SOx/18wF2bbjgc3ZzCSKW1T5nt5EbFoAz/Vg==}
     engines: {node: '>=4'}
     hasBin: true
     dev: true
 
   /csstype@3.1.3:
     resolution: {integrity: sha512-M1uQkMl8rQK/szD0LNhtqxIPLpimGm8sOBwU7lLnCpSbTyY3yeU1Vc7l4KT5zT4s/yOxHH5O7tIuuLOCnLADRw==}
-    dev: true
 
   /debug@2.6.9:
     resolution: {integrity: sha512-bC7ElrdJaJnPbAP+1EotYvqZsb3ecl5wi6Bfi6BJTUcNowp6cvspg0jXznRTKDjm/E7AdgFBVeAPVMNcKGsHMA==}
     peerDependencies:
       supports-color: '*'
     peerDependenciesMeta:
       supports-color:
         optional: true
     dependencies:
       ms: 2.0.0
     dev: false
 
   /debug@4.4.3:
     resolution: {integrity: sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==}
     engines: {node: '>=6.0'}
     peerDependencies:
       supports-color: '*'
     peerDependenciesMeta:
       supports-color:
         optional: true
     dependencies:
       ms: 2.1.3
     dev: true
 
   /deep-eql@4.1.4:
@@ -1998,50 +2018,58 @@ packages:
       function-bind: 1.1.2
 
   /http-errors@2.0.0:
     resolution: {integrity: sha512-FtwrG/euBzaEjYeRqOgly7G0qviiXoJWnvEH2Z1plBdXgbyjv34pHTSb9zoeHMyDy33+DWy5Wt9Wo+TURtOYSQ==}
     engines: {node: '>= 0.8'}
     dependencies:
       depd: 2.0.0
       inherits: 2.0.4
       setprototypeof: 1.2.0
       statuses: 2.0.1
       toidentifier: 1.0.1
     dev: false
 
   /human-signals@5.0.0:
     resolution: {integrity: sha512-AXcZb6vzzrFAUE61HnN4mpLqd/cSIwNQjtNWR0euPm6y0iqx3G4gOXaIDdtdDwZmhwe82LA6+zinmW4UBWVePQ==}
     engines: {node: '>=16.17.0'}
     dev: true
 
   /iconv-lite@0.4.24:
     resolution: {integrity: sha512-v3MXnZAcvnywkTUEZomIActle7RXXeedOR31wwl7VlyoXO4Qi9arvSenNQWne1TcRwhCL1HwLI21bEqdpj8/rA==}
     engines: {node: '>=0.10.0'}
     dependencies:
       safer-buffer: 2.1.2
     dev: false
 
+  /idb-keyval@6.2.2:
+    resolution: {integrity: sha512-yjD9nARJ/jb1g+CvD0tlhUHOrJ9Sy0P8T9MF3YaLlHnSRpwPfpTX0XIvpmw3gAJUmEu3FiICLBDPXVwyEvrleg==}
+    dev: false
+
+  /idb@7.1.1:
+    resolution: {integrity: sha512-gchesWBzyvGHRO9W8tzUWFDycow5gwjvFKfyV9FF32Y7F50yZMp7mP+T2mJIWFx49zicqyC4uefHM17o6xKIVQ==}
+    dev: false
+
   /inherits@2.0.4:
     resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}
     dev: false
 
   /ipaddr.js@1.9.1:
     resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
     engines: {node: '>= 0.10'}
     dev: false
 
   /is-binary-path@2.1.0:
     resolution: {integrity: sha512-ZMERYes6pDydyuGidse7OsHxtbI7WVeUEozgR/g7rd0xUimYNlvZRE/K2MgZTjWy725IfelLeVcEM97mmtRGXw==}
     engines: {node: '>=8'}
     dependencies:
       binary-extensions: 2.3.0
     dev: true
 
   /is-core-module@2.16.1:
     resolution: {integrity: sha512-UfoeMA6fIJ8wTYFEUjelnaGI67v6+N7qXJEvQuIGa99l4xsCruSYOVSQ0uPANn4dAzm8lkYPaKLrrijLq7x23w==}
     engines: {node: '>= 0.4'}
     dependencies:
       hasown: 2.0.2
     dev: true
 
   /is-extglob@2.1.1:
     resolution: {integrity: sha512-SbKbANkN603Vi4jEZv49LeVJMn4yGwsbzZworEoyEiutsN3nJYdbO36zfhGJ6QEDpOZIFkDtnq5JRxmvl3jsoQ==}
@@ -2231,50 +2259,56 @@ packages:
       pkg-types: 1.3.1
       ufo: 1.6.1
     dev: true
 
   /ms@2.0.0:
     resolution: {integrity: sha512-Tpp60P6IUJDTuOq/5Z8cdskzJujfwqfOTkrwIwj7IRISpnkJnT6SyJ4PCPnGMoFjC9ddhal5KVIYtAt97ix05A==}
     dev: false
 
   /ms@2.1.3:
     resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}
 
   /mz@2.7.0:
     resolution: {integrity: sha512-z81GNO7nnYMEhrGh9LeymoE4+Yr0Wn5McHIZMK5cfQCl+NDX08sCZgUc9/6MHni9IWuFLm1Z3HTCXu2z9fN62Q==}
     dependencies:
       any-promise: 1.3.0
       object-assign: 4.1.1
       thenify-all: 1.6.0
     dev: true
 
   /nanoid@3.3.11:
     resolution: {integrity: sha512-N8SpfPUnUp1bK+PMYW8qSWdl9U+wwNWI4QKxOYDy9JAro3WMX7p2OeVRF9v+347pnakNevPmiHhNmZ2HbFA76w==}
     engines: {node: ^10 || ^12 || ^13.7 || ^14 || >=15.0.1}
     hasBin: true
     dev: true
 
+  /nanoid@5.1.6:
+    resolution: {integrity: sha512-c7+7RQ+dMB5dPwwCp4ee1/iV/q2P6aK1mTZcfr1BTuVlyW9hJYiMPybJCcnBlQtuSmTIWNeazm/zqNoZSSElBg==}
+    engines: {node: ^18 || >=20}
+    hasBin: true
+    dev: false
+
   /negotiator@0.6.3:
     resolution: {integrity: sha512-+EUsqGPLsM+j/zdChZjsnX51g4XrHFOIXwfnCVPGlQk/k5giakcKsuxCObBRu6DSm9opw/O6slWbJdghQM4bBg==}
     engines: {node: '>= 0.6'}
     dev: false
 
   /node-releases@2.0.23:
     resolution: {integrity: sha512-cCmFDMSm26S6tQSDpBCg/NR8NENrVPhAJSf+XbxBG4rPFaaonlEoE9wHQmun+cls499TQGSb7ZyPBRlzgKfpeg==}
     dev: true
 
   /normalize-path@3.0.0:
     resolution: {integrity: sha512-6eZs5Ls3WtCisHWp9S2GUy8dqkpGi4BVSz3GaqiE6ezub0512ESztXUwUB6C6IKbQkY2Pnb/mD4WYojCRwcwLA==}
     engines: {node: '>=0.10.0'}
     dev: true
 
   /normalize-range@0.1.2:
     resolution: {integrity: sha512-bdok/XvKII3nUpklnV6P2hxtMNrCboOjAcyBuQnWEhO665FwrSNRxU+AqpsyvO6LgGYPspN+lu5CLtw4jPRKNA==}
     engines: {node: '>=0.10.0'}
     dev: true
 
   /npm-run-path@5.3.0:
     resolution: {integrity: sha512-ppwTtiJZq0O/ai0z7yfudtBpWIoxM8yE6nHi1X47eFR2EWORqfbu6CnPlNsjeN683eT0qG6H/Pyf9fCcvjnnnQ==}
     engines: {node: ^12.20.0 || ^14.13.1 || >=16.0.0}
     dependencies:
       path-key: 4.0.0
     dev: true
@@ -2941,50 +2975,58 @@ packages:
 
   /ufo@1.6.1:
     resolution: {integrity: sha512-9a4/uxlTWJ4+a5i0ooc1rU7C7YOw3wT+UGqdeNNHWnOF9qcMBgLRS+4IYUqbczewFx4mLEig6gawh7X6mFlEkA==}
     dev: true
 
   /undici-types@6.21.0:
     resolution: {integrity: sha512-iwDZqg0QAGrg9Rav5H4n0M64c3mkR59cJ6wQp+7C4nI0gsmExaedaYLNO44eT4AtBBwjbTiGPMlt2Md0T9H9JQ==}
     dev: true
 
   /unpipe@1.0.0:
     resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
     engines: {node: '>= 0.8'}
     dev: false
 
   /update-browserslist-db@1.1.3(browserslist@4.26.3):
     resolution: {integrity: sha512-UxhIZQ+QInVdunkDAaiazvvT/+fXL5Osr0JZlJulepYu6Jd7qJtDZjlur0emRlT71EN3ScPoE7gvsuIKKNavKw==}
     hasBin: true
     peerDependencies:
       browserslist: '>= 4.21.0'
     dependencies:
       browserslist: 4.26.3
       escalade: 3.2.0
       picocolors: 1.1.1
     dev: true
 
+  /use-sync-external-store@1.6.0(react@18.3.1):
+    resolution: {integrity: sha512-Pp6GSwGP/NrPIrxVFAIkOQeyw8lFenOHijQWkUTrDvrF4ALqylP2C/KCkeS9dpUM3KvYRQhna5vt7IL95+ZQ9w==}
+    peerDependencies:
+      react: ^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0
+    dependencies:
+      react: 18.3.1
+    dev: false
+
   /util-deprecate@1.0.2:
     resolution: {integrity: sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==}
     dev: true
 
   /utils-merge@1.0.1:
     resolution: {integrity: sha512-pMZTvIkT1d+TFGvDOqodOclx0QWkkgi6Tdoa8gC8ffGAAqz9pzPTZWAybbsHHoED/ztMtkv/VoYTYyShUn81hA==}
     engines: {node: '>= 0.4.0'}
     dev: false
 
   /vary@1.1.2:
     resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
     engines: {node: '>= 0.8'}
     dev: false
 
   /vite-node@1.6.1(@types/node@20.19.19):
     resolution: {integrity: sha512-YAXkfvGtuTzwWbDSACdJSg4A4DZiAqckWe90Zapc/sEX3XvHcw1NdurM/6od8J207tSDqNbSsgdCacBgvJKFuA==}
     engines: {node: ^18.0.0 || >=20.0.0}
     hasBin: true
     dependencies:
       cac: 6.7.14
       debug: 4.4.3
       pathe: 1.1.2
       picocolors: 1.1.1
       vite: 5.4.20(@types/node@20.19.19)
     transitivePeerDependencies:
@@ -3133,25 +3175,45 @@ packages:
   /ws@8.18.3:
     resolution: {integrity: sha512-PEIGCY5tSlUt50cqyMXfCzX+oOPqN0vuGqWzbcJ2xvnkzkq46oOpz7dQaTDBdfICb4N14+GARUDw2XV2N4tvzg==}
     engines: {node: '>=10.0.0'}
     peerDependencies:
       bufferutil: ^4.0.1
       utf-8-validate: '>=5.0.2'
     peerDependenciesMeta:
       bufferutil:
         optional: true
       utf-8-validate:
         optional: true
     dev: false
 
   /yallist@3.1.1:
     resolution: {integrity: sha512-a4UGQaWPH59mOXUYnAG2ewncQS4i4F43Tv3JoAM+s2VDAmS9NsK8GpDMLrCHPksFT7h3K6TOoUNn2pb7RoXx4g==}
     dev: true
 
   /yocto-queue@1.2.1:
     resolution: {integrity: sha512-AyeEbWOu/TAXdxlV9wmGcR0+yh2j3vYPGOECcIj2S7MkrLyC7ne+oye2BKTItt0ii2PHk4cDy+95+LshzbXnGg==}
     engines: {node: '>=12.20'}
     dev: true
 
   /zod@3.25.76:
     resolution: {integrity: sha512-gzUt/qt81nXsFGKIFcC3YnfEAx5NkunCfnDlvuBSSFS02bcXu4Lmea0AFIUwbLWxWPx3d9p8S5QoaujKcNQxcQ==}
     dev: false
+
+  /zustand@4.5.7(@types/react@18.3.25)(react@18.3.1):
+    resolution: {integrity: sha512-CHOUy7mu3lbD6o6LJLfllpjkzhHXSBlX8B9+qPddUsIfeF5S/UZ5q0kmCsnRqT1UHFQZchNFDDzMbQsuesHWlw==}
+    engines: {node: '>=12.7.0'}
+    peerDependencies:
+      '@types/react': '>=16.8'
+      immer: '>=9.0.6'
+      react: '>=16.8'
+    peerDependenciesMeta:
+      '@types/react':
+        optional: true
+      immer:
+        optional: true
+      react:
+        optional: true
+    dependencies:
+      '@types/react': 18.3.25
+      react: 18.3.1
+      use-sync-external-store: 1.6.0(react@18.3.1)
+    dev: false
 
EOF
)