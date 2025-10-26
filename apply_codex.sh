 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index 3508d35aa355f029b672512f60693c560037d6e7..57f3d17f4277c5ceb0bb668abfec02cb66097d0c 100644
--- a/README.md
+++ b/README.md
@@ -1,36 +1,51 @@
 # FluxShare
 
 FluxShare é um cliente desktop multiplataforma (Windows/Linux/macOS) para transferência de arquivos P2P com fallback automático para QUIC e Cloudflare Tunnel. O projeto é distribuído sob a licença MIT e organizado como um monorepo com pnpm.
 
 ## Pré-requisitos
 
 - [Node.js 20+](https://nodejs.org/) com pnpm (`corepack enable`)
 - [Rust](https://www.rust-lang.org/) stable (via rustup)
 - Dependências do Tauri (ver [documentação oficial](https://tauri.app/v1/guides/getting-started/prerequisites))
 - `cloudflared` disponível no `PATH`
 
+### Linux/WSL build deps
+
+Para compilar o cliente Tauri em distribuições Linux (incluindo WSL), instale os pacotes abaixo:
+
+```bash
+# Ubuntu / Debian
+sudo apt update && sudo apt install -y build-essential pkg-config libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev
+
+# Arch Linux
+sudo pacman -S --needed base-devel pkgconf glib2 gtk3 webkit2gtk-4.1 libsoup
+
+# Fedora
+sudo dnf install -y gcc-c++ make pkgconfig glib2-devel gtk3-devel webkit2gtk4.1-devel libsoup3-devel
+```
+
 ## Instalação
 
 ```bash
 pnpm install
 ```
 
 ## Desenvolvimento
 
 ```bash
 # terminal 1 – servidor de sinalização
 pnpm --filter signaling-server dev
 
 # terminal 2 – cliente web
 pnpm --filter fluxshare-client dev
 
 # opcional: cliente Tauri
 pnpm --filter fluxshare-client tauri dev
 ```
 
 O cabeçalho do cliente exibe um botão para alternar entre os temas claro e escuro; a escolha é persistida automaticamente no
 `localStorage`.
 
 Defina um arquivo `.env` na raiz de `apps/client` com a URL do servidor de sinalização e ICE servers:
 
 ```bash
diff --git a/apps/client/package.json b/apps/client/package.json
index 6d1eb1caa0c035fada072de37e5cb8c73d97494a..63993ea28d32109a720ac199b4925698d283fb54 100644
--- a/apps/client/package.json
+++ b/apps/client/package.json
@@ -1,33 +1,35 @@
 {
   "name": "fluxshare-client",
   "version": "0.1.0",
   "private": true,
   "type": "module",
   "scripts": {
     "dev": "vite --host",
-    "build": "vite build && tauri build",
+    "build": "pnpm run web:build",
+    "web:dev": "vite",
+    "web:build": "vite build",
     "preview": "vite preview",
     "tauri": "tauri"
   },
   "dependencies": {
     "@tanstack/react-query": "^5.32.1",
     "@tauri-apps/api": "^1.5.4",
     "classnames": "^2.5.1",
     "clsx": "^2.1.1",
     "idb": "^7.1.1",
     "idb-keyval": "^6.2.2",
     "nanoid": "^5.1.6",
     "react": "^18.2.0",
     "react-dom": "^18.2.0",
     "react-router-dom": "^6.23.1",
     "tailwind-merge": "^2.2.1",
     "zod": "^3.25.76",
     "zustand": "^4.5.7"
   },
   "devDependencies": {
     "@tauri-apps/cli": "^1.6.3",
     "@types/node": "^20.12.7",
     "@types/react": "^18.2.79",
     "@types/react-dom": "^18.2.25",
     "@vitejs/plugin-react": "^5.0.4",
     "autoprefixer": "^10.4.19",
diff --git a/apps/client/src-tauri/Cargo.lock b/apps/client/src-tauri/Cargo.lock
index ce9b58174417dafc5a505f5d7a043902e34c93c8..dbf4992c3f31bf277d7594e6de321538dbd919bf 100644
--- a/apps/client/src-tauri/Cargo.lock
+++ b/apps/client/src-tauri/Cargo.lock
@@ -85,51 +85,51 @@ dependencies = [
  "libc",
 ]
 
 [[package]]
 name = "anyhow"
 version = "1.0.100"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "a23eb6b1614318a8071c9b2521f36b424b2c83db5eb3a0fead4a6c0809af6e61"
 
 [[package]]
 name = "arboard"
 version = "3.6.1"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "0348a1c054491f4bfe6ab86a7b6ab1e44e45d899005de92f58b3df180b36ddaf"
 dependencies = [
  "clipboard-win",
  "image 0.25.8",
  "log",
  "objc2",
  "objc2-app-kit",
  "objc2-core-foundation",
  "objc2-core-graphics",
  "objc2-foundation",
  "parking_lot",
  "percent-encoding",
- "windows-sys 0.52.0",
+ "windows-sys 0.60.2",
  "wl-clipboard-rs",
  "x11rb",
 ]
 
 [[package]]
 name = "arc-swap"
 version = "1.7.1"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "69f7f8c3906b62b754cd5326047894316021dcfe5a194c8ea52bdd94934a3457"
 
 [[package]]
 name = "argon2"
 version = "0.5.3"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "3c3610892ee6e0cbce8ae2700349fcf8f98adb0dbfbee85aec3c9179d29cc072"
 dependencies = [
  "base64ct",
  "blake2",
  "cpufeatures",
  "password-hash",
 ]
 
 [[package]]
 name = "arrayref"
 version = "0.3.9"
@@ -1260,50 +1260,56 @@ dependencies = [
 name = "dunce"
 version = "1.0.5"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "92773504d58c093f6de2459af4af33faa518c13451eb8f2b5698ed3d36e7c813"
 
 [[package]]
 name = "dyn-clone"
 version = "1.0.20"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "d0881ea181b1df73ff77ffaaf9c7544ecc11e82fba9b5f27b262a3c73a332555"
 
 [[package]]
 name = "ecdsa"
 version = "0.16.9"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "ee27f32b5c5292967d2d4a9d7f1e0b0aed2c15daded5a60300e4abb9d8020bca"
 dependencies = [
  "der",
  "digest",
  "elliptic-curve",
  "rfc6979",
  "signature",
  "spki",
 ]
 
+[[package]]
+name = "either"
+version = "1.15.0"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "48c757948c5ede0e46177b7add2e67155f70e33c07fea8284df6576da70b3719"
+
 [[package]]
 name = "elliptic-curve"
 version = "0.13.8"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "b5e6043086bf7973472e0c7dff2142ea0b680d30e18d9cc40f267efbf222bd47"
 dependencies = [
  "base16ct",
  "crypto-bigint",
  "digest",
  "ff",
  "generic-array",
  "group",
  "hkdf",
  "pem-rfc7468",
  "pkcs8",
  "rand_core 0.6.4",
  "sec1",
  "subtle",
  "zeroize",
 ]
 
 [[package]]
 name = "embed-resource"
 version = "2.5.2"
 source = "registry+https://github.com/rust-lang/crates.io-index"
@@ -1512,50 +1518,51 @@ version = "0.1.0"
 dependencies = [
  "anyhow",
  "argon2",
  "axum",
  "blake3",
  "bytes",
  "chacha20poly1305",
  "chrono",
  "dirs",
  "fs_extra",
  "parking_lot",
  "quinn",
  "rand 0.8.5",
  "serde",
  "serde_json",
  "tauri",
  "tauri-build",
  "tempfile",
  "thiserror 1.0.69",
  "tokio",
  "tracing",
  "tracing-appender",
  "tracing-subscriber",
  "url",
  "webrtc",
+ "which",
 ]
 
 [[package]]
 name = "fnv"
 version = "1.0.7"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "3f9eec918d3f24069decb9af1554cad7c880e2da24a9afd88aca000531ab82c1"
 
 [[package]]
 name = "foreign-types"
 version = "0.3.2"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "f6f339eb8adc052cd2ca78910fda869aefa38d22d5cb648e6485e4d3fc06f3b1"
 dependencies = [
  "foreign-types-shared",
 ]
 
 [[package]]
 name = "foreign-types-shared"
 version = "0.1.1"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "00b0228411908ca8685dba7fc2cdd70ec9990a6e753e89b6ac91a84c40fbaf4b"
 
 [[package]]
 name = "form_urlencoded"
@@ -2104,50 +2111,59 @@ checksum = "fc0fef456e4baa96da950455cd02c081ca953b141298e41db3fc7e36b1da849c"
 
 [[package]]
 name = "hex"
 version = "0.4.3"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "7f24254aa9a54b5c858eaee2f5bccdb46aaf0e486a595ed5fd8f86ba55232a70"
 
 [[package]]
 name = "hkdf"
 version = "0.12.4"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "7b5f8eb2ad728638ea2c7d47a21db23b7b58a72ed6a38256b8a1849f15fbbdf7"
 dependencies = [
  "hmac",
 ]
 
 [[package]]
 name = "hmac"
 version = "0.12.1"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "6c49c37c09c17a53d937dfbb742eb3a961d65a994e6bcdcf37e7399d0cc8ab5e"
 dependencies = [
  "digest",
 ]
 
+[[package]]
+name = "home"
+version = "0.5.12"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "cc627f471c528ff0c4a49e1d5e60450c8f6461dd6d10ba9dcd3a61d3dff7728d"
+dependencies = [
+ "windows-sys 0.61.1",
+]
+
 [[package]]
 name = "html5ever"
 version = "0.26.0"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "bea68cab48b8459f17cf1c944c67ddc572d272d9f2b274140f223ecb1da4a3b7"
 dependencies = [
  "log",
  "mac",
  "markup5ever",
  "proc-macro2",
  "quote",
  "syn 1.0.109",
 ]
 
 [[package]]
 name = "http"
 version = "0.2.12"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "601cbb57e577e2f5ef5be8e7b83f0f63994f25aa94d673e54a92d5c516d101f1"
 dependencies = [
  "bytes",
  "fnv",
  "itoa 1.0.15",
 ]
 
@@ -4170,51 +4186,51 @@ version = "0.4.1"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "cfcb3a22ef46e85b45de6ee7e79d063319ebb6594faafcf1c225ea92ab6e9b92"
 dependencies = [
  "semver",
 ]
 
 [[package]]
 name = "rusticata-macros"
 version = "4.1.0"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "faf0c4a6ece9950b9abdb62b1cfcf2a68b3b67a10ba445b3bb85be2a293d0632"
 dependencies = [
  "nom",
 ]
 
 [[package]]
 name = "rustix"
 version = "0.38.44"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "fdb5bc1ae2baa591800df16c9ca78619bf65c0488b41b96ccec5d11220d8c154"
 dependencies = [
  "bitflags 2.9.4",
  "errno",
  "libc",
  "linux-raw-sys 0.4.15",
- "windows-sys 0.52.0",
+ "windows-sys 0.59.0",
 ]
 
 [[package]]
 name = "rustix"
 version = "1.1.2"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "cd15f8a2c5551a84d56efdc1cd049089e409ac19a3072d5037a17fd70719ff3e"
 dependencies = [
  "bitflags 2.9.4",
  "errno",
  "libc",
  "linux-raw-sys 0.11.0",
  "windows-sys 0.61.1",
 ]
 
 [[package]]
 name = "rustls"
 version = "0.21.12"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "3f56a14d1f48b391359b22f731fd4bd7e43c97f3c50eee276f3aa09c94784d3e"
 dependencies = [
  "log",
  "ring 0.17.14",
  "rustls-webpki",
  "sct",
@@ -6333,50 +6349,62 @@ dependencies = [
  "quote",
  "syn 1.0.109",
 ]
 
 [[package]]
 name = "webview2-com-sys"
 version = "0.19.0"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "aac48ef20ddf657755fdcda8dfed2a7b4fc7e4581acce6fe9b88c3d64f29dee7"
 dependencies = [
  "regex",
  "serde",
  "serde_json",
  "thiserror 1.0.69",
  "windows 0.39.0",
  "windows-bindgen",
  "windows-metadata",
 ]
 
 [[package]]
 name = "weezl"
 version = "0.1.10"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "a751b3277700db47d3e574514de2eced5e54dc8a5436a3bf7a0b248b2cee16f3"
 
+[[package]]
+name = "which"
+version = "4.4.2"
+source = "registry+https://github.com/rust-lang/crates.io-index"
+checksum = "87ba24419a2078cd2b0f2ede2691b6c66d8e47836da3b6db8265ebad47afbfc7"
+dependencies = [
+ "either",
+ "home",
+ "once_cell",
+ "rustix 0.38.44",
+]
+
 [[package]]
 name = "winapi"
 version = "0.3.9"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "5c839a674fcd7a98952e593242ea400abe93992746761e38641405d28b00f419"
 dependencies = [
  "winapi-i686-pc-windows-gnu",
  "winapi-x86_64-pc-windows-gnu",
 ]
 
 [[package]]
 name = "winapi-i686-pc-windows-gnu"
 version = "0.4.0"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "ac3b87c63620426dd9b991e5ce0329eff545bccbbb34f3be09ff6fb6ab51b7b6"
 
 [[package]]
 name = "winapi-util"
 version = "0.1.11"
 source = "registry+https://github.com/rust-lang/crates.io-index"
 checksum = "c2a7b1c03c876122aa43f3020e6c3c3ee5c05081c9a00739faf7503aeba10d22"
 dependencies = [
  "windows-sys 0.61.1",
 ]
 
diff --git a/apps/client/src-tauri/Cargo.toml b/apps/client/src-tauri/Cargo.toml
index eee71817a733a491d32572b0882fbf9c0692271f..5735282041cc2da4a6d2553e2993461d9c0cc648 100644
--- a/apps/client/src-tauri/Cargo.toml
+++ b/apps/client/src-tauri/Cargo.toml
@@ -10,36 +10,37 @@ license = "MIT"
 name = "fluxshare_lib"
 crate-type = ["cdylib", "rlib"]
 
 [dependencies]
 anyhow = "1"
 argon2 = "0.5"
 axum = { version = "0.7", features = ["macros"] }
 blake3 = "1"
 bytes = "1"
 chacha20poly1305 = { version = "0.10", features = ["std"] }
 dirs = "5"
 fs_extra = "1"
 parking_lot = "0.12"
 quinn = { version = "0.10", features = ["rustls"] }
 rand = "0.8"
 serde = { version = "1", features = ["derive"] }
 serde_json = "1"
 thiserror = "1"
 tauri = { version = "1.5", features = ["api-all", "process-command-api"] }
 tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "process", "signal", "sync", "time"] }
 tracing = "0.1"
 tracing-appender = "0.2"
 tracing-subscriber = { version = "0.3", features = ["fmt", "env-filter", "json"] }
 url = "2"
 webrtc = "0.10"
+which = "4"
 # opcional: só se realmente usar
 chrono = { version = "0.4", features = ["serde"] }
 
 [build-dependencies]
 tauri-build = { version = "1", features = [] }
 
 
 [dev-dependencies]
 rand = "0.8"
 tempfile = "3"
 
diff --git a/apps/client/src-tauri/src/commands/tunnel.rs b/apps/client/src-tauri/src/commands/tunnel.rs
index 576dde9c5d0cd7cb7cda6d269aa142d10c2f7a1e..25fb94a6df66fbe9147e6ab5c59e3e38696b5ae6 100644
--- a/apps/client/src-tauri/src/commands/tunnel.rs
+++ b/apps/client/src-tauri/src/commands/tunnel.rs
@@ -1,115 +1,466 @@
 use std::io::{BufRead, BufReader};
 use std::process::{Child, Command, Stdio};
 use std::sync::Arc;
+use std::thread::JoinHandle as ThreadJoinHandle;
 use std::time::Duration;
 
+use axum::{response::Html, routing::get, Router};
 use parking_lot::Mutex;
 use serde::Serialize;
+use tauri::Manager;
+use tokio::sync::oneshot;
+use which::which;
 
-use super::settings::SettingsManager;
-
-#[derive(Default, Clone)]
-pub struct TunnelManager {
-    inner: Arc<Mutex<TunnelState>>,
-}
+const EVENT_TUNNEL_LOG: &str = "fluxshare://tunnel-log"; // LLM-LOCK: event name consumed by frontend listeners
+const EVENT_TUNNEL_STATUS: &str = "fluxshare://tunnel-status"; // LLM-LOCK: status event contract with Admin page tests
+const EVENT_TUNNEL_STOPPED: &str = "tunnel:stopped"; // LLM-LOCK: backend exit notification consumed by frontend logger
+const URL_DETECTION_TIMEOUT: Duration = Duration::from_secs(20);
 
 #[derive(Default)]
 struct TunnelState {
-    child: Option<Child>,
-    url: Option<String>,
+    child: Option<Child>;
+    url: Option<String>;
+    log_handles: Vec<ThreadJoinHandle<()>>;
+    server_handle: Option<tauri::async_runtime::JoinHandle<()>>;
+    server_shutdown: Option<oneshot::Sender<()>>;
+    server_port: Option<u16>;
+    exit_monitor: Option<tauri::async_runtime::JoinHandle<()>>;
+}
+
+#[derive(Default, Clone)]
+pub struct TunnelManager {
+    pub(super) inner: Arc<Mutex<TunnelState>>,
 }
 
 #[derive(Serialize)]
 pub struct TunnelInfo {
     pub public_url: String,
 }
 
+#[derive(Serialize)]
+pub struct TunnelStatus {
+    pub running: bool,
+    pub url: Option<String>,
+}
+
+#[derive(Serialize)]
+struct TunnelLogPayload {
+    line: String,
+}
+
+#[derive(Serialize)]
+struct TunnelStatusPayload {
+    running: bool,
+    url: Option<String>,
+}
+
+fn emit_log(app: &tauri::AppHandle, line: &str) {
+    let _ = app.emit_all(
+        EVENT_TUNNEL_LOG,
+        TunnelLogPayload {
+            line: line.to_string(),
+        },
+    );
+}
+
+fn emit_status(app: &tauri::AppHandle, running: bool, url: Option<String>) {
+    let _ = app.emit_all(
+        EVENT_TUNNEL_STATUS,
+        TunnelStatusPayload {
+            running,
+            url,
+        },
+    );
+}
+
+fn emit_tunnel_stopped(app: &tauri::AppHandle, code: Option<i32>) -> i32 {
+    let resolved = code.unwrap_or(-1);
+    tracing::info!(code = resolved, "cloudflare_tunnel_exited");
+    let _ = app.emit_all(EVENT_TUNNEL_STOPPED, resolved);
+    resolved
+}
+
+async fn finalize_tunnel_exit(
+    app: &tauri::AppHandle,
+    manager: &TunnelManager,
+    code: Option<i32>,
+) {
+    let exit_code = emit_tunnel_stopped(app, code);
+    emit_status(app, false, None);
+    let (log_handles, server_shutdown, server_handle) = {
+        let mut state = manager.inner.lock();
+        state.child = None;
+        state.url = None;
+        state.server_port = None;
+        state.exit_monitor = None;
+        (
+            state.log_handles.drain(..).collect::<Vec<_>>(),
+            state.server_shutdown.take(),
+            state.server_handle.take(),
+        )
+    };
+
+    if let Some(tx) = server_shutdown {
+        let _ = tx.send(());
+    }
+
+    if let Some(handle) = server_handle {
+        let _ = handle.await;
+    }
+
+    let _ = tauri::async_runtime::spawn_blocking(move || {
+        for handle in log_handles {
+            let _ = handle.join();
+        }
+    })
+    .await;
+
+    emit_log(app, &format!("Tunnel finalizado (código {exit_code})."));
+}
+
+fn spawn_exit_monitor(
+    app: tauri::AppHandle,
+    manager: TunnelManager,
+) -> tauri::async_runtime::JoinHandle<()> {
+    tauri::async_runtime::spawn(async move {
+        loop {
+            let outcome = {
+                let mut state = manager.inner.lock();
+                if let Some(child) = state.child.as_mut() {
+                    match child.try_wait() {
+                        Ok(Some(status)) => Some(Ok(status)),
+                        Ok(None) => None,
+                        Err(error) => Some(Err(error)),
+                    }
+                } else {
+                    state.exit_monitor = None;
+                    return;
+                }
+            };
+
+            match outcome {
+                Some(Ok(status)) => {
+                    finalize_tunnel_exit(&app, &manager, status.code()).await;
+                    return;
+                }
+                Some(Err(error)) => {
+                    tracing::error!(?error, "cloudflare_tunnel_wait_error");
+                    finalize_tunnel_exit(&app, &manager, None).await;
+                    return;
+                }
+                None => {
+                    tauri::async_runtime::sleep(Duration::from_millis(500)).await;
+                }
+            }
+        }
+    })
+}
+
+fn cleanup_finished(state: &mut TunnelState) {
+    if let Some(child) = state.child.as_mut() {
+        if let Ok(Some(_)) = child.try_wait() {
+            state.child = None;
+            state.url = None;
+        }
+    }
+    if state.child.is_none() {
+        for handle in state.log_handles.drain(..) {
+            let _ = handle.join();
+        }
+    }
+    if let Some(handle) = &state.server_handle {
+        if handle.is_finished() {
+            state.server_handle = None;
+            state.server_shutdown = None;
+            state.server_port = None;
+        }
+    }
+    if let Some(handle) = &state.exit_monitor {
+        if handle.is_finished() {
+            state.exit_monitor = None;
+        }
+    }
+}
+
+async fn ensure_http_server(manager: &TunnelManager) -> Result<u16, String> {
+    {
+        let mut state = manager.inner.lock();
+        cleanup_finished(&mut state);
+        if let Some(port) = state.server_port {
+            if let Some(handle) = &state.server_handle {
+                if !handle.is_finished() {
+                    return Ok(port);
+                }
+            } else {
+                return Ok(port);
+            }
+        }
+    }
+
+    let (ready_tx, ready_rx) = oneshot::channel::<Result<u16, String>>();
+    let (shutdown_tx, shutdown_rx) = oneshot::channel();
+
+    let handle = tauri::async_runtime::spawn(async move {
+        let listener = match tokio::net::TcpListener::bind(("127.0.0.1", 0)).await {
+            Ok(listener) => listener,
+            Err(error) => {
+                let _ = ready_tx.send(Err(format!("falha ao abrir porta HTTP: {error}")));
+                return;
+            }
+        };
+
+        let port = match listener.local_addr() {
+            Ok(addr) => addr.port(),
+            Err(error) => {
+                let _ = ready_tx.send(Err(format!("falha ao descobrir porta HTTP: {error}")));
+                return;
+            }
+        };
+
+        let router = Router::new()
+            .route(
+                "/",
+                get(|| async {
+                    Html("<h1>FluxShare</h1><p>Tunnel ativo e pronto para receber conexões.</p>")
+                }),
+            )
+            .route(
+                "/health",
+                get(|| async { Html("ok") }),
+            );
+
+        if ready_tx.send(Ok(port)).is_err() {
+            return;
+        }
+
+        if let Err(error) = axum::serve(listener, router.into_make_service())
+            .with_graceful_shutdown(async {
+                let _ = shutdown_rx.await;
+            })
+            .await
+        {
+            tracing::error!(?error, "tunnel_http_server_exit");
+        }
+    });
+
+    let port = ready_rx
+        .await
+        .map_err(|_| "falha ao iniciar servidor HTTP".to_string())??;
+
+    let mut state = manager.inner.lock();
+    state.server_handle = Some(handle);
+    state.server_shutdown = Some(shutdown_tx);
+    state.server_port = Some(port);
+    Ok(port)
+}
+
+fn spawn_log_reader<R: BufRead + Send + 'static>(
+    reader: R,
+    source: &'static str,
+    app: tauri::AppHandle,
+    manager: TunnelManager,
+    url_sender: std::sync::mpsc::Sender<String>,
+) -> ThreadJoinHandle<()> {
+    std::thread::spawn(move || {
+        for line in reader.lines().flatten() {
+            let formatted = format!("[{source}] {line}");
+            emit_log(&app, &formatted);
+            if let Some(url) = extract_url(&line) {
+                let _ = url_sender.send(url.clone());
+                {
+                    let mut state = manager.inner.lock();
+                    state.url = Some(url.clone());
+                }
+                emit_status(&app, true, Some(url));
+            }
+        }
+        let mut should_emit = false;
+        {
+            let mut state = manager.inner.lock();
+            cleanup_finished(&mut state);
+            if state.child.is_none() {
+                should_emit = true;
+            }
+        }
+        if should_emit {
+            emit_status(&app, false, None);
+        }
+    })
+}
+
+fn extract_url(line: &str) -> Option<String> {
+    line.split_whitespace()
+        .find(|segment| segment.contains("trycloudflare.com"))
+        .map(|segment| segment.trim_matches('"').to_string())
+}
+
 #[tauri::command]
-pub fn start_tunnel(
+pub async fn start_tunnel(
+    app: tauri::AppHandle,
     manager: tauri::State<'_, TunnelManager>,
-    settings: tauri::State<'_, SettingsManager>,
-    local_port: u16,
 ) -> Result<TunnelInfo, String> {
     {
-        let state = manager.inner.lock();
-        if state.child.is_some() {
-            if let Some(url) = state.url.clone() {
-                return Ok(TunnelInfo { public_url: url });
+        let mut state = manager.inner.lock();
+        cleanup_finished(&mut state);
+        if let Some(child) = state.child.as_mut() {
+            if child.try_wait().map_err(|e| e.to_string())?.is_none() {
+                if let Some(url) = state.url.clone() {
+                    return Ok(TunnelInfo { public_url: url });
+                }
             }
         }
     }
 
-    let settings = settings.get_settings().map_err(|e| e.to_string())?;
-    let mut child = Command::new(&settings.cloudflared_path)
-        .args(["tunnel", "--url", &format!("http://127.0.0.1:{local_port}")])
+    let port = ensure_http_server(&manager).await?;
+    let binary = which("cloudflared").map_err(|_| "cloudflared não encontrado no PATH".to_string())?;
+    emit_log(
+        &app,
+        &format!("Iniciando cloudflared: http://127.0.0.1:{port}"),
+    );
+
+    let mut child = Command::new(binary)
+        .args(["tunnel", "--url", &format!("http://127.0.0.1:{port}")])
         .stdout(Stdio::piped())
         .stderr(Stdio::piped())
         .spawn()
-        .map_err(|e| format!("falha ao iniciar cloudflared: {e}"))?;
+        .map_err(|error| format!("falha ao iniciar cloudflared: {error}"))?;
 
     let stdout = child.stdout.take().map(BufReader::new);
     let stderr = child.stderr.take().map(BufReader::new);
 
-    let (tx, rx) = std::sync::mpsc::channel();
-    let state_arc = manager.inner.clone();
-    std::thread::spawn(move || {
-        let mut found_url: Option<String> = None;
-        if let Some(reader) = stdout {
-            if let Some(url) = read_for_url(reader) {
-                let _ = tx.send(url.clone());
-                found_url = Some(url);
-            }
-        }
-        if found_url.is_none() {
-            if let Some(reader) = stderr {
-                if let Some(url) = read_for_url(reader) {
-                    let _ = tx.send(url.clone());
-                    found_url = Some(url);
-                }
+    let (url_tx, url_rx) = std::sync::mpsc::channel();
+    let mut log_handles = Vec::new();
+
+    if let Some(reader) = stdout {
+        log_handles.push(spawn_log_reader(
+            reader,
+            "stdout",
+            app.clone(),
+            manager.clone(),
+            url_tx.clone(),
+        ));
+    }
+    if let Some(reader) = stderr {
+        log_handles.push(spawn_log_reader(
+            reader,
+            "stderr",
+            app.clone(),
+            manager.clone(),
+            url_tx.clone(),
+        ));
+    }
+    drop(url_tx);
+
+    let url = match url_rx.recv_timeout(URL_DETECTION_TIMEOUT) {
+        Ok(url) => url,
+        Err(_) => {
+            let _ = child.kill();
+            let _ = child.wait();
+            for handle in log_handles {
+                let _ = handle.join();
             }
+            return Err("não foi possível detectar URL do tunnel".to_string());
         }
-        if let Some(url) = found_url {
-            let mut state = state_arc.lock();
-            state.url = Some(url);
-        }
-    });
-
-    let url = rx
-        .recv_timeout(Duration::from_secs(15))
-        .map_err(|_| "não foi possível detectar URL do tunnel".to_string())?;
+    };
 
     {
         let mut state = manager.inner.lock();
+        cleanup_finished(&mut state);
         state.child = Some(child);
         state.url = Some(url.clone());
+        state.log_handles.extend(log_handles);
+    }
+
+    let exit_monitor = spawn_exit_monitor(app.clone(), manager.clone());
+    {
+        let mut state = manager.inner.lock();
+        state.exit_monitor = Some(exit_monitor);
     }
 
+    emit_status(&app, true, Some(url.clone()));
     Ok(TunnelInfo { public_url: url })
 }
 
 #[tauri::command]
-pub fn stop_tunnel(manager: tauri::State<'_, TunnelManager>) -> Result<(), String> {
-    let mut state = manager.inner.lock();
-    if let Some(mut child) = state.child.take() {
-        child.kill().ok();
-        child.wait().ok();
+pub async fn stop_tunnel(
+    app: tauri::AppHandle,
+    manager: tauri::State<'_, TunnelManager>,
+) -> Result<(), String> {
+    let (
+        exit_status,
+        mut log_handles,
+        server_shutdown,
+        server_handle,
+        monitor_handle,
+    ) = {
+        let mut state = manager.inner.lock();
+        cleanup_finished(&mut state);
+        let status = if let Some(child) = state.child.as_mut() {
+            if let Err(error) = child.kill() {
+                tracing::warn!(?error, "cloudflare_tunnel_kill_failed");
+            }
+            match child.wait() {
+                Ok(status) => Some(status),
+                Err(error) => {
+                    tracing::error!(?error, "cloudflare_tunnel_wait_failure");
+                    None
+                }
+            }
+        } else {
+            None
+        };
+        state.child = None;
+        state.url = None;
+        state.server_port = None;
+        (
+            status,
+            state.log_handles.drain(..).collect::<Vec<_>>(),
+            state.server_shutdown.take(),
+            state.server_handle.take(),
+            state.exit_monitor.take(),
+        )
+    };
+
+    if let Some(handle) = monitor_handle {
+        let _ = handle.await;
     }
-    state.url = None;
-    Ok(())
-}
 
-fn extract_url(line: &str) -> Option<String> {
-    line.split_whitespace()
-        .find(|segment| segment.contains("trycloudflare.com"))
-        .map(|s| s.trim_matches(|c: char| c == '"'))
-        .map(|s| s.to_string())
+    for handle in log_handles.drain(..) {
+        let _ = handle.join();
+    }
+
+    if let Some(tx) = server_shutdown {
+        let _ = tx.send(());
+    }
+
+    if let Some(handle) = server_handle {
+        let _ = handle.await;
+    }
+
+    let exit_code = exit_status.as_ref().and_then(|status| status.code());
+    let code = emit_tunnel_stopped(&app, exit_code);
+    emit_status(&app, false, None);
+    emit_log(&app, &format!("Tunnel parado (código {code})."));
+    Ok(())
 }
 
-fn read_for_url<R: BufRead>(reader: R) -> Option<String> {
-    for line in reader.lines().flatten() {
-        if let Some(url) = extract_url(&line) {
-            return Some(url);
-        }
+#[tauri::command]
+pub async fn tunnel_status(
+    manager: tauri::State<'_, TunnelManager>,
+) -> Result<TunnelStatus, String> {
+    let mut state = manager.inner.lock();
+    cleanup_finished(&mut state);
+    let running = if let Some(child) = state.child.as_mut() {
+        child.try_wait().map_err(|e| e.to_string())?.is_none()
+    } else {
+        false
+    };
+    if !running {
+        state.child = None;
+        state.url = None;
     }
-    None
+    Ok(TunnelStatus {
+        running,
+        url: state.url.clone(),
+    })
 }
diff --git a/apps/client/src-tauri/src/main.rs b/apps/client/src-tauri/src/main.rs
index 9ca3185bf2767dc6b2aedfd3dcc4e868a2d8f5a1..205d7e9015a39922ae122089660b764d7fbcaac1 100644
--- a/apps/client/src-tauri/src/main.rs
+++ b/apps/client/src-tauri/src/main.rs
@@ -1,98 +1,99 @@
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
     files::{list_files, read_file_range, write_file_range},
     quic::{quic_start, QuicManager},
     settings::{get_settings, set_settings, SettingsManager},
     transfer::{get_status, send_files, TransferManager},
-    tunnel::{start_tunnel, stop_tunnel, TunnelManager},
+    tunnel::{start_tunnel, stop_tunnel, tunnel_status, TunnelManager},
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
 
         // usa arquivo de log
         base.with_writer(non_blocking).init();
     } else {
         // fallback: stdout
         base.init();
     }
 }
 
 #[tauri::command]
 fn open_logs_folder(app: tauri::AppHandle) -> Result<(), String> {
     let path = dirs::home_dir()
         .ok_or_else(|| "home dir not found".to_string())?
         .join(".fluxshare")
         .join("logs");
     tauri::api::shell::open(&app.shell_scope(), path.to_string_lossy(), None)
         .map_err(|e| e.to_string())
 }
 
 fn main() {
     init_tracing();
     let transfer_manager = TransferManager::default();
     let settings_manager = SettingsManager::default();
-    let tunnel_manager = TunnelManager::default();
+    let tunnel_manager = TunnelManager::default(); // LLM-LOCK: central manager for Cloudflare tunnel lifecycle and stop events
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
             read_file_range,
             write_file_range,
             start_signaling,
             webrtc_start,
             quic_start,
             send_files,
             get_status,
             start_tunnel,
             stop_tunnel,
+            tunnel_status,
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
diff --git a/apps/client/src-tauri/tauri.conf.json b/apps/client/src-tauri/tauri.conf.json
index 8d316263c9ad51d221456d9456549823c04db474..e1cc190b0dd644cb75d3b0903b7f2130cf139ff3 100644
--- a/apps/client/src-tauri/tauri.conf.json
+++ b/apps/client/src-tauri/tauri.conf.json
@@ -1,26 +1,26 @@
 {
   "$schema": "https://schema.tauri.app/config/2",
   "package": {
     "productName": "FluxShare",
     "version": "0.1.0"
   },
   "tauri": {
     "windows": [
       {
         "title": "FluxShare",
         "fullscreen": false,
         "width": 1280,
         "height": 720
       }
     ],
     "allowlist": {
       "all": true
     }
   },
   "build": {
-    "beforeDevCommand": "pnpm dev",
-    "beforeBuildCommand": "pnpm build",
+    "beforeDevCommand": "pnpm -C .. web:dev",
+    "beforeBuildCommand": "pnpm -C .. web:build",
     "devPath": "http://localhost:5173",
     "distDir": "../dist"
   }
 }
diff --git a/apps/client/src/components/AppShell.tsx b/apps/client/src/components/AppShell.tsx
index 2505325c0b4089e779a4aaa67765e2379273924a..087b5ee068157ddac372ddad5ceeb9dd02c64beb 100644
--- a/apps/client/src/components/AppShell.tsx
+++ b/apps/client/src/components/AppShell.tsx
@@ -1,125 +1,152 @@
 import { useCallback, useMemo, type ReactNode, useState } from "react";
 import { useTheme } from "./ThemeProvider";
+import { Link, useLocation } from "react-router-dom";
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
+  const location = useLocation();
+
+  const links = useMemo(() => {
+    const roomPath = roomId ? `/room/${roomId}` : "/room";
+    return [
+      { to: "/", label: "Início" },
+      { to: roomPath, label: "Sala" },
+      { to: "/tunnel", label: "Tunnel" },
+      { to: "/admin", label: "Admin" },
+    ];
+  }, [roomId]);
 
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
-      <div className="app-shell__background">
-        <div className="app-shell__gradient" />
-        <div className="app-shell__mesh" />
-        <div className="app-shell__grid" />
-      </div>
-      <header className="sticky top-0 z-40 border-b border-[var(--border)]/60 bg-[var(--card)]/80 backdrop-blur-2xl">
+      <div className="app-shell__background" />
+      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 90%,var(--bg) 10%)] backdrop-blur">
         <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
           <div className="flex flex-wrap items-center gap-3">
             <span className="text-xl font-semibold tracking-tight text-[var(--text)]">
               FluxShare
             </span>
             <span className="text-sm text-[var(--muted)]">
               Compartilhamento P2P em tempo real
             </span>
           </div>
+          <nav className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
+            {links.map((link) => {
+              const isActive = location.pathname === link.to || (link.to.startsWith("/room/") && location.pathname.startsWith("/room"));
+              return (
+                <Link
+                  key={link.to}
+                  to={link.to}
+                  className={cn(
+                    "rounded-lg px-3 py-2 transition",
+                    isActive
+                      ? "bg-[var(--surface-2)] text-[var(--text)]"
+                      : "hover:bg-[color-mix(in srgb,var(--surface) 80%,transparent)]",
+                  )}
+                >
+                  {link.label}
+                </Link>
+              );
+            })}
+          </nav>
           <div className="flex flex-wrap items-center gap-3">
             <Card
               noShadow
-              className="flex items-center gap-3 rounded-2xl border border-[var(--border)]/70 bg-[var(--card)]/90 px-4 py-2"
+              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2"
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
-              className="h-10 w-10 rounded-full border border-[var(--border)]/70 bg-[var(--card)]/80 p-0"
+              className="h-10 w-10 rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-0"
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
-      <main className={cn("mx-auto w-full max-w-6xl px-6 pb-16 pt-10", "text-[var(--text)]")}>{children}</main>
+      <main className={cn("mx-auto w-full max-w-6xl px-6 pb-16 pt-10", "text-[var(--text)] bg-[var(--bg)]")}>{children}</main>
     </div>
   );
 }
 
 export default AppShell;
diff --git a/apps/client/src/components/PeersPanel.tsx b/apps/client/src/components/PeersPanel.tsx
index 7aaefa44772a641d10a4906311867d0d4aa4d7ed..047c7f88f22cfb5d8630a98d200afe96c0b2a1e1 100644
--- a/apps/client/src/components/PeersPanel.tsx
+++ b/apps/client/src/components/PeersPanel.tsx
@@ -1,28 +1,29 @@
 import { Badge, type BadgeProps } from "./ui/Badge";
 import { Button } from "./ui/Button";
 import { Card } from "./ui/Card";
+import { cn } from "../utils/cn";
 
 export interface PeerTransferInfo {
   status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
   direction: "send" | "receive";
   bytesTransferred: number;
   totalBytes: number;
   updatedAt: number;
 }
 
 export interface PeerViewModel {
   peerId: string;
   displayName: string;
   connectionState: string;
   badgeVariant: BadgeProps["variant"];
   transfer?: PeerTransferInfo;
 }
 
 interface PeersPanelProps {
   selfPeerId: string | null;
   peers: PeerViewModel[];
   selectedPeerId: string | null;
   onSelect(peerId: string): void;
   onConnect(peerId: string): void;
   onDisconnect(peerId: string): void;
   onSend(peerId: string): void;
@@ -30,97 +31,97 @@ interface PeersPanelProps {
 }
 
 function formatProgress(info: PeerTransferInfo | undefined) {
   if (!info || info.totalBytes === 0) return null;
   const value = Math.min(100, (info.bytesTransferred / info.totalBytes) * 100);
   return value;
 }
 
 export function PeersPanel({
   selfPeerId,
   peers,
   selectedPeerId,
   onSelect,
   onConnect,
   onDisconnect,
   onSend,
   onCancel,
 }: PeersPanelProps) {
   return (
     <Card className="space-y-6 p-6">
       <div className="flex flex-col gap-1">
         <h2 className="text-xl font-semibold text-[var(--text)]">Peers na sala</h2>
         <p className="text-sm text-[var(--muted)]">Você é {selfPeerId || "--"}</p>
       </div>
       {peers.length === 0 ? (
-        <p className="rounded-2xl border border-dashed border-[var(--dashed)]/80 bg-[var(--card)]/40 px-4 py-6 text-center text-sm text-[var(--muted)]">
+        <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 75%,transparent)] px-4 py-6 text-center text-sm text-[var(--muted)]">
           Aguarde: nenhum peer apareceu na sala ainda.
         </p>
       ) : (
         <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
           {peers.map((peer) => {
             const progress = formatProgress(peer.transfer);
             const isSelected = selectedPeerId === peer.peerId;
             return (
               <div
                 key={peer.peerId}
                 role="button"
                 tabIndex={0}
                 aria-pressed={isSelected}
                 onClick={() => onSelect(peer.peerId)}
                 onKeyDown={(event) => {
                   if (event.key === "Enter" || event.key === " ") {
                     event.preventDefault();
                     onSelect(peer.peerId);
                   }
                 }}
-                className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
+                className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
               >
                 <div
-                  className={[
-                    "card-shadow flex h-full flex-col gap-4 rounded-2xl border bg-[var(--card)]/80 p-5 backdrop-blur-2xl transition duration-200",
+                  className={cn(
+                    "card-shadow flex h-full flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 backdrop-blur-2xl transition duration-200",
                     isSelected
-                      ? "border-[var(--primary)]/70 shadow-[0_28px_55px_-30px_rgba(124,58,237,0.55)]"
-                      : "border-[var(--border)]/80 hover:shadow-[0_28px_55px_-30px_rgba(15,23,42,0.6)]",
-                  ].join(" ")}
+                      ? "border-[color-mix(in srgb,var(--primary) 65%,var(--border) 35%)] shadow-[0_28px_55px_-30px_var(--ring)]"
+                      : "hover:border-[color-mix(in srgb,var(--primary) 35%,var(--border) 65%)]",
+                  )}
                 >
                   <div className="flex items-center justify-between gap-3">
                     <div>
                       <p className="text-base font-semibold text-[var(--text)]">{peer.displayName}</p>
                       <p className="text-xs font-mono text-[var(--muted)]">{peer.peerId}</p>
                     </div>
                     <Badge variant={peer.badgeVariant}>{peer.connectionState}</Badge>
                   </div>
                   {peer.transfer ? (
                     <div className="space-y-3">
                       <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                         <span>{peer.transfer.direction === "send" ? "Enviando" : "Recebendo"}</span>
                         <span className="font-medium text-[var(--text)]">
                           {progress !== null ? `${progress.toFixed(1)}%` : "--"}
                         </span>
                       </div>
-                      <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--border)]/60 bg-[var(--card)]/50">
+                      <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
                         <div
                           className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                           style={{ width: progress !== null ? `${progress}%` : "0%" }}
                         />
                       </div>
                     </div>
                   ) : (
                     <p className="text-xs text-[var(--muted)]">Nenhuma transferência em andamento.</p>
                   )}
                   <div className="flex flex-wrap gap-2">
                     <Button
                       type="button"
                       variant="secondary"
                       onClick={(event) => {
                         event.stopPropagation();
                         onConnect(peer.peerId);
                       }}
                     >
                       Conectar
                     </Button>
                     <Button
                       type="button"
                       variant="outline"
                       onClick={(event) => {
                         event.stopPropagation();
diff --git a/apps/client/src/components/ThemeProvider.tsx b/apps/client/src/components/ThemeProvider.tsx
index a27dc7e8615f8cd8d8afe74797b98808e42472d9..5d9efc29adb2354cccf03d7f98bb050e91cc661d 100644
--- a/apps/client/src/components/ThemeProvider.tsx
+++ b/apps/client/src/components/ThemeProvider.tsx
@@ -1,46 +1,47 @@
 import {
   createContext,
   useCallback,
   useContext,
   useEffect,
   useMemo,
   useRef,
   type ReactNode,
 } from "react";
 import { useRoom } from "../state/useRoomStore";
 
 interface ThemeContextValue {
   theme: "light" | "dark";
   toggleTheme: () => void;
 }
 
 const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
 
 function applyTheme(theme: "light" | "dark") {
   if (typeof document === "undefined") return;
-  document.documentElement.classList.toggle("theme-light", theme === "light");
+  document.documentElement.classList.toggle("dark", theme === "dark");
+  document.documentElement.dataset.theme = theme;
 }
 
 export function ThemeProvider({ children }: { children: ReactNode }) {
   const { theme, setTheme } = useRoom();
   const manualOverrideRef = useRef(false);
 
   useEffect(() => {
     applyTheme(theme);
   }, [theme]);
 
   useEffect(() => {
     const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
       ? window.matchMedia("(prefers-color-scheme: dark)")
       : null;
     if (!media) return;
     const listener = (event: MediaQueryListEvent) => {
       if (manualOverrideRef.current) return;
       setTheme(event.matches ? "dark" : "light");
     };
     media.addEventListener("change", listener);
     return () => media.removeEventListener("change", listener);
   }, [setTheme]);
 
   const toggleTheme = useCallback(() => {
     manualOverrideRef.current = true;
diff --git a/apps/client/src/components/ToastViewport.tsx b/apps/client/src/components/ToastViewport.tsx
index 3021944574fbcef612658037ceed44c96c43791d..3fdf76dba97383d0a5bd0c8cc65f61d6b8659586 100644
--- a/apps/client/src/components/ToastViewport.tsx
+++ b/apps/client/src/components/ToastViewport.tsx
@@ -14,53 +14,53 @@ function CloseIcon() {
       aria-hidden="true"
     >
       <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 4.5 7 7m0-7-7 7" />
     </svg>
   );
 }
 
 export function ToastViewport() {
   const toasts = useToastStore((state) => state.toasts);
   const dismiss = useToastStore((state) => state.dismiss);
   const [mounted, setMounted] = useState(false);
 
   useEffect(() => {
     setMounted(true);
     return () => setMounted(false);
   }, []);
 
   if (!mounted) return null;
 
   return createPortal(
     <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-3 sm:bottom-6 sm:right-6">
       {toasts.map((toast) => (
         <div
           key={toast.id}
           className={cn(
-            "pointer-events-auto rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/95 px-4 py-3 text-sm text-[var(--text)] shadow-lg backdrop-blur",
-            toast.variant === "info" && "border-[var(--accent-2)]/60",
-            toast.variant === "success" && "border-green-500/60",
-            toast.variant === "warning" && "border-amber-500/60",
-            toast.variant === "error" && "border-red-500/60",
+            "pointer-events-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text)] shadow-lg backdrop-blur",
+            toast.variant === "info" && "border-[color-mix(in srgb,var(--primary) 60%,var(--border) 40%)]",
+            toast.variant === "success" && "border-[color-mix(in srgb,var(--primary) 45%,var(--text) 55%)]",
+            toast.variant === "warning" && "border-[color-mix(in srgb,var(--primary) 35%,var(--muted) 65%)]",
+            toast.variant === "error" && "border-[color-mix(in srgb,var(--primary) 50%,var(--surface-2) 50%)]",
           )}
         >
           <div className="flex items-start gap-3">
             <div className="flex-1">
               <p className="leading-snug text-[var(--text)]">{toast.message}</p>
             </div>
             <button
               type="button"
               onClick={() => dismiss(toast.id)}
-              className="rounded-full p-1 text-[var(--text-muted)] transition hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
+              className="rounded-full p-1 text-[var(--muted)] transition hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
               aria-label="Fechar notificação"
             >
               <CloseIcon />
             </button>
           </div>
         </div>
       ))}
     </div>,
     document.body,
   );
 }
 
 export default ToastViewport;
diff --git a/apps/client/src/components/TransferBox.tsx b/apps/client/src/components/TransferBox.tsx
index ceca9e3f39f4c3f192d9089053eeb84115a3da18..9a290f2cdf41846d1dd07ac54e81486d7a8d87b0 100644
--- a/apps/client/src/components/TransferBox.tsx
+++ b/apps/client/src/components/TransferBox.tsx
@@ -118,60 +118,60 @@ export function TransferBox({ file, transfer, onPickFile, onCancel, activeTransf
             <h2 className="text-xl font-semibold text-[var(--text)]">Transferência</h2>
             {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
           </div>
           <p className="text-sm text-[var(--muted)]">{statusLabel}</p>
         </div>
         <Button type="button" onClick={() => onPickFile()}>
           Selecionar arquivo
         </Button>
       </div>
       <div className="space-y-4">
         {file ? (
           <>
             <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
               <div className="space-y-1">
                 <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Nome</span>
                 <p className="text-sm text-[var(--text)]">{file.name}</p>
               </div>
               <div className="space-y-1">
                 <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Tamanho</span>
                 <p className="text-sm text-[var(--text)]">{formatBytes(file.size)}</p>
               </div>
               {renderTargetLabel(file.targetLabel)}
             </div>
             {transfer ? (
               <div className="space-y-2">
-                <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--border)]/60 bg-[var(--card)]/50">
+                <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
                   <div
                     className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                     style={{ width: `${progress}%` }}
                   />
                 </div>
                 <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--muted)]">
                   <span>Progresso: {progress.toFixed(1)}%</span>
                   <span>Velocidade: {speedBytes > 0 ? formatBytes(speedBytes) + "/s" : "--"}</span>
                   <span>ETA: {eta}</span>
                 </div>
               </div>
             ) : null}
             {transfer && transfer.status === "transferring" ? (
               <div className="flex flex-wrap gap-2">
                 <Button type="button" variant="danger" onClick={() => onCancel(transfer.peerId, transfer.id)}>
                   Cancelar transferência
                 </Button>
               </div>
             ) : null}
           </>
         ) : (
-          <div className="rounded-2xl border border-dashed border-[var(--dashed)]/80 bg-[var(--card)]/40 px-6 py-10 text-center text-sm text-[var(--muted)]">
+          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 75%,transparent)] px-6 py-10 text-center text-sm text-[var(--muted)]">
             Selecione um arquivo para iniciar uma nova transferência.
           </div>
         )}
       </div>
       {activeTransferId ? (
         <p className="text-xs text-[var(--muted)]">Transferência em foco: {activeTransferId}</p>
       ) : null}
     </Card>
   );
 }
 
 export default TransferBox;
diff --git a/apps/client/src/components/ui/Badge.tsx b/apps/client/src/components/ui/Badge.tsx
index 8b3d8ae77be4324456a041a146a3974a3e6589e0..e1d43d51f2b6c59df7667d832753ff9c8872a72e 100644
--- a/apps/client/src/components/ui/Badge.tsx
+++ b/apps/client/src/components/ui/Badge.tsx
@@ -1,28 +1,28 @@
 import { cn } from "../../utils/cn";
 
 type BadgeVariant = "neutral" | "accent" | "accentSecondary" | "success" | "danger";
 
 export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
   variant?: BadgeVariant;
 }
 
 const variantClasses: Record<BadgeVariant, string> = {
-  neutral: "bg-white/10 text-[var(--muted)]",
-  accent: "bg-[var(--primary)]/25 text-[var(--primary)]",
-  accentSecondary: "bg-[var(--accent)]/25 text-[var(--accent)]",
-  success: "bg-emerald-500/20 text-emerald-300",
-  danger: "bg-red-500/20 text-red-300",
+  neutral: "bg-[color-mix(in srgb,var(--surface) 65%,transparent)] text-[var(--muted)]",
+  accent: "bg-[color-mix(in srgb,var(--primary) 25%,transparent)] text-[var(--primary)]",
+  accentSecondary: "bg-[color-mix(in srgb,var(--primary) 18%,var(--surface) 82%)] text-[var(--text)]",
+  success: "bg-[color-mix(in srgb,var(--primary) 35%,var(--text) 65%)] text-[var(--primary-foreground)]",
+  danger: "bg-[color-mix(in srgb,var(--primary) 45%,var(--surface-2) 55%)] text-[var(--primary-foreground)]",
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
index 913891519081a16665465b2a25683ce6cffc520a..7e69f911b19efd2815e1ec2ee7fed838c98703ca 100644
--- a/apps/client/src/components/ui/Button.tsx
+++ b/apps/client/src/components/ui/Button.tsx
@@ -1,48 +1,50 @@
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
-    "bg-[var(--primary)] text-white shadow-[0_20px_45px_-20px_rgba(124,58,237,0.75)] hover:brightness-110",
+    "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_20px_45px_-20px_var(--ring)] hover:bg-[color-mix(in srgb,var(--primary) 88%,var(--surface) 12%)]",
   secondary:
-    "bg-[var(--card)]/70 text-[var(--text)] border border-[var(--border)]/80 hover:border-[var(--primary)]/70",
-  ghost: "bg-transparent text-[var(--text)] hover:bg-white/10",
+    "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[color-mix(in srgb,var(--surface) 85%,var(--bg) 15%)]",
+  ghost:
+    "bg-transparent text-[var(--text)] hover:bg-[color-mix(in srgb,var(--surface) 55%,transparent)]",
   outline:
-    "border border-[var(--border)]/80 text-[var(--text)] hover:border-[var(--primary)]/70",
-  danger: "bg-red-500/80 text-white hover:bg-red-400/90",
+    "border border-[var(--border)] text-[var(--text)] hover:border-[color-mix(in srgb,var(--primary) 65%,var(--border) 35%)]",
+  danger:
+    "bg-[color-mix(in srgb,var(--primary) 55%,var(--surface-2) 45%)] text-[var(--primary-foreground)] hover:bg-[color-mix(in srgb,var(--primary) 62%,var(--surface-2) 38%)]",
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
-          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2",
+          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
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
index 22b7d3ed6df4a23dd421040037d5955599eff054..84dd8bd6aff85266a3c3054129dc55ab96585d93 100644
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
-        "rounded-3xl border border-[var(--border)]/80 bg-[var(--card)]/85 backdrop-blur-2xl",
+        "rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] backdrop-blur-2xl",
         "transition-shadow duration-200",
         noShadow ? undefined : "card-shadow",
         className,
       )}
       {...props}
     />
   );
 }
diff --git a/apps/client/src/index.tsx b/apps/client/src/index.tsx
index 706c7d1d4dd9e8330fc7f24c2d5b7720607fa158..0e45d84e76d8100e589ffeb2ca2dbab74d5ee0f1 100644
--- a/apps/client/src/index.tsx
+++ b/apps/client/src/index.tsx
@@ -1,27 +1,29 @@
 import React from "react";
 import ReactDOM from "react-dom/client";
 import { RouterProvider, createBrowserRouter } from "react-router-dom";
 import App from "./App";
 import HomePage from "./pages/Home";
 import RoomPage from "./pages/Room";
 import TunnelPage from "./pages/Tunnel";
+import AdminPage from "./pages/Admin";
 import "./styles/base.css";
 import "./styles/theme.css";
 
 const router = createBrowserRouter([
   {
     path: "/",
     element: <App />,
     children: [
       { index: true, element: <HomePage /> },
       { path: "room/:code", element: <RoomPage /> },
       { path: "tunnel", element: <TunnelPage /> },
+      { path: "admin", element: <AdminPage /> },
     ],
   },
 ]);
 
 ReactDOM.createRoot(document.getElementById("root")!).render(
   <React.StrictMode>
     <RouterProvider router={router} />
   </React.StrictMode>
 );
diff --git a/apps/client/src/pages/Admin.tsx b/apps/client/src/pages/Admin.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..8c2aae510442390a1308675a0010503c5c2f50a5
--- /dev/null
+++ b/apps/client/src/pages/Admin.tsx
@@ -0,0 +1,438 @@
+import { useCallback, useMemo, useState } from "react";
+import { nanoid } from "nanoid";
+import { Card } from "../components/ui/Card";
+import { Button } from "../components/ui/Button";
+import { Badge, type BadgeProps } from "../components/ui/Badge";
+import { getEnv } from "../utils/env";
+import { SignalingClient } from "../lib/signaling";
+import PeerManager from "../lib/rtc/PeerManager";
+import TransferService, { type TransferSource } from "../lib/transfer/TransferService";
+import { useTunnelStore } from "../state/useTunnelStore";
+
+interface TestContext {
+  log(message: string): void;
+}
+
+type TestStatus = "idle" | "running" | "success" | "error";
+
+interface TestResult {
+  status: TestStatus;
+  logs: string[];
+  error?: string;
+}
+
+interface AdminTestDefinition {
+  id: string;
+  name: string;
+  run(ctx: TestContext): Promise<void>;
+}
+
+const STATUS_BADGE: Record<TestStatus, BadgeProps["variant"]> = {
+  idle: "neutral",
+  running: "accent",
+  success: "success",
+  error: "danger",
+};
+
+const STATUS_LABEL: Record<TestStatus, string> = {
+  idle: "Aguardando",
+  running: "Executando",
+  success: "Sucesso",
+  error: "Falhou",
+};
+
+function formatLogEntry(message: string) {
+  const time = new Date().toLocaleTimeString();
+  return `[${time}] ${message}`;
+}
+
+class LocalSignaling {
+  readonly peerId: string;
+  private listeners = new Set<(payload: { from: string; to: string; data: unknown }) => void>();
+  private partner: LocalSignaling | null = null;
+
+  constructor(peerId: string) {
+    this.peerId = peerId;
+  }
+
+  connect(partner: LocalSignaling) {
+    this.partner = partner;
+  }
+
+  on(event: "signal", handler: (payload: { from: string; to: string; data: unknown }) => void) {
+    if (event !== "signal") {
+      return () => undefined;
+    }
+    this.listeners.add(handler);
+    return () => {
+      this.listeners.delete(handler);
+    };
+  }
+
+  sendSignal(target: string, data: unknown) {
+    if (!this.partner || target !== this.partner.peerId) return;
+    this.partner.dispatchSignal(this.peerId, target, data);
+  }
+
+  private dispatchSignal(from: string, to: string, data: unknown) {
+    this.listeners.forEach((listener) => {
+      listener({ from, to, data });
+    });
+  }
+}
+
+async function waitForChannelReady(channel: RTCDataChannel, label: string, ctx: TestContext) {
+  if (channel.readyState === "open") {
+    ctx.log(`Canal ${label} aberto`);
+    return;
+  }
+  await new Promise<void>((resolve, reject) => {
+    const timer = window.setTimeout(() => {
+      reject(new Error(`Timeout aguardando canal ${label}`));
+    }, 8000);
+    const handleOpen = () => {
+      window.clearTimeout(timer);
+      ctx.log(`Canal ${label} aberto`);
+      channel.removeEventListener("open", handleOpen);
+      channel.removeEventListener("error", handleError);
+      resolve();
+    };
+    const handleError = (event: Event) => {
+      window.clearTimeout(timer);
+      channel.removeEventListener("open", handleOpen);
+      channel.removeEventListener("error", handleError);
+      reject(new Error(`Erro no canal ${label}: ${String(event)}`));
+    };
+    channel.addEventListener("open", handleOpen);
+    channel.addEventListener("error", handleError);
+  });
+}
+
+async function createPeerPair(ctx: TestContext) {
+  const signalingA = new LocalSignaling("admin-peer-a");
+  const signalingB = new LocalSignaling("admin-peer-b");
+  signalingA.connect(signalingB);
+  signalingB.connect(signalingA);
+
+  const managerA = new PeerManager(signalingA as unknown as SignalingClient);
+  const managerB = new PeerManager(signalingB as unknown as SignalingClient);
+
+  const remoteChannelPromise = new Promise<RTCDataChannel>((resolve) => {
+    managerB.on("data-channel", ({ channel }) => {
+      ctx.log("Canal recebido pelo peer remoto");
+      channel.binaryType = "arraybuffer";
+      channel.addEventListener("message", (event) => {
+        channel.send(event.data);
+      });
+      resolve(channel);
+    });
+  });
+
+  const localChannel = await managerA.connectTo("admin-peer-b");
+  const remoteChannel = await remoteChannelPromise;
+
+  await waitForChannelReady(localChannel, "local", ctx);
+  await waitForChannelReady(remoteChannel, "remoto", ctx);
+
+  return { managerA, managerB, localChannel, remoteChannel };
+}
+
+function compareArrays(expected: Uint8Array, received: Uint8Array) {
+  if (expected.byteLength !== received.byteLength) {
+    return false;
+  }
+  for (let index = 0; index < expected.byteLength; index += 1) {
+    if (expected[index] !== received[index]) {
+      return false;
+    }
+  }
+  return true;
+}
+
+async function runThemeTest(ctx: TestContext) {
+  ctx.log("Validando variáveis de tema escuro...");
+  const root = document.documentElement;
+  const styles = getComputedStyle(root);
+  const tokens: Record<string, string> = {
+    "--bg": "#0e0a1f",
+    "--surface": "#151233",
+    "--surface-2": "#1c1842",
+    "--border": "#2b265a",
+    "--primary": "#8b5cf6",
+    "--primary-foreground": "#0b0a16",
+    "--ring": "rgba(139, 92, 246, 0.35)",
+    "--text": "#e8e8f0",
+    "--muted": "#a3a3b2",
+  };
+  Object.entries(tokens).forEach(([token, expected]) => {
+    const value = styles.getPropertyValue(token).trim().toLowerCase();
+    ctx.log(`${token}: ${value}`);
+    if (!value) {
+      throw new Error(`Token ${token} não definido`);
+    }
+    if (value !== expected) {
+      throw new Error(`Token ${token} esperado ${expected} mas encontrado ${value}`);
+    }
+  });
+  ctx.log("Tema escuro validado com sucesso.");
+}
+
+async function runSignalingTest(ctx: TestContext) {
+  const { signalingUrl } = getEnv();
+  ctx.log(`Conectando ao servidor de sinalização: ${signalingUrl}`);
+  const roomId = `ADMIN-${nanoid(6)}`;
+  const client = new SignalingClient({ room: roomId, displayName: "AdminTest" });
+  await new Promise<void>((resolve, reject) => {
+    const timeout = window.setTimeout(() => {
+      cleanup();
+      reject(new Error("Timeout aguardando conexão de sinalização"));
+    }, 10000);
+
+    const cleanup = () => {
+      window.clearTimeout(timeout);
+      unsubscribeOpen();
+      unsubscribePeers();
+      unsubscribeError();
+      client.disconnect();
+    };
+
+    const unsubscribeOpen = client.on("open", () => {
+      ctx.log("WebSocket conectado");
+    });
+
+    const unsubscribePeers = client.on("peers", (peers) => {
+      ctx.log(`Sala ${roomId} ativa (${peers.length} peers)`);
+      cleanup();
+      resolve();
+    });
+
+    const unsubscribeError = client.on("error", ({ error }) => {
+      cleanup();
+      reject(error);
+    });
+
+    client.connect();
+  });
+  ctx.log("Signaling OK.");
+}
+
+async function runWebRtcTest(ctx: TestContext) {
+  const { managerA, managerB, localChannel, remoteChannel } = await createPeerPair(ctx);
+  try {
+    const payload = crypto.getRandomValues(new Uint8Array(5 * 1024));
+    ctx.log("Enviando carga de 5 KiB e aguardando eco...");
+    const echoed = await new Promise<Uint8Array>((resolve, reject) => {
+      const timer = window.setTimeout(() => {
+        reject(new Error("Timeout aguardando eco do canal"));
+      }, 10000);
+      function handleMessage(event: MessageEvent<unknown>) {
+        window.clearTimeout(timer);
+        localChannel.removeEventListener("message", handleMessage);
+        resolve(new Uint8Array(event.data as ArrayBuffer));
+      }
+      localChannel.addEventListener("message", handleMessage);
+      localChannel.send(payload);
+    });
+    if (!compareArrays(payload, echoed)) {
+      throw new Error("Dados recebidos não correspondem ao payload enviado");
+    }
+    ctx.log("Echo validado com sucesso.");
+  } finally {
+    localChannel.close();
+    remoteChannel.close();
+    managerA.dispose();
+    managerB.dispose();
+  }
+}
+
+async function runTransferTest(ctx: TestContext) {
+  const { managerA, managerB, localChannel, remoteChannel } = await createPeerPair(ctx);
+  const transferA = new TransferService();
+  const transferB = new TransferService();
+  try {
+    transferA.registerPeer("admin-peer-b", localChannel);
+    transferB.registerPeer("admin-peer-a", remoteChannel);
+    const data = crypto.getRandomValues(new Uint8Array(5 * 1024));
+    ctx.log("Iniciando transferência simulada de 5 KiB...");
+    const source: TransferSource = {
+      name: "admin-test.bin",
+      size: data.byteLength,
+      createChunk: async (start, length) => data.slice(start, start + length).buffer,
+    };
+
+    const received = await new Promise<Uint8Array>((resolve, reject) => {
+      const unsubscribeComplete = transferB.on("transfer-completed", async (event) => {
+        if (event.direction === "receive" && event.blob) {
+          const buffer = new Uint8Array(await event.blob.arrayBuffer());
+          unsubscribeComplete();
+          unsubscribeError();
+          resolve(buffer);
+        }
+      });
+      const unsubscribeError = transferB.on("transfer-error", ({ error }) => {
+        unsubscribeComplete();
+        unsubscribeError();
+        reject(error);
+      });
+      void transferA.sendToPeer("admin-peer-b", source, 1024).catch(reject);
+    });
+
+    if (!compareArrays(data, received)) {
+      throw new Error("Integridade do arquivo transferido não confere");
+    }
+    ctx.log("Transferência concluída com sucesso.");
+  } finally {
+    transferA.dispose();
+    transferB.dispose();
+    localChannel.close();
+    remoteChannel.close();
+    managerA.dispose();
+    managerB.dispose();
+  }
+}
+
+async function runTunnelTest(ctx: TestContext) {
+  const store = useTunnelStore.getState();
+  ctx.log("Garantindo que nenhum túnel esteja ativo...");
+  try {
+    await store.stop();
+  } catch (error) {
+    ctx.log(`Aviso ao parar túnel existente: ${String(error)}`);
+  }
+  ctx.log("Iniciando tunnel via Cloudflare...");
+  await store.start();
+  const current = useTunnelStore.getState();
+  if (!current.url) {
+    throw new Error("Nenhuma URL pública retornada pelo túnel");
+  }
+  ctx.log(`URL retornada: ${current.url}`);
+  const controller = new AbortController();
+  const timeout = window.setTimeout(() => controller.abort(), 20000);
+  try {
+    const response = await fetch(current.url, { signal: controller.signal });
+    ctx.log(`Resposta HTTP: ${response.status}`);
+    if (response.status < 200 || response.status >= 400) {
+      throw new Error(`Status inesperado: ${response.status}`);
+    }
+  } finally {
+    window.clearTimeout(timeout);
+    await store.stop().catch((error) => {
+      ctx.log(`Aviso ao finalizar túnel: ${String(error)}`);
+    });
+  }
+  ctx.log("Tunnel verificado com sucesso.");
+}
+
+const TEST_DEFINITIONS: AdminTestDefinition[] = [
+  { id: "theme", name: "Tema", run: runThemeTest },
+  { id: "signaling", name: "Signaling", run: runSignalingTest },
+  { id: "webrtc", name: "WebRTC / DataChannel", run: runWebRtcTest },
+  { id: "transfer", name: "Transferências", run: runTransferTest },
+  { id: "tunnel", name: "Tunnel", run: runTunnelTest },
+];
+
+export default function AdminPage() {
+  const [running, setRunning] = useState(false);
+  const [results, setResults] = useState<Record<string, TestResult>>(() => {
+    const initial: Record<string, TestResult> = {};
+    TEST_DEFINITIONS.forEach((test) => {
+      initial[test.id] = { status: "idle", logs: [] };
+    });
+    return initial;
+  });
+
+  const runTests = useCallback(async () => {
+    if (running) return;
+    setRunning(true);
+    try {
+      for (const test of TEST_DEFINITIONS) {
+        setResults((prev) => ({
+          ...prev,
+          [test.id]: { status: "running", logs: [], error: undefined },
+        }));
+        const append = (message: string) =>
+          setResults((prev) => {
+            const current = prev[test.id];
+            return {
+              ...prev,
+              [test.id]: {
+                ...current,
+                logs: [...current.logs, formatLogEntry(message)],
+              },
+            };
+          });
+        try {
+          await test.run({ log: append });
+          setResults((prev) => ({
+            ...prev,
+            [test.id]: { ...prev[test.id], status: "success" },
+          }));
+        } catch (error) {
+          const message = typeof error === "string" ? error : (error as Error).message;
+          append(`Erro: ${message}`);
+          setResults((prev) => ({
+            ...prev,
+            [test.id]: { ...prev[test.id], status: "error", error: message },
+          }));
+        }
+      }
+    } finally {
+      setRunning(false);
+    }
+  }, [running]);
+
+  const allSuccess = useMemo(() => TEST_DEFINITIONS.every((test) => results[test.id]?.status === "success"), [results]);
+
+  return (
+    <div className="mx-auto max-w-6xl space-y-6 text-[var(--text)]">
+      <div className="flex flex-wrap items-center justify-between gap-4">
+        <div>
+          <h1 className="text-3xl font-semibold">Painel Admin / Testes</h1>
+          <p className="text-sm text-[var(--muted)]">
+            Execute verificações automatizadas de conectividade e integrações principais do FluxShare.
+          </p>
+        </div>
+        <Button onClick={runTests} disabled={running}>
+          {running ? "Executando..." : "Rodar testes"}
+        </Button>
+      </div>
+
+      {allSuccess ? (
+        <Card className="border border-[color-mix(in srgb,var(--primary) 35%,var(--border) 65%)] bg-[color-mix(in srgb,var(--surface) 80%,transparent)] p-4">
+          <p className="text-sm">Todos os testes passaram com sucesso.</p>
+        </Card>
+      ) : null}
+
+      <div className="space-y-4">
+        {TEST_DEFINITIONS.map((test) => {
+          const result = results[test.id];
+          const badgeVariant = STATUS_BADGE[result?.status ?? "idle"];
+          return (
+            <Card key={test.id} className="space-y-4 p-6">
+              <div className="flex flex-wrap items-center justify-between gap-3">
+                <div>
+                  <h2 className="text-xl font-semibold">{test.name}</h2>
+                  <p className="text-sm text-[var(--muted)]">ID: {test.id}</p>
+                </div>
+                <Badge variant={badgeVariant}>{STATUS_LABEL[result?.status ?? "idle"]}</Badge>
+              </div>
+              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-xs">
+                {result?.logs?.length ? (
+                  <ul className="space-y-1">
+                    {result.logs.map((entry, index) => (
+                      <li key={`${entry}-${index}`} className="whitespace-pre-wrap break-words text-[var(--text)]">
+                        {entry}
+                      </li>
+                    ))}
+                  </ul>
+                ) : (
+                  <p className="text-[var(--muted)]">Nenhum log registrado.</p>
+                )}
+              </div>
+            </Card>
+          );
+        })}
+      </div>
+    </div>
+  );
+}
diff --git a/apps/client/src/pages/Home.tsx b/apps/client/src/pages/Home.tsx
index 852a6b1d26725d583dc76d5f34cb2a9b6bc692cb..55221b72956c4a4fe9e80bf3168b67f2c8d438bc 100644
--- a/apps/client/src/pages/Home.tsx
+++ b/apps/client/src/pages/Home.tsx
@@ -11,41 +11,41 @@ export function HomePage() {
 
   function handleSubmit(event: FormEvent) {
     event.preventDefault();
     const trimmed = code.trim();
     const result = trimmed ? joinRoom(trimmed) : createRoom();
     if (result?.roomId) {
       navigate(`/room/${result.roomId}`);
     }
   }
 
   return (
     <div className="mx-auto max-w-xl">
       <Card className="space-y-6 p-6">
         <div className="space-y-2">
           <h1 className="text-3xl font-bold text-[var(--text)]">FluxShare</h1>
           <p className="text-sm text-[var(--muted)]">
             Entre com um código de sala para iniciar uma sessão de compartilhamento P2P.
           </p>
         </div>
         <form onSubmit={handleSubmit} className="space-y-4">
           <div className="space-y-2">
             <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
               Código da sala
             </label>
             <input
-              className="w-full rounded-2xl border border-[var(--border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2"
+              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
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
diff --git a/apps/client/src/pages/Tunnel.tsx b/apps/client/src/pages/Tunnel.tsx
index c7447f18848f0c39f37a98493b79b6e7076cbc96..42fcccfa4c62fe1f7e6769836dfb37a64ee324fc 100644
--- a/apps/client/src/pages/Tunnel.tsx
+++ b/apps/client/src/pages/Tunnel.tsx
@@ -1,157 +1,152 @@
-import { FormEvent, useEffect, useMemo, useState } from "react";
+import { useEffect, useMemo, useRef } from "react";
 import { useOutletContext } from "react-router-dom";
+import { AppOutletContext } from "../App";
 import { Card } from "../components/ui/Card";
 import { Button } from "../components/ui/Button";
-import type { AppOutletContext } from "../App";
+import { useTunnelStore } from "../state/useTunnelStore";
 
-function buildPreviewUrl(port: number) {
-  const normalized = Number.isFinite(port) && port > 0 ? port : 8080;
-  return `https://example-${normalized}.trycloudflare.com`;
-}
+const STATUS_LABEL: Record<"RUNNING" | "STOPPED", string> = {
+  RUNNING: "Ativo",
+  STOPPED: "Parado",
+};
 
 export default function TunnelPage() {
   const { setHeaderInfo } = useOutletContext<AppOutletContext>();
-  const [port, setPort] = useState(8080);
-  const [cloudflaredPath, setCloudflaredPath] = useState("cloudflared");
-  const [publicUrl, setPublicUrl] = useState<string | null>(null);
-  const [loadingAction, setLoadingAction] = useState<"start" | "stop" | null>(null);
-  const [hasStarted, setHasStarted] = useState(false);
+  const logContainerRef = useRef<HTMLDivElement | null>(null);
+  const { status, url, logs, loading, error, missingBinary, start, stop, refresh, clear } = useTunnelStore(
+    (state) => ({
+      status: state.status,
+      url: state.url,
+      logs: state.logs,
+      loading: state.loading,
+      error: state.error,
+      missingBinary: state.missingBinary,
+      start: state.start,
+      stop: state.stop,
+      refresh: state.refresh,
+      clear: state.clear,
+    }),
+  );
 
   useEffect(() => {
     setHeaderInfo({});
-  }, [setHeaderInfo]);
+    void refresh();
+  }, [refresh, setHeaderInfo]);
 
-  const statusLabel = useMemo(() => {
-    if (loadingAction === "start") {
-      return "Iniciando túnel de exemplo...";
-    }
-    if (loadingAction === "stop") {
-      return "Encerrando túnel...";
-    }
-    if (publicUrl) {
-      return "Tunnel ativo (modo demonstração)";
-    }
-    if (hasStarted) {
-      return "Tunnel parado";
+  useEffect(() => {
+    const element = logContainerRef.current;
+    if (element) {
+      element.scrollTop = element.scrollHeight;
     }
-    return "Nenhum tunnel iniciado";
-  }, [hasStarted, loadingAction, publicUrl]);
+  }, [logs]);
 
-  const handleStart = (event: FormEvent<HTMLFormElement>) => {
-    event.preventDefault();
-    setLoadingAction("start");
+  const canCopy = useMemo(() => Boolean(url), [url]);
 
-    window.setTimeout(() => {
-      setPublicUrl(buildPreviewUrl(port));
-      setHasStarted(true);
-      setLoadingAction(null);
-    }, 400);
-  };
-
-  const handleStop = () => {
-    setLoadingAction("stop");
+  async function handleStart() {
+    try {
+      await start();
+    } catch (err) {
+      console.error("fluxshare:tunnel", err);
+    }
+  }
 
-    window.setTimeout(() => {
-      setPublicUrl(null);
-      setLoadingAction(null);
-    }, 300);
-  };
+  async function handleStop() {
+    try {
+      await stop();
+    } catch (err) {
+      console.error("fluxshare:tunnel", err);
+    }
+  }
 
-  const handleCopy = () => {
-    if (publicUrl && typeof navigator !== "undefined" && navigator.clipboard) {
-      navigator.clipboard.writeText(publicUrl).catch(() => undefined);
+  async function handleCopy() {
+    if (!url) return;
+    try {
+      await navigator.clipboard?.writeText?.(url);
+    } catch (err) {
+      console.error("fluxshare:tunnel:copy", err);
     }
-  };
+  }
 
   return (
-    <div className="mx-auto max-w-3xl space-y-8">
-      <div className="space-y-3">
-        <h1 className="text-3xl font-semibold text-[var(--text)]">Cloudflare Tunnel</h1>
-        <p className="text-sm text-[var(--text-muted)]">
-          Esta tela recria o formulário clássico do tunnel como uma prévia visual. A integração com o
-          Cloudflare Tunnel será reativada em uma etapa futura.
+    <div className="mx-auto max-w-5xl space-y-6 text-[var(--text)]">
+      <div className="space-y-2">
+        <h1 className="text-3xl font-semibold">Cloudflare Tunnel</h1>
+        <p className="text-sm text-[var(--muted)]">
+          Exponha sua instância local do FluxShare com um túnel seguro. O processo utiliza o binário oficial do Cloudflare e
+          transmite os logs em tempo real.
         </p>
       </div>
 
-      <Card className="space-y-6 p-6">
-        <form className="space-y-6" onSubmit={handleStart}>
-          <div className="grid gap-4 sm:grid-cols-2">
-            <label className="space-y-2 text-sm text-[var(--text-muted)]">
-              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
-                Porta local
-              </span>
-              <input
-                type="number"
-                min={1}
-                className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
-                value={port}
-                onChange={(event) => setPort(Number(event.target.value))}
-                placeholder="8080"
-              />
-            </label>
-            <label className="space-y-2 text-sm text-[var(--text-muted)]">
-              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
-                Caminho do cloudflared
-              </span>
-              <input
-                className="w-full rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
-                value={cloudflaredPath}
-                onChange={(event) => setCloudflaredPath(event.target.value)}
-                placeholder="Ex: /usr/local/bin/cloudflared"
-              />
-            </label>
-          </div>
+      {missingBinary ? (
+        <Card className="border border-[color-mix(in srgb,var(--primary) 35%,var(--border) 65%)] bg-[color-mix(in srgb,var(--surface) 85%,transparent)] p-4">
+          <p className="text-sm text-[var(--text)]">
+            <strong>cloudflared</strong> não foi encontrado no PATH. Instale o utilitário e tente novamente.
+          </p>
+        </Card>
+      ) : null}
+
+      {error ? (
+        <Card className="border border-[color-mix(in srgb,var(--primary) 45%,var(--border) 55%)] bg-[color-mix(in srgb,var(--surface-2) 80%,transparent)] p-4">
+          <p className="text-sm text-[var(--text)]">{error}</p>
+        </Card>
+      ) : null}
 
-          <div className="flex flex-wrap gap-3">
-            <Button type="submit" disabled={loadingAction !== null}>
-              {loadingAction === "start" ? "Iniciando..." : "Iniciar Tunnel"}
+      <Card className="space-y-4 p-6">
+        <div className="flex flex-wrap items-start justify-between gap-4">
+          <div>
+            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Status</p>
+            <p className="text-lg font-medium text-[var(--text)]">{STATUS_LABEL[status]}</p>
+          </div>
+          <div className="flex flex-wrap gap-2">
+            <Button onClick={handleStart} disabled={loading || status === "RUNNING"}>
+              {loading && status !== "RUNNING" ? "Iniciando..." : "Iniciar Tunnel"}
+            </Button>
+            <Button variant="secondary" onClick={handleStop} disabled={loading || status === "STOPPED"}>
+              {loading && status === "RUNNING" ? "Parando..." : "Parar Tunnel"}
             </Button>
-            <Button
-              type="button"
-              variant="secondary"
-              disabled={loadingAction !== null || !publicUrl}
-              onClick={handleStop}
-            >
-              {loadingAction === "stop" ? "Parando..." : "Parar Tunnel"}
+            <Button variant="ghost" onClick={handleCopy} disabled={!canCopy}>
+              Copiar URL
             </Button>
           </div>
-        </form>
+        </div>
 
-        <div className="space-y-4">
-          <div>
-            <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
-              Status
-            </span>
-            <div className="mt-2 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)]">
-              {statusLabel}
+        <div className="space-y-2">
+          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">URL pública</p>
+          <div className="flex flex-wrap items-center gap-3">
+            <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm">
+              {url ?? "--"}
             </div>
+            <Button variant="outline" onClick={clear} disabled={logs.length === 0}>
+              Limpar logs
+            </Button>
           </div>
+        </div>
+      </Card>
 
-          {publicUrl ? (
-            <div className="space-y-2">
-              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
-                URL pública (demonstração)
-              </span>
-              <div className="flex flex-wrap items-center gap-3">
-                <div className="flex-1 rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/60 px-4 py-2 font-mono text-sm text-[var(--text)] break-all">
-                  {publicUrl}
-                </div>
-                <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
-                  Copiar link
-                </Button>
-              </div>
-            </div>
+      <Card className="space-y-3 p-6">
+        <div className="flex items-center justify-between">
+          <h2 className="text-lg font-semibold">Logs em tempo real</h2>
+          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
+            Atualizar status
+          </Button>
+        </div>
+        <div
+          ref={logContainerRef}
+          className="max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 font-mono text-xs"
+        >
+          {logs.length === 0 ? (
+            <p className="text-[var(--muted)]">Nenhum log registrado ainda.</p>
           ) : (
-            <div className="rounded-2xl border border-dashed border-[var(--card-border)]/50 bg-[var(--card)]/40 px-4 py-3 text-sm text-[var(--text-muted)]">
-              Inicie o tunnel para gerar um link de visualização.
-            </div>
+            <ul className="space-y-1">
+              {logs.map((line, index) => (
+                <li key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-[var(--text)]">
+                  {line}
+                </li>
+              ))}
+            </ul>
           )}
         </div>
-
-        <p className="text-xs text-[var(--text-muted)]">
-          Este modo é apenas uma representação visual. Nenhum comando real é executado e nenhum túnel é criado.
-        </p>
       </Card>
     </div>
   );
 }
diff --git a/apps/client/src/state/useRoomStore.ts b/apps/client/src/state/useRoomStore.ts
index 00257ab14f9bce10aab2f46f3a2d53cb9175fa2c..72a0b0a03cb4a3ce7dad2c9d6c84638111845f7b 100644
--- a/apps/client/src/state/useRoomStore.ts
+++ b/apps/client/src/state/useRoomStore.ts
@@ -46,58 +46,51 @@ interface RoomStoreState {
   clearPeerConnections(): void;
   resetRoomState(): void;
 }
 
 const fallbackStorage: Storage = {
   length: 0,
   clear: () => undefined,
   getItem: () => null,
   key: () => null,
   removeItem: () => undefined,
   setItem: () => undefined,
 };
 
 const storage = createJSONStorage<Pick<RoomStoreState, "roomId" | "selfPeerId" | "peers" | "peerConnections" | "theme">>(() => {
   if (typeof window === "undefined") {
     return fallbackStorage;
   }
   try {
     return window.sessionStorage;
   } catch (error) {
     console.warn("fluxshare:room-store", "sessionStorage unavailable", error);
     return fallbackStorage;
   }
 });
 
-const defaultTheme: ThemeMode = (() => {
-  if (typeof window === "undefined") return "dark";
-  try {
-    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
-  } catch {
-    return "dark";
-  }
-})();
+const defaultTheme: ThemeMode = "dark"; // LLM-LOCK: default theme must remain dark to comply with official palette
 
 export const useRoomStore = create<RoomStoreState>()(
   persist(
     (set, get) => ({
       roomId: null,
       selfPeerId: null,
       peers: [],
       peerConnections: {},
       theme: defaultTheme,
       setTheme: (theme) => set({ theme }),
       ensureSelfPeerId: () => {
         const existing = get().selfPeerId;
         if (existing) {
           return existing;
         }
         const next = nanoid(10).toUpperCase();
         set({ selfPeerId: next });
         return next;
       },
       setRoomId: (roomId) => set({ roomId }),
       setPeers: (peers) => set({ peers }),
       upsertPeer: (peer) =>
         set((state) => {
           const peers = state.peers.filter((entry) => entry.peerId !== peer.peerId);
           return { peers: [...peers, peer] };
diff --git a/apps/client/src/state/useTunnelStore.ts b/apps/client/src/state/useTunnelStore.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d8b32ed0db23ecb3ee457b45e24eb493c85222cf
--- /dev/null
+++ b/apps/client/src/state/useTunnelStore.ts
@@ -0,0 +1,173 @@
+import { create } from "zustand";
+import { invoke } from "@tauri-apps/api/tauri";
+import { listen } from "@tauri-apps/api/event";
+import { isTauri } from "../lib/persist/tauri";
+
+const LOG_EVENT = "fluxshare://tunnel-log"; // LLM-LOCK: must match backend EVENT_TUNNEL_LOG
+const STATUS_EVENT = "fluxshare://tunnel-status"; // LLM-LOCK: status event used by Admin page checks
+const STOPPED_EVENT = "tunnel:stopped"; // LLM-LOCK: backend exit notification contract
+const MAX_LOGS = 200;
+
+type TunnelLifecycle = "RUNNING" | "STOPPED";
+
+type TunnelStatusPayload = {
+  running: boolean;
+  url?: string | null;
+};
+
+type TunnelLogPayload = {
+  line: string;
+};
+
+export interface TunnelStoreState {
+  status: TunnelLifecycle;
+  url: string | null;
+  logs: string[];
+  loading: boolean;
+  error?: string;
+  missingBinary: boolean;
+  start(): Promise<void>;
+  stop(): Promise<void>;
+  refresh(): Promise<void>;
+  clear(): void;
+}
+
+function formatLog(message: string) {
+  const time = new Date().toLocaleTimeString();
+  return `[${time}] ${message}`;
+}
+
+function appendLog(logs: string[], message: string) {
+  const next = [...logs, formatLog(message)];
+  if (next.length > MAX_LOGS) {
+    return next.slice(next.length - MAX_LOGS);
+  }
+  return next;
+}
+
+export const useTunnelStore = create<TunnelStoreState>((set, _get) => {
+  if (isTauri()) {
+    listen<TunnelLogPayload>(LOG_EVENT, (event) => {
+      const line = event.payload?.line ?? "";
+      if (!line) return;
+      set((state) => ({ logs: appendLog(state.logs, line) }));
+    }).catch(() => undefined);
+
+    listen<TunnelStatusPayload>(STATUS_EVENT, (event) => {
+      const payload = event.payload ?? { running: false, url: null };
+      set(() => ({
+        status: payload.running ? "RUNNING" : "STOPPED",
+        url: payload.url ?? null,
+      }));
+    }).catch(() => undefined);
+
+    listen<number>(STOPPED_EVENT, (event) => {
+      const rawCode = event.payload;
+      const code = typeof rawCode === "number" ? rawCode : -1;
+      set((state) => ({
+        logs: appendLog(
+          state.logs,
+          `[Tunnel] Parado (code ${code}) — processo Cloudflare finalizado.`,
+        ),
+        status: "STOPPED",
+        url: null,
+      }));
+    }).catch(() => undefined);
+
+    void (async () => {
+      try {
+        const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
+        set((state) => ({
+          status: status.running ? "RUNNING" : "STOPPED",
+          url: status.url ?? null,
+          logs: status.running ? appendLog(state.logs, "Tunnel ativo.") : state.logs,
+        }));
+      } catch {
+        // ignore initial status errors
+      }
+    })();
+  }
+
+  return {
+    status: "STOPPED",
+    url: null,
+    logs: [],
+    loading: false,
+    error: undefined,
+    missingBinary: false,
+    async start() {
+      if (!isTauri()) {
+        set((state) => ({
+          logs: appendLog(state.logs, "Tunnel disponível apenas no app desktop."),
+          status: "STOPPED",
+        }));
+        return;
+      }
+      set({ loading: true, error: undefined });
+      try {
+        const response = (await invoke("start_tunnel")) as { public_url: string };
+        set((state) => ({
+          loading: false,
+          status: "RUNNING",
+          url: response.public_url,
+          logs: appendLog(state.logs, `Tunnel iniciado: ${response.public_url}`),
+          missingBinary: false,
+        }));
+      } catch (error) {
+        const message = typeof error === "string" ? error : (error as Error).message;
+        set((state) => ({
+          loading: false,
+          status: "STOPPED",
+          logs: appendLog(state.logs, `Erro: ${message}`),
+          error: message,
+          missingBinary: /cloudflared/i.test(message),
+        }));
+        throw error;
+      }
+    },
+    async stop() {
+      if (!isTauri()) {
+        set((state) => ({ logs: appendLog(state.logs, "Nenhum túnel ativo."), status: "STOPPED" }));
+        return;
+      }
+      set({ loading: true });
+      try {
+        await invoke("stop_tunnel");
+        set((state) => ({
+          loading: false,
+          status: "STOPPED",
+          url: null,
+          logs: appendLog(state.logs, "Tunnel parado."),
+        }));
+      } catch (error) {
+        const message = typeof error === "string" ? error : (error as Error).message;
+        set((state) => ({
+          loading: false,
+          logs: appendLog(state.logs, `Erro ao parar: ${message}`),
+          error: message,
+        }));
+        throw error;
+      }
+    },
+    async refresh() {
+      if (!isTauri()) return;
+      try {
+        const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
+        set((state) => ({
+          status: status.running ? "RUNNING" : "STOPPED",
+          url: status.url ?? null,
+          missingBinary: state.missingBinary,
+        }));
+      } catch (error) {
+        const message = typeof error === "string" ? error : (error as Error).message;
+        set((state) => ({
+          logs: appendLog(state.logs, `Erro ao consultar status: ${message}`),
+          error: message,
+        }));
+      }
+    },
+    clear() {
+      set({ logs: [] });
+    },
+  };
+});
diff --git a/apps/client/src/styles/theme.css b/apps/client/src/styles/theme.css
index 2bf487c691d4250063a74370410fb6db8ee6c9dc..9f82f4119dcf2b6f703ebf48fafcc61bc2101a64 100644
--- a/apps/client/src/styles/theme.css
+++ b/apps/client/src/styles/theme.css
@@ -1,92 +1,58 @@
 @import "./tokens.css";
 
 html {
   font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
   background-color: var(--bg);
   color: var(--text);
   transition: background-color 200ms ease, color 200ms ease;
 }
 
 body {
   margin: 0;
   min-height: 100vh;
-  background:
-    radial-gradient(circle at top, rgba(124, 58, 237, 0.24), transparent 55%),
-    linear-gradient(160deg, var(--bg) 0%, var(--bg-soft) 100%);
+  background-color: var(--bg);
   color: var(--text);
 }
 
 * {
   box-sizing: border-box;
 }
 
 a {
-  color: var(--accent);
+  color: var(--primary);
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
   background: color-mix(in srgb, var(--primary) 35%, transparent);
   color: inherit;
 }
 
 .app-shell {
   position: relative;
   min-height: 100vh;
-  background:
-    radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.32), transparent 58%),
-    radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.28), transparent 62%),
-    radial-gradient(circle at 50% 82%, rgba(124, 58, 237, 0.22), transparent 68%),
-    linear-gradient(155deg, var(--bg) 0%, var(--bg-soft) 100%);
+  background-color: var(--bg);
   color: var(--text);
   isolation: isolate;
 }
 
 .app-shell__background {
   position: fixed;
   inset: 0;
   z-index: -1;
   pointer-events: none;
 }
 
-.app-shell__gradient {
-  position: absolute;
-  inset: -20%;
-  background:
-    radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.22), transparent 55%),
-    radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.2), transparent 60%),
-    radial-gradient(circle at 50% 80%, rgba(124, 58, 237, 0.18), transparent 65%);
-  filter: blur(90px);
-  opacity: 0.9;
-}
-
-.app-shell__mesh {
-  position: absolute;
-  inset: 0;
-  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 45%, rgba(255, 255, 255, 0.05) 100%);
-  mix-blend-mode: screen;
-  opacity: 0.35;
-}
-
-.app-shell__grid {
-  position: absolute;
-  inset: 0;
-  background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
-    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
-  background-size: 52px 52px;
-  opacity: 0.14;
-}
-
 .card-shadow {
-  box-shadow: 0 25px 45px -25px rgba(15, 23, 42, 0.55);
+  box-shadow: 0 25px 45px -25px var(--ring);
 }
diff --git a/apps/client/src/styles/tokens.css b/apps/client/src/styles/tokens.css
index 408d8b0a4bd7421122aa6874f2737ffa9713b3c8..9f559a4b92be316228002ea4a4b07221a464ba1c 100644
--- a/apps/client/src/styles/tokens.css
+++ b/apps/client/src/styles/tokens.css
@@ -1,27 +1,12 @@
 :root {
   color-scheme: dark;
-  --bg: #0b0f1a;
-  --bg-soft: #0f1424;
-  --card: rgba(255, 255, 255, 0.06);
-  --border: rgba(255, 255, 255, 0.16);
-  --primary: #7c3aed;
-  --primary-600: #6d28d9;
-  --accent: #8b5cf6;
-  --text: #e5e7eb;
-  --muted: #a3a3a3;
-  --dashed: rgba(229, 231, 235, 0.35);
-}
-
-.theme-light {
-  color-scheme: light;
-  --bg: #eceaf9;
-  --bg-soft: #f2f0ff;
-  --card: rgba(0, 0, 0, 0.06);
-  --border: rgba(0, 0, 0, 0.12);
-  --primary: #6d28d9;
-  --primary-600: #5b21b6;
-  --accent: #7c3aed;
-  --text: #111827;
-  --muted: #6b7280;
-  --dashed: rgba(17, 24, 39, 0.22);
+  --bg: #0e0a1f;
+  --surface: #151233;
+  --surface-2: #1c1842;
+  --border: #2b265a;
+  --primary: #8b5cf6;
+  --primary-foreground: #0b0a16;
+  --ring: rgba(139, 92, 246, 0.35);
+  --text: #e8e8f0;
+  --muted: #a3a3b2;
 }
diff --git a/apps/client/tailwind.config.ts b/apps/client/tailwind.config.ts
index 8818eb13fb722e09e8e2ccc9ee9e278092d25aad..e9e5f4d792f0064baafbf550177da3926a2dbf02 100644
--- a/apps/client/tailwind.config.ts
+++ b/apps/client/tailwind.config.ts
@@ -1,33 +1,35 @@
 import type { Config } from "tailwindcss";
 
 const config: Config = {
   content: ["./index.html", "./src/**/*.{ts,tsx}"],
   theme: {
     extend: {
       colors: {
         bg: "var(--bg)",
-        "bg-soft": "var(--bg-soft)",
-        card: "var(--card)",
+        surface: "var(--surface)",
+        "surface-2": "var(--surface-2)",
         border: "var(--border)",
         primary: {
           DEFAULT: "var(--primary)",
-          600: "var(--primary-600)",
+          foreground: "var(--primary-foreground)",
         },
-        accent: "var(--accent)",
+        ring: "var(--ring)",
         text: "var(--text)",
         muted: "var(--muted)",
-        dashed: "var(--dashed)",
+      },
+      borderColor: {
+        DEFAULT: "var(--border)",
       },
       borderRadius: {
         "2xl": "1.25rem",
         "3xl": "1.75rem",
       },
       boxShadow: {
-        glass: "0 25px 45px -25px rgba(15, 23, 42, 0.55)",
+        glass: "0 25px 45px -25px var(--ring)",
       },
     },
   },
   plugins: [],
 };
 
 export default config;
diff --git a/package.json b/package.json
index 88962ebf7c8d16c33c39df0316bbc0420eeb2e9f..d8efc7d4a1bc1fd223f724aef9b92fa83a112417 100644
--- a/package.json
+++ b/package.json
@@ -1,12 +1,14 @@
 {
   "name": "fluxshare-monorepo",
   "private": true,
   "version": "0.1.0",
   "license": "MIT",
   "scripts": {
     "dev": "pnpm -r --parallel --filter fluxshare-signaling-server --filter fluxshare-client dev",
     "build": "pnpm --filter fluxshare-signaling-server build && pnpm --filter fluxshare-client build",
-    "test": "pnpm --filter fluxshare-signaling-server test && cargo test --manifest-path apps/client/src-tauri/Cargo.toml"
+    "test": "pnpm --filter fluxshare-signaling-server test && cargo test --manifest-path apps/client/src-tauri/Cargo.toml",
+    "tauri:dev": "pnpm -C apps/client tauri dev",
+    "tauri:build": "pnpm -C apps/client tauri build"
   },
   "packageManager": "pnpm@8.15.4"
 }
 
EOF
)