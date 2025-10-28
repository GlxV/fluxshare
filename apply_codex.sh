 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/apps/client/src-tauri/Cargo.toml b/apps/client/src-tauri/Cargo.toml
index 5735282041cc2da4a6d2553e2993461d9c0cc648..76644a76bcde4af0ac1efdf35397a374a2b1359a 100644
--- a/apps/client/src-tauri/Cargo.toml
+++ b/apps/client/src-tauri/Cargo.toml
@@ -1,46 +1,49 @@
 [package]
 name = "fluxshare"
 version = "0.1.0"
 edition = "2021"
 description = "FluxShare Tauri backend"
 authors = ["FluxShare Team"]
 license = "MIT"
 
 [lib]
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
+html_escape = "0.2"
+percent-encoding = "2"
 parking_lot = "0.12"
 quinn = { version = "0.10", features = ["rustls"] }
 rand = "0.8"
 serde = { version = "1", features = ["derive"] }
 serde_json = "1"
 thiserror = "1"
 tauri = { version = "1.5", features = ["api-all", "process-command-api"] }
 tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "process", "signal", "sync", "time"] }
+tokio-util = { version = "0.7", features = ["io"] }
 tracing = "0.1"
 tracing-appender = "0.2"
 tracing-subscriber = { version = "0.3", features = ["fmt", "env-filter", "json"] }
 url = "2"
 webrtc = "0.10"
 which = "4"
 # opcional: só se realmente usar
 chrono = { version = "0.4", features = ["serde"] }
 
 [build-dependencies]
 tauri-build = { version = "1", features = [] }
 
 
 [dev-dependencies]
 rand = "0.8"
 tempfile = "3"
 
diff --git a/apps/client/src-tauri/src/commands/tunnel.rs b/apps/client/src-tauri/src/commands/tunnel.rs
index ace8a9aaa9e2d00986eef6f8a2d03a9d22dd7c32..8dcf21d4ab24384c997e30d3088202c9d96dd97f 100644
--- a/apps/client/src-tauri/src/commands/tunnel.rs
+++ b/apps/client/src-tauri/src/commands/tunnel.rs
@@ -1,121 +1,185 @@
-use std::io::{BufRead, BufReader};
+use std::fmt::Write as FmtWrite;
+use std::fs;
+use std::io::{BufRead, BufReader, SeekFrom};
+use std::path::PathBuf;
 use std::process::{Child, Command, Stdio};
 use std::sync::Arc;
 use std::thread::JoinHandle as ThreadJoinHandle;
 use std::time::Duration;
 
-use axum::{response::Html, routing::get, Router};
+use axum::{
+    body::StreamBody,
+    extract::{Path, State},
+    http::{header, HeaderMap, HeaderValue, StatusCode},
+    response::{Html, IntoResponse, Response},
+    routing::get,
+    Router,
+};
+use html_escape::encode_text;
 use parking_lot::Mutex;
+use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
 use serde::Serialize;
 use tauri::Manager;
 use tokio::sync::oneshot;
 use tokio::time::sleep;
+use tokio::{
+    fs::File,
+    io::{AsyncReadExt, AsyncSeekExt},
+};
+use tokio_util::io::ReaderStream;
 use which::which;
 
 const EVENT_TUNNEL_LOG: &str = "fluxshare://tunnel-log"; // LLM-LOCK: event name consumed by frontend listeners
 const EVENT_TUNNEL_STATUS: &str = "fluxshare://tunnel-status"; // LLM-LOCK: status event contract with Admin page tests
 const EVENT_TUNNEL_STOPPED: &str = "tunnel:stopped"; // LLM-LOCK: backend exit notification consumed by frontend logger
 const URL_DETECTION_TIMEOUT: Duration = Duration::from_secs(20);
 
+const FILENAME_ENCODE_SET: &AsciiSet = &CONTROLS
+    .add(b'\0')
+    .add(b'"')
+    .add(b'%')
+    .add(b'\'')
+    .add(b'(')
+    .add(b')')
+    .add(b';')
+    .add(b'=')
+    .add(b'@')
+    .add(b'[')
+    .add(b']')
+    .add(b'{')
+    .add(b'}')
+    .add(b'<')
+    .add(b'>')
+    .add(b'/')
+    .add(b'?')
+    .add(b':')
+    .add(b'\\')
+    .add(b'|')
+    .add(b'*')
+    .add(b'&')
+    .add(b'#')
+    .add(b'+')
+    .add(b'^')
+    .add(b'`')
+    .add(b'$');
+
+#[derive(Clone)]
+struct HostedFile {
+    id: u64,
+    path: PathBuf,
+    name: String,
+    size: u64,
+}
+
+#[derive(Serialize, Clone)]
+#[serde(rename_all = "camelCase")]
+pub struct HostedFileSummary {
+    pub id: u64,
+    pub name: String,
+    pub size: u64,
+}
+
+#[derive(Clone)]
+struct ServerState {
+    manager: TunnelManager,
+}
+
 #[derive(Default)]
 struct TunnelState {
     child: Option<Child>,
-url: Option<String>,
-log_handles: Vec<ThreadJoinHandle<()>>,
-server_handle: Option<tauri::async_runtime::JoinHandle<()>>,
-server_shutdown: Option<oneshot::Sender<()>>,
-server_port: Option<u16>,
-exit_monitor: Option<tauri::async_runtime::JoinHandle<()>>,
+    url: Option<String>,
+    log_handles: Vec<ThreadJoinHandle<()>>,
+    server_handle: Option<tauri::async_runtime::JoinHandle<()>>,
+    server_shutdown: Option<oneshot::Sender<()>>,
+    server_port: Option<u16>,
+    exit_monitor: Option<tauri::async_runtime::JoinHandle<()>>,
+    files: Vec<HostedFile>,
+    next_file_id: u64,
 }
 
 #[derive(Default, Clone)]
 pub struct TunnelManager {
     pub(super) inner: Arc<Mutex<TunnelState>>,
 }
 
 #[derive(Serialize, Clone)]
 pub struct TunnelInfo {
     pub public_url: String,
 }
 
 #[derive(Serialize, Clone)]
+#[serde(rename_all = "camelCase")]
 pub struct TunnelStatus {
     pub running: bool,
     pub url: Option<String>,
+    pub local_port: Option<u16>,
+    pub hosted_files: Vec<HostedFileSummary>,
 }
 
 #[derive(Serialize, Clone)]
 struct TunnelLogPayload {
     line: String,
 }
 
 #[derive(Serialize, Clone)]
 struct TunnelStatusPayload {
     running: bool,
     url: Option<String>,
 }
 
 fn emit_log(app: &tauri::AppHandle, line: &str) {
     let _ = app.emit_all(
         EVENT_TUNNEL_LOG,
         TunnelLogPayload {
             line: line.to_string(),
         },
     );
 }
 
 fn emit_status(app: &tauri::AppHandle, running: bool, url: Option<String>) {
-    let _ = app.emit_all(
-        EVENT_TUNNEL_STATUS,
-        TunnelStatusPayload {
-            running,
-            url,
-        },
-    );
+    let _ = app.emit_all(EVENT_TUNNEL_STATUS, TunnelStatusPayload { running, url });
 }
 
 fn emit_tunnel_stopped(app: &tauri::AppHandle, code: Option<i32>) -> i32 {
     let resolved = code.unwrap_or(-1);
     tracing::info!(code = resolved, "cloudflare_tunnel_exited");
     let _ = app.emit_all(EVENT_TUNNEL_STOPPED, resolved);
     resolved
 }
 
-async fn finalize_tunnel_exit(
-    app: &tauri::AppHandle,
-    manager: &TunnelManager,
-    code: Option<i32>,
-) {
+async fn finalize_tunnel_exit(app: &tauri::AppHandle, manager: &TunnelManager, code: Option<i32>) {
     let exit_code = emit_tunnel_stopped(app, code);
     emit_status(app, false, None);
     let (log_handles, server_shutdown, server_handle) = {
         let mut state = manager.inner.lock();
         state.child = None;
         state.url = None;
         state.server_port = None;
         state.exit_monitor = None;
+        state.files.clear();
+        state.next_file_id = 0;
         (
             state.log_handles.drain(..).collect::<Vec<_>>(),
             state.server_shutdown.take(),
             state.server_handle.take(),
         )
     };
 
     if let Some(tx) = server_shutdown {
         let _ = tx.send(());
     }
 
     if let Some(handle) = server_handle {
         let _ = handle.await;
     }
 
     let _ = tauri::async_runtime::spawn_blocking(move || {
         for handle in log_handles {
             let _ = handle.join();
         }
     })
     .await;
 
     emit_log(app, &format!("Tunnel finalizado (código {exit_code})."));
 }
 
@@ -147,110 +211,319 @@ fn spawn_exit_monitor(
                 Some(Err(error)) => {
                     tracing::error!(?error, "cloudflare_tunnel_wait_error");
                     finalize_tunnel_exit(&app, &manager, None).await;
                     return;
                 }
                 None => {
                     sleep(Duration::from_millis(500)).await;
                 }
             }
         }
     })
 }
 
 fn cleanup_finished(state: &mut TunnelState) {
     if let Some(child) = state.child.as_mut() {
         if let Ok(Some(_)) = child.try_wait() {
             state.child = None;
             state.url = None;
         }
     }
     if state.child.is_none() {
         for handle in state.log_handles.drain(..) {
             let _ = handle.join();
         }
     }
-    if let Some(handle) = &state.server_handle {
-        if false {
-            state.server_handle = None;
-            state.server_shutdown = None;
-            state.server_port = None;
+}
+
+fn ascii_filename_fallback(name: &str) -> String {
+    let mut fallback = String::with_capacity(name.len());
+    for ch in name.chars() {
+        if ch.is_ascii() {
+            match ch {
+                '"' | '\\' | '/' | ':' | '*' | '?' | '|' | '<' | '>' => fallback.push('_'),
+                _ if ch.is_control() => fallback.push('_'),
+                _ => fallback.push(ch),
+            }
+        } else {
+            fallback.push('_');
+        }
+    }
+    if fallback.trim().is_empty() {
+        "download".into()
+    } else {
+        fallback
+    }
+}
+
+fn format_file_size(size: u64) -> String {
+    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
+    if size == 0 {
+        return "0 B".into();
+    }
+    let mut value = size as f64;
+    let mut unit_index = 0usize;
+    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
+        value /= 1024.0;
+        unit_index += 1;
+    }
+    if unit_index == 0 {
+        format!("{size} {}", UNITS[unit_index])
+    } else {
+        format!("{value:.2} {}", UNITS[unit_index])
+    }
+}
+
+fn summarize_files(files: &[HostedFile]) -> Vec<HostedFileSummary> {
+    files
+        .iter()
+        .map(|file| HostedFileSummary {
+            id: file.id,
+            name: file.name.clone(),
+            size: file.size,
+        })
+        .collect()
+}
+
+fn render_index_page(files: &[HostedFileSummary]) -> String {
+    let mut html = String::new();
+    let _ = write!(
+        html,
+        "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\" />\
+<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\
+<title>FluxShare</title>\
+<style>body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:2.5rem;}}\
+.container{{max-width:720px;margin:0 auto;}}\
+h1{{font-size:2rem;margin-bottom:0.5rem;}}\
+p.subtitle{{margin-top:0;margin-bottom:1.5rem;color:#94a3b8;}}\
+ul{{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.75rem;}}\
+li{{background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);border-radius:0.75rem;padding:1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;}}\
+a{{color:#38bdf8;text-decoration:none;font-weight:600;}}\
+a:hover{{text-decoration:underline;}}\
+.empty{{padding:1.5rem;border-radius:0.75rem;border:1px dashed rgba(148,163,184,0.4);color:#94a3b8;background:rgba(148,163,184,0.08);}}\
+.size{{font-size:0.875rem;color:#cbd5f5;}}\
+</style></head><body><div class=\"container\"><h1>FluxShare</h1><p class=\"subtitle\">Arquivos hospedados via FluxShare.</p>"
+    );
+
+    if files.is_empty() {
+        html.push_str("<div class=\"empty\">Nenhum arquivo hospedado.</div>");
+    } else {
+        html.push_str("<ul>");
+        for file in files {
+            let _ = write!(
+                html,
+                "<li><a href=\"/download/{id}\">{name}</a><span class=\"size\">{size}</span></li>",
+                id = file.id,
+                name = encode_text(&file.name),
+                size = encode_text(&format_file_size(file.size)),
+            );
+        }
+        html.push_str("</ul>");
+    }
+
+    html.push_str("</div></body></html>");
+    html
+}
+
+async fn index_handler(State(state): State<ServerState>) -> Html<String> {
+    let summaries = {
+        let state_guard = state.manager.inner.lock();
+        summarize_files(&state_guard.files)
+    };
+    Html(render_index_page(&summaries))
+}
+
+fn parse_range_header(value: &str, total_size: u64) -> Result<Option<(u64, u64)>, ()> {
+    let trimmed = value.trim();
+    if !trimmed.starts_with("bytes=") {
+        return Err(());
+    }
+    let ranges = &trimmed[6..];
+    if ranges.contains(',') {
+        return Err(());
+    }
+    if ranges.is_empty() {
+        return Err(());
+    }
+    if total_size == 0 {
+        return Err(());
+    }
+    if let Some(rest) = ranges.strip_prefix('-') {
+        let suffix: u64 = rest.parse().map_err(|_| ())?;
+        if suffix == 0 {
+            return Err(());
+        }
+        let length = suffix.min(total_size);
+        let end = total_size - 1;
+        let start = total_size - length;
+        return Ok(Some((start, end)));
+    }
+    let (start_str, end_str) = ranges.split_once('-').ok_or(())?;
+    let start: u64 = start_str.parse().map_err(|_| ())?;
+    let end: u64 = if end_str.is_empty() {
+        total_size.checked_sub(1).ok_or(())?
+    } else {
+        end_str.parse().map_err(|_| ())?
+    };
+    if start > end || end >= total_size {
+        return Err(());
+    }
+    Ok(Some((start, end)))
+}
+
+async fn download_handler(
+    State(state): State<ServerState>,
+    Path(id): Path<u64>,
+    headers: HeaderMap,
+) -> Result<Response, StatusCode> {
+    let file = {
+        let state_guard = state.manager.inner.lock();
+        state_guard.files.iter().find(|file| file.id == id).cloned()
+    };
+
+    let file = file.ok_or(StatusCode::NOT_FOUND)?;
+    let mut handle = File::open(&file.path)
+        .await
+        .map_err(|_| StatusCode::NOT_FOUND)?;
+
+    let mut status = StatusCode::OK;
+    let mut start = 0u64;
+    let mut end = if file.size == 0 {
+        0
+    } else {
+        file.size.saturating_sub(1)
+    };
+
+    if let Some(range_header) = headers
+        .get(header::RANGE)
+        .and_then(|value| value.to_str().ok())
+    {
+        match parse_range_header(range_header, file.size) {
+            Ok(Some((s, e))) => {
+                start = s;
+                end = e;
+                status = StatusCode::PARTIAL_CONTENT;
+            }
+            Ok(None) => {}
+            Err(_) => return Err(StatusCode::RANGE_NOT_SATISFIABLE),
         }
     }
-    if let Some(handle) = &state.exit_monitor {
-        if false {
-            state.exit_monitor = None;
+
+    let bytes_to_read = if file.size == 0 {
+        0
+    } else {
+        end.saturating_sub(start).saturating_add(1)
+    };
+
+    if bytes_to_read > 0 {
+        handle
+            .seek(SeekFrom::Start(start))
+            .await
+            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
+    }
+
+    let stream = ReaderStream::new(handle.take(bytes_to_read));
+    let mut response = StreamBody::new(stream).into_response();
+    *response.status_mut() = status;
+
+    if let Ok(value) = HeaderValue::from_str(&bytes_to_read.to_string()) {
+        response.headers_mut().insert(header::CONTENT_LENGTH, value);
+    }
+    response
+        .headers_mut()
+        .insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
+
+    if status == StatusCode::PARTIAL_CONTENT {
+        if let Ok(value) =
+            HeaderValue::from_str(&format!("bytes {start}-{end}/{total}", total = file.size))
+        {
+            response.headers_mut().insert(header::CONTENT_RANGE, value);
         }
     }
+
+    let ascii_name = ascii_filename_fallback(&file.name);
+    let encoded_name = utf8_percent_encode(&file.name, FILENAME_ENCODE_SET).to_string();
+    let disposition = format!(
+        "attachment; filename=\"{}\"; filename*=UTF-8''{}",
+        ascii_name, encoded_name
+    );
+    if let Ok(value) = HeaderValue::from_str(&disposition) {
+        response
+            .headers_mut()
+            .insert(header::CONTENT_DISPOSITION, value);
+    }
+    response.headers_mut().insert(
+        header::CONTENT_TYPE,
+        HeaderValue::from_static("application/octet-stream"),
+    );
+
+    Ok(response)
 }
 
 async fn ensure_http_server(manager: &TunnelManager) -> Result<u16, String> {
     {
         let mut state = manager.inner.lock();
         cleanup_finished(&mut state);
         if let Some(port) = state.server_port {
             if let Some(handle) = &state.server_handle {
                 if true {
                     return Ok(port);
                 }
             } else {
                 return Ok(port);
             }
         }
     }
 
     let (ready_tx, ready_rx) = oneshot::channel::<Result<u16, String>>();
     let (shutdown_tx, shutdown_rx) = oneshot::channel();
+    let server_manager = manager.clone();
 
     let handle = tauri::async_runtime::spawn(async move {
         let listener = match tokio::net::TcpListener::bind(("127.0.0.1", 0)).await {
             Ok(listener) => listener,
             Err(error) => {
                 let _ = ready_tx.send(Err(format!("falha ao abrir porta HTTP: {error}")));
                 return;
             }
         };
 
         let port = match listener.local_addr() {
             Ok(addr) => addr.port(),
             Err(error) => {
                 let _ = ready_tx.send(Err(format!("falha ao descobrir porta HTTP: {error}")));
                 return;
             }
         };
 
         let router = Router::new()
-            .route(
-                "/",
-                get(|| async {
-                    Html("<h1>FluxShare</h1><p>Tunnel ativo e pronto para receber conexões.</p>")
-                }),
-            )
-            .route(
-                "/health",
-                get(|| async { Html("ok") }),
-            );
+            .route("/", get(index_handler))
+            .route("/download/:id", get(download_handler))
+            .route("/health", get(|| async { Html("ok") }))
+            .with_state(ServerState {
+                manager: server_manager.clone(),
+            });
 
         if ready_tx.send(Ok(port)).is_err() {
             return;
         }
 
         if let Err(error) = axum::serve(listener, router.into_make_service())
             .with_graceful_shutdown(async {
                 let _ = shutdown_rx.await;
             })
             .await
         {
             tracing::error!(?error, "tunnel_http_server_exit");
         }
     });
 
     let port = ready_rx
         .await
         .map_err(|_| "falha ao iniciar servidor HTTP".to_string())??;
 
     let mut state = manager.inner.lock();
     state.server_handle = Some(handle);
     state.server_shutdown = Some(shutdown_tx);
     state.server_port = Some(port);
     Ok(port)
 }
@@ -273,195 +546,307 @@ fn spawn_log_reader<R: BufRead + Send + 'static>(
                     state.url = Some(url.clone());
                 }
                 emit_status(&app, true, Some(url));
             }
         }
         let mut should_emit = false;
         {
             let mut state = manager.inner.lock();
             cleanup_finished(&mut state);
             if state.child.is_none() {
                 should_emit = true;
             }
         }
         if should_emit {
             emit_status(&app, false, None);
         }
     })
 }
 
 fn extract_url(line: &str) -> Option<String> {
     line.split_whitespace()
         .find(|segment| segment.contains("trycloudflare.com"))
         .map(|segment| segment.trim_matches('"').to_string())
 }
 
-#[tauri::command]
-pub async fn start_tunnel(
-    app: tauri::AppHandle,
-    manager: tauri::State<'_, TunnelManager>,
-) -> Result<TunnelInfo, String> {
+async fn start_cloudflared(
+    app: &tauri::AppHandle,
+    manager: &TunnelManager,
+) -> Result<String, String> {
     {
         let mut state = manager.inner.lock();
         cleanup_finished(&mut state);
         if let Some(child) = state.child.as_mut() {
             if child.try_wait().map_err(|e| e.to_string())?.is_none() {
                 if let Some(url) = state.url.clone() {
-                    return Ok(TunnelInfo { public_url: url });
+                    return Ok(url);
                 }
             }
         }
     }
 
-    let port = ensure_http_server(&manager).await?;
-    let binary = which("cloudflared").map_err(|_| "cloudflared não encontrado no PATH".to_string())?;
+    let port = ensure_http_server(manager).await?;
+    let binary =
+        which("cloudflared").map_err(|_| "cloudflared não encontrado no PATH".to_string())?;
     emit_log(
-        &app,
+        app,
         &format!("Iniciando cloudflared: http://127.0.0.1:{port}"),
     );
 
     let mut child = Command::new(binary)
         .args(["tunnel", "--url", &format!("http://127.0.0.1:{port}")])
         .stdout(Stdio::piped())
         .stderr(Stdio::piped())
         .spawn()
         .map_err(|error| format!("falha ao iniciar cloudflared: {error}"))?;
 
     let stdout = child.stdout.take().map(BufReader::new);
     let stderr = child.stderr.take().map(BufReader::new);
 
     let (url_tx, url_rx) = std::sync::mpsc::channel();
     let mut log_handles = Vec::new();
 
     if let Some(reader) = stdout {
         log_handles.push(spawn_log_reader(
             reader,
             "stdout",
             app.clone(),
-            manager.inner().clone(),
+            manager.clone(),
             url_tx.clone(),
         ));
     }
     if let Some(reader) = stderr {
         log_handles.push(spawn_log_reader(
             reader,
             "stderr",
             app.clone(),
-            manager.inner().clone(),
+            manager.clone(),
             url_tx.clone(),
         ));
     }
     drop(url_tx);
 
     let url = match url_rx.recv_timeout(URL_DETECTION_TIMEOUT) {
         Ok(url) => url,
         Err(_) => {
             let _ = child.kill();
             let _ = child.wait();
             for handle in log_handles {
                 let _ = handle.join();
             }
             return Err("não foi possível detectar URL do tunnel".to_string());
         }
     };
 
     {
         let mut state = manager.inner.lock();
         cleanup_finished(&mut state);
         state.child = Some(child);
         state.url = Some(url.clone());
         state.log_handles.extend(log_handles);
     }
 
-    let exit_monitor = spawn_exit_monitor(app.clone(), manager.inner().clone());
+    let exit_monitor = spawn_exit_monitor(app.clone(), manager.clone());
     {
         let mut state = manager.inner.lock();
         state.exit_monitor = Some(exit_monitor);
     }
 
-    emit_status(&app, true, Some(url.clone()));
-    Ok(TunnelInfo { public_url: url })
+    emit_status(app, true, Some(url.clone()));
+    Ok(url)
 }
 
-#[tauri::command]
-pub async fn stop_tunnel(
-    app: tauri::AppHandle,
-    manager: tauri::State<'_, TunnelManager>,
-) -> Result<(), String> {
-    let (
-        exit_status,
-        mut log_handles,
-        server_shutdown,
-        server_handle,
-        monitor_handle,
-    ) = {
+async fn stop_all(app: &tauri::AppHandle, manager: &TunnelManager) -> Result<(), String> {
+    let (exit_status, mut log_handles, server_shutdown, server_handle, monitor_handle) = {
         let mut state = manager.inner.lock();
         cleanup_finished(&mut state);
         let status = if let Some(child) = state.child.as_mut() {
             if let Err(error) = child.kill() {
                 tracing::warn!(?error, "cloudflare_tunnel_kill_failed");
             }
             match child.wait() {
                 Ok(status) => Some(status),
                 Err(error) => {
                     tracing::error!(?error, "cloudflare_tunnel_wait_failure");
                     None
                 }
             }
         } else {
             None
         };
         state.child = None;
         state.url = None;
         state.server_port = None;
+        state.files.clear();
+        state.next_file_id = 0;
         (
             status,
             state.log_handles.drain(..).collect::<Vec<_>>(),
             state.server_shutdown.take(),
             state.server_handle.take(),
             state.exit_monitor.take(),
         )
     };
 
     if let Some(handle) = monitor_handle {
         let _ = handle.await;
     }
 
     for handle in log_handles.drain(..) {
         let _ = handle.join();
     }
 
     if let Some(tx) = server_shutdown {
         let _ = tx.send(());
     }
 
     if let Some(handle) = server_handle {
         let _ = handle.await;
     }
 
     let exit_code = exit_status.as_ref().and_then(|status| status.code());
-    let code = emit_tunnel_stopped(&app, exit_code);
-    emit_status(&app, false, None);
-    emit_log(&app, &format!("Tunnel parado (código {code})."));
+    let code = emit_tunnel_stopped(app, exit_code);
+    emit_status(app, false, None);
+    emit_log(app, &format!("Tunnel parado (código {code})."));
     Ok(())
 }
 
+#[derive(Serialize, Clone)]
+#[serde(rename_all = "camelCase")]
+pub struct HostSessionInfo {
+    pub local_url: String,
+    pub public_url: Option<String>,
+    pub files: Vec<HostedFileSummary>,
+}
+
+#[tauri::command]
+pub async fn start_host(
+    app: tauri::AppHandle,
+    manager: tauri::State<'_, TunnelManager>,
+    files: Vec<String>,
+    cf_mode: Option<String>,
+) -> Result<HostSessionInfo, String> {
+    if files.is_empty() {
+        return Err("no files provided".to_string());
+    }
+
+    let prepared = files
+        .into_iter()
+        .map(|raw| {
+            let path = PathBuf::from(&raw);
+            if !path.exists() {
+                return Err(format!("arquivo não encontrado: {raw}"));
+            }
+            let metadata = fs::metadata(&path)
+                .map_err(|error| format!("falha ao ler arquivo {raw}: {error}"))?;
+            if !metadata.is_file() {
+                return Err(format!("caminho não é um arquivo: {raw}"));
+            }
+            let name = path
+                .file_name()
+                .map(|n| n.to_string_lossy().to_string())
+                .unwrap_or_else(|| raw.clone());
+            Ok((path, name, metadata.len()))
+        })
+        .collect::<Result<Vec<_>, String>>()?;
+
+    let summaries = {
+        let mut state = manager.inner.lock();
+        cleanup_finished(&mut state);
+        state.files.clear();
+        state.next_file_id = 0;
+        let mut stored = Vec::with_capacity(prepared.len());
+        for (path, name, size) in prepared {
+            let id = state.next_file_id;
+            state.next_file_id += 1;
+            stored.push(HostedFile {
+                id,
+                path,
+                name,
+                size,
+            });
+        }
+        state.files = stored;
+        summarize_files(&state.files)
+    };
+
+    let port = ensure_http_server(&manager).await?;
+    let local_url = format!("http://127.0.0.1:{port}/");
+
+    if summaries.is_empty() {
+        emit_log(&app, "Hosted 0 files.");
+    } else {
+        let names = summaries
+            .iter()
+            .map(|file| file.name.clone())
+            .collect::<Vec<_>>()
+            .join(", ");
+        emit_log(&app, &format!("Hosted {} files: {names}", summaries.len()));
+    }
+
+    let wants_tunnel = cf_mode
+        .as_deref()
+        .map(|mode| mode.eq_ignore_ascii_case("cloudflared"))
+        .unwrap_or(false);
+
+    let public_url = if wants_tunnel {
+        Some(start_cloudflared(&app, &manager).await?)
+    } else {
+        let state = manager.inner.lock();
+        state.url.clone()
+    };
+
+    Ok(HostSessionInfo {
+        local_url,
+        public_url,
+        files: summaries,
+    })
+}
+
+#[tauri::command]
+pub async fn start_tunnel(
+    app: tauri::AppHandle,
+    manager: tauri::State<'_, TunnelManager>,
+) -> Result<TunnelInfo, String> {
+    let url = start_cloudflared(&app, &manager).await?;
+    Ok(TunnelInfo { public_url: url })
+}
+
+#[tauri::command]
+pub async fn stop_tunnel(
+    app: tauri::AppHandle,
+    manager: tauri::State<'_, TunnelManager>,
+) -> Result<(), String> {
+    stop_all(&app, &manager).await
+}
+
+#[tauri::command]
+pub async fn stop_host(
+    app: tauri::AppHandle,
+    manager: tauri::State<'_, TunnelManager>,
+) -> Result<(), String> {
+    stop_all(&app, &manager).await
+}
+
 #[tauri::command]
 pub async fn tunnel_status(
     manager: tauri::State<'_, TunnelManager>,
 ) -> Result<TunnelStatus, String> {
     let mut state = manager.inner.lock();
     cleanup_finished(&mut state);
     let running = if let Some(child) = state.child.as_mut() {
         child.try_wait().map_err(|e| e.to_string())?.is_none()
     } else {
         false
     };
     if !running {
         state.child = None;
         state.url = None;
     }
+    let files = summarize_files(&state.files);
     Ok(TunnelStatus {
         running,
         url: state.url.clone(),
+        local_port: state.server_port,
+        hosted_files: files,
     })
 }
diff --git a/apps/client/src-tauri/src/main.rs b/apps/client/src-tauri/src/main.rs
index 205d7e9015a39922ae122089660b764d7fbcaac1..f0cb1705c567caa8f44db37a4e11c844dd594be3 100644
--- a/apps/client/src-tauri/src/main.rs
+++ b/apps/client/src-tauri/src/main.rs
@@ -1,52 +1,51 @@
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
-    tunnel::{start_tunnel, stop_tunnel, tunnel_status, TunnelManager},
+    tunnel::{start_host, start_tunnel, stop_host, stop_tunnel, tunnel_status, TunnelManager},
     webrtc::{start_signaling, webrtc_start, WebRTCManager},
 };
 use tauri::Manager;
 use tracing_subscriber::{fmt, EnvFilter};
 
 fn init_tracing() {
     let base = fmt()
         .with_env_filter(
-            EnvFilter::from_default_env()
-                .add_directive("fluxshare=info".parse().unwrap()),
+            EnvFilter::from_default_env().add_directive("fluxshare=info".parse().unwrap()),
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
@@ -59,41 +58,43 @@ fn main() {
     let transfer_manager = TransferManager::default();
     let settings_manager = SettingsManager::default();
     let tunnel_manager = TunnelManager::default(); // LLM-LOCK: central manager for Cloudflare tunnel lifecycle and stop events
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
+            start_host,
             start_tunnel,
+            stop_host,
             stop_tunnel,
             tunnel_status,
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
diff --git a/apps/client/src/components/TransferBox.tsx b/apps/client/src/components/TransferBox.tsx
index 9a290f2cdf41846d1dd07ac54e81486d7a8d87b0..4084a2f05e286403b49aa43bcf5959c5f093f9a1 100644
--- a/apps/client/src/components/TransferBox.tsx
+++ b/apps/client/src/components/TransferBox.tsx
@@ -1,36 +1,42 @@
+import { useEffect, useMemo, useState } from "react";
 import { Badge, type BadgeProps } from "./ui/Badge";
 import { Button } from "./ui/Button";
 import { Card } from "./ui/Card";
+import { useTunnelStore } from "../state/useTunnelStore";
+import { isTauri } from "../lib/persist/tauri";
 
 interface TransferBoxProps {
   file: {
     id: string;
     name: string;
     size: number;
     mime?: string;
     targetLabel?: string;
+    source?: "web" | "tauri";
+    file?: File;
+    path?: string;
   } | null;
   transfer: {
     id: string;
     status: "idle" | "transferring" | "paused" | "completed" | "error" | "cancelled";
     direction: "send" | "receive";
     bytesTransferred: number;
     totalBytes: number;
     startedAt: number;
     updatedAt: number;
     peerId: string;
   } | null;
   onPickFile: () => Promise<void>;
   onCancel: (peerId: string, transferId: string) => void;
   activeTransferId: string | null;
   hasConnectedPeers: boolean;
 }
 
 function formatBytes(bytes: number) {
   if (bytes === 0) return "0 B";
   const units = ["B", "KB", "MB", "GB", "TB"];
   const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
   const value = bytes / 1024 ** exponent;
   return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[exponent]}`;
 }
 
@@ -81,85 +87,149 @@ function computeStatusLabel({
       case "error":
         return "Falha na transferência";
       case "paused":
         return "Transferência pausada";
       default:
         return "Transferência";
     }
   }
   if (file) {
     return hasConnectedPeers ? "Arquivo pronto para enviar" : "Aguardando peer";
   }
   return "Nenhum arquivo selecionado";
 }
 
 function renderTargetLabel(label?: string) {
   if (!label) return null;
   return (
     <div className="space-y-1">
       <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Destino</span>
       <p className="text-sm text-[var(--text)]">{label}</p>
     </div>
   );
 }
 
 export function TransferBox({ file, transfer, onPickFile, onCancel, activeTransferId, hasConnectedPeers }: TransferBoxProps) {
+  const host = useTunnelStore((state) => state.host);
+  const [hostingLink, setHostingLink] = useState(false);
+  const [hostLinkError, setHostLinkError] = useState<string | null>(null);
+  const canHostFromFile = useMemo(() => Boolean(file?.source), [file?.source]);
   const badge = statusBadge(transfer);
   const progress = transfer ? Math.min(100, (transfer.bytesTransferred / Math.max(transfer.totalBytes, 1)) * 100) : 0;
   const elapsedSeconds = transfer ? Math.max(0, (transfer.updatedAt - transfer.startedAt) / 1000) : 0;
   const speedBytes = transfer && elapsedSeconds > 0 ? transfer.bytesTransferred / elapsedSeconds : 0;
   const eta = transfer ? formatEta(transfer.totalBytes - transfer.bytesTransferred, speedBytes) : "--";
   const statusLabel = computeStatusLabel({ file, transfer, hasConnectedPeers });
 
+  useEffect(() => {
+    setHostLinkError(null);
+    setHostingLink(false);
+  }, [file?.id]);
+
+  async function handleHostLink() {
+    if (!file) return;
+    if (!isTauri()) {
+      setHostLinkError("Disponível apenas no aplicativo desktop.");
+      return;
+    }
+    if (hostingLink) return;
+    setHostingLink(true);
+    setHostLinkError(null);
+    try {
+      let pathToHost: string | null = null;
+      if (file.source === "tauri" && file.path) {
+        pathToHost = file.path;
+      } else if (file.source === "web" && file.file) {
+        const [{ appCacheDir, join }, { createDir, writeBinaryFile }] = await Promise.all([
+          import("@tauri-apps/api/path"),
+          import("@tauri-apps/api/fs"),
+        ]);
+        const cacheDir = await appCacheDir();
+        const folder = await join(cacheDir, `fluxshare-host-${Date.now()}`);
+        await createDir(folder, { recursive: true });
+        const filename = file.name || `arquivo-${Date.now()}`;
+        const destination = await join(folder, filename);
+        const buffer = new Uint8Array(await file.file.arrayBuffer());
+        await writeBinaryFile({ path: destination, contents: buffer });
+        pathToHost = destination;
+      }
+
+      if (!pathToHost) {
+        setHostLinkError("Não foi possível preparar o arquivo para hospedagem.");
+        return;
+      }
+
+      await host([pathToHost], "cloudflared");
+      setHostLinkError(null);
+    } catch (error) {
+      const message = typeof error === "string" ? error : (error as Error).message;
+      setHostLinkError(message);
+    } finally {
+      setHostingLink(false);
+    }
+  }
+
   return (
     <Card className="flex h-full flex-col gap-6 p-6">
       <div className="flex flex-wrap items-start justify-between gap-4">
         <div className="space-y-2">
           <div className="flex items-center gap-3">
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
+            {canHostFromFile ? (
+              <>
+                <div className="flex flex-wrap gap-2">
+                  <Button type="button" variant="outline" onClick={handleHostLink} disabled={hostingLink}>
+                    {hostingLink ? "Gerando link..." : "Hospedar por link"}
+                  </Button>
+                </div>
+                {hostLinkError ? (
+                  <p className="text-xs text-[color-mix(in srgb,var(--danger) 70%,var(--text) 30%)]">{hostLinkError}</p>
+                ) : null}
+              </>
+            ) : null}
             {transfer ? (
               <div className="space-y-2">
                 <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
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
           <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 75%,transparent)] px-6 py-10 text-center text-sm text-[var(--muted)]">
diff --git a/apps/client/src/pages/Tunnel.tsx b/apps/client/src/pages/Tunnel.tsx
index 42fcccfa4c62fe1f7e6769836dfb37a64ee324fc..56dd3736ba7a457e79805817dd57617d8ab99b4d 100644
--- a/apps/client/src/pages/Tunnel.tsx
+++ b/apps/client/src/pages/Tunnel.tsx
@@ -1,147 +1,230 @@
-import { useEffect, useMemo, useRef } from "react";
+import { useEffect, useMemo, useRef, useState } from "react";
 import { useOutletContext } from "react-router-dom";
 import { AppOutletContext } from "../App";
 import { Card } from "../components/ui/Card";
 import { Button } from "../components/ui/Button";
 import { useTunnelStore } from "../state/useTunnelStore";
+import { isTauri } from "../lib/persist/tauri";
 
 const STATUS_LABEL: Record<"RUNNING" | "STOPPED", string> = {
   RUNNING: "Ativo",
   STOPPED: "Parado",
 };
 
 export default function TunnelPage() {
   const { setHeaderInfo } = useOutletContext<AppOutletContext>();
   const logContainerRef = useRef<HTMLDivElement | null>(null);
-  const { status, url, logs, loading, error, missingBinary, start, stop, refresh, clear } = useTunnelStore(
-    (state) => ({
-      status: state.status,
-      url: state.url,
-      logs: state.logs,
-      loading: state.loading,
-      error: state.error,
-      missingBinary: state.missingBinary,
-      start: state.start,
-      stop: state.stop,
-      refresh: state.refresh,
-      clear: state.clear,
-    }),
-  );
+  const [hostError, setHostError] = useState<string | null>(null);
+  const { status, url, localUrl, hostedFiles, logs, loading, error, missingBinary, start, host, stop, refresh, clear } =
+    useTunnelStore(
+      (state) => ({
+        status: state.status,
+        url: state.url,
+        localUrl: state.localUrl,
+        hostedFiles: state.hostedFiles,
+        logs: state.logs,
+        loading: state.loading,
+        error: state.error,
+        missingBinary: state.missingBinary,
+        start: state.start,
+        host: state.host,
+        stop: state.stop,
+        refresh: state.refresh,
+        clear: state.clear,
+      }),
+    );
 
   useEffect(() => {
     setHeaderInfo({});
     void refresh();
   }, [refresh, setHeaderInfo]);
 
   useEffect(() => {
     const element = logContainerRef.current;
     if (element) {
       element.scrollTop = element.scrollHeight;
     }
   }, [logs]);
 
-  const canCopy = useMemo(() => Boolean(url), [url]);
+  const canCopyPublic = useMemo(() => Boolean(url), [url]);
+  const canOpenLocal = useMemo(() => Boolean(localUrl), [localUrl]);
+  const canCopyLocal = canOpenLocal;
+  const hostedCount = useMemo(() => hostedFiles.length, [hostedFiles]);
 
   async function handleStart() {
     try {
       await start();
     } catch (err) {
       console.error("fluxshare:tunnel", err);
     }
   }
 
+  async function handleSelectAndHost() {
+    if (!isTauri()) {
+      setHostError("Disponível apenas no aplicativo desktop.");
+      return;
+    }
+    try {
+      const { open } = await import("@tauri-apps/api/dialog");
+      const selection = await open({ multiple: true, directory: false });
+      const normalized = Array.isArray(selection)
+        ? selection.filter((value): value is string => typeof value === "string" && value.length > 0)
+        : typeof selection === "string" && selection.length > 0
+          ? [selection]
+          : [];
+      if (normalized.length === 0) {
+        setHostError("Nenhum arquivo selecionado.");
+        return;
+      }
+      setHostError(null);
+      await host(normalized, "cloudflared");
+    } catch (err) {
+      const message = typeof err === "string" ? err : (err as Error).message;
+      setHostError(message);
+      console.error("fluxshare:tunnel:host", err);
+    }
+  }
+
   async function handleStop() {
     try {
       await stop();
     } catch (err) {
       console.error("fluxshare:tunnel", err);
     }
   }
 
-  async function handleCopy() {
-    if (!url) return;
+  async function handleCopy(target?: string | null) {
+    if (!target) return;
     try {
-      await navigator.clipboard?.writeText?.(url);
+      await navigator.clipboard?.writeText?.(target);
     } catch (err) {
       console.error("fluxshare:tunnel:copy", err);
     }
   }
 
+  function handleOpen(target?: string | null) {
+    if (!target) return;
+    try {
+      window.open(target, "_blank", "noopener,noreferrer");
+    } catch (err) {
+      console.error("fluxshare:tunnel:open", err);
+    }
+  }
+
   return (
     <div className="mx-auto max-w-5xl space-y-6 text-[var(--text)]">
       <div className="space-y-2">
         <h1 className="text-3xl font-semibold">Cloudflare Tunnel</h1>
         <p className="text-sm text-[var(--muted)]">
           Exponha sua instância local do FluxShare com um túnel seguro. O processo utiliza o binário oficial do Cloudflare e
           transmite os logs em tempo real.
         </p>
       </div>
 
       {missingBinary ? (
         <Card className="border border-[color-mix(in srgb,var(--primary) 35%,var(--border) 65%)] bg-[color-mix(in srgb,var(--surface) 85%,transparent)] p-4">
           <p className="text-sm text-[var(--text)]">
             <strong>cloudflared</strong> não foi encontrado no PATH. Instale o utilitário e tente novamente.
           </p>
         </Card>
       ) : null}
 
       {error ? (
         <Card className="border border-[color-mix(in srgb,var(--primary) 45%,var(--border) 55%)] bg-[color-mix(in srgb,var(--surface-2) 80%,transparent)] p-4">
           <p className="text-sm text-[var(--text)]">{error}</p>
         </Card>
       ) : null}
 
+      {hostError ? (
+        <Card className="border border-[color-mix(in srgb,var(--danger) 35%,var(--border) 65%)] bg-[color-mix(in srgb,var(--surface-2) 75%,transparent)] p-4">
+          <p className="text-sm text-[var(--text)]">{hostError}</p>
+        </Card>
+      ) : null}
+
       <Card className="space-y-4 p-6">
         <div className="flex flex-wrap items-start justify-between gap-4">
           <div>
             <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Status</p>
             <p className="text-lg font-medium text-[var(--text)]">{STATUS_LABEL[status]}</p>
           </div>
           <div className="flex flex-wrap gap-2">
+            <Button onClick={handleSelectAndHost} disabled={loading}>
+              {loading ? "Processando..." : "Selecionar arquivo(s) e gerar link"}
+            </Button>
             <Button onClick={handleStart} disabled={loading || status === "RUNNING"}>
               {loading && status !== "RUNNING" ? "Iniciando..." : "Iniciar Tunnel"}
             </Button>
             <Button variant="secondary" onClick={handleStop} disabled={loading || status === "STOPPED"}>
               {loading && status === "RUNNING" ? "Parando..." : "Parar Tunnel"}
             </Button>
-            <Button variant="ghost" onClick={handleCopy} disabled={!canCopy}>
-              Copiar URL
+            <Button variant="ghost" onClick={() => handleCopy(url)} disabled={!canCopyPublic}>
+              Copiar URL pública
             </Button>
           </div>
         </div>
 
-        <div className="space-y-2">
-          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">URL pública</p>
-          <div className="flex flex-wrap items-center gap-3">
-            <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm">
-              {url ?? "--"}
+        <div className="grid gap-4 md:grid-cols-2">
+          <div className="space-y-2">
+            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Link local</p>
+            <div className="flex flex-wrap items-center gap-3">
+              <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm">
+                {localUrl ?? "--"}
+              </div>
+            </div>
+            <div className="flex flex-wrap gap-2">
+              <Button variant="outline" onClick={() => handleOpen(localUrl)} disabled={!canOpenLocal}>
+                Abrir
+              </Button>
+              <Button variant="ghost" onClick={() => handleCopy(localUrl)} disabled={!canCopyLocal}>
+                Copiar
+              </Button>
             </div>
-            <Button variant="outline" onClick={clear} disabled={logs.length === 0}>
-              Limpar logs
-            </Button>
           </div>
+          <div className="space-y-2">
+            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Link público</p>
+            <div className="flex flex-wrap items-center gap-3">
+              <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm">
+                {url ?? "--"}
+              </div>
+            </div>
+            <div className="flex flex-wrap gap-2">
+              <Button variant="outline" onClick={() => handleOpen(url)} disabled={!canCopyPublic}>
+                Abrir
+              </Button>
+              <Button variant="ghost" onClick={() => handleCopy(url)} disabled={!canCopyPublic}>
+                Copiar
+              </Button>
+            </div>
+          </div>
+        </div>
+
+        <div className="flex flex-wrap items-center justify-between gap-3">
+          <p className="text-sm text-[var(--muted)]">Arquivos hospedados: {hostedCount}</p>
+          <Button variant="outline" onClick={clear} disabled={logs.length === 0}>
+            Limpar logs
+          </Button>
         </div>
       </Card>
 
       <Card className="space-y-3 p-6">
         <div className="flex items-center justify-between">
           <h2 className="text-lg font-semibold">Logs em tempo real</h2>
           <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
             Atualizar status
           </Button>
         </div>
         <div
           ref={logContainerRef}
           className="max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 font-mono text-xs"
         >
           {logs.length === 0 ? (
             <p className="text-[var(--muted)]">Nenhum log registrado ainda.</p>
           ) : (
             <ul className="space-y-1">
               {logs.map((line, index) => (
                 <li key={`${line}-${index}`} className="whitespace-pre-wrap break-words text-[var(--text)]">
                   {line}
                 </li>
               ))}
             </ul>
           )}
diff --git a/apps/client/src/state/useTunnelStore.ts b/apps/client/src/state/useTunnelStore.ts
index d8b32ed0db23ecb3ee457b45e24eb493c85222cf..5fcca12dffd8d2ebd8ec2d68a5ec1c545331d723 100644
--- a/apps/client/src/state/useTunnelStore.ts
+++ b/apps/client/src/state/useTunnelStore.ts
@@ -1,173 +1,244 @@
 import { create } from "zustand";
 import { invoke } from "@tauri-apps/api/tauri";
 import { listen } from "@tauri-apps/api/event";
 import { isTauri } from "../lib/persist/tauri";
 
 const LOG_EVENT = "fluxshare://tunnel-log"; // LLM-LOCK: must match backend EVENT_TUNNEL_LOG
 const STATUS_EVENT = "fluxshare://tunnel-status"; // LLM-LOCK: status event used by Admin page checks
 const STOPPED_EVENT = "tunnel:stopped"; // LLM-LOCK: backend exit notification contract
 const MAX_LOGS = 200;
 
 type TunnelLifecycle = "RUNNING" | "STOPPED";
 
+type HostedFileSummary = {
+  id: number;
+  name: string;
+  size: number;
+};
+
 type TunnelStatusPayload = {
   running: boolean;
   url?: string | null;
+  localPort?: number | null;
+  hostedFiles?: HostedFileSummary[];
 };
 
 type TunnelLogPayload = {
   line: string;
 };
 
 export interface TunnelStoreState {
   status: TunnelLifecycle;
   url: string | null;
+  localUrl: string | null;
+  hostedFiles: HostedFileSummary[];
   logs: string[];
   loading: boolean;
   error?: string;
   missingBinary: boolean;
   start(): Promise<void>;
+  host(files: string[], cfMode?: string): Promise<void>;
   stop(): Promise<void>;
   refresh(): Promise<void>;
   clear(): void;
 }
 
 function formatLog(message: string) {
   const time = new Date().toLocaleTimeString();
   return `[${time}] ${message}`;
 }
 
 function appendLog(logs: string[], message: string) {
   const next = [...logs, formatLog(message)];
   if (next.length > MAX_LOGS) {
     return next.slice(next.length - MAX_LOGS);
   }
   return next;
 }
 
-export const useTunnelStore = create<TunnelStoreState>((set, _get) => {
+type HostSessionInfo = {
+  localUrl: string;
+  publicUrl?: string | null;
+  files: HostedFileSummary[];
+};
+
+export const useTunnelStore = create<TunnelStoreState>((set, get) => {
   if (isTauri()) {
     listen<TunnelLogPayload>(LOG_EVENT, (event) => {
       const line = event.payload?.line ?? "";
       if (!line) return;
       set((state) => ({ logs: appendLog(state.logs, line) }));
     }).catch(() => undefined);
 
     listen<TunnelStatusPayload>(STATUS_EVENT, (event) => {
       const payload = event.payload ?? { running: false, url: null };
       set(() => ({
         status: payload.running ? "RUNNING" : "STOPPED",
         url: payload.url ?? null,
       }));
     }).catch(() => undefined);
 
     listen<number>(STOPPED_EVENT, (event) => {
       const rawCode = event.payload;
       const code = typeof rawCode === "number" ? rawCode : -1;
       set((state) => ({
         logs: appendLog(
           state.logs,
           `[Tunnel] Parado (code ${code}) — processo Cloudflare finalizado.`,
         ),
         status: "STOPPED",
         url: null,
       }));
     }).catch(() => undefined);
 
     void (async () => {
       try {
         const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
         set((state) => ({
           status: status.running ? "RUNNING" : "STOPPED",
           url: status.url ?? null,
           logs: status.running ? appendLog(state.logs, "Tunnel ativo.") : state.logs,
         }));
       } catch {
         // ignore initial status errors
       }
     })();
   }
 
   return {
     status: "STOPPED",
     url: null,
+    localUrl: null,
+    hostedFiles: [],
     logs: [],
     loading: false,
     error: undefined,
     missingBinary: false,
     async start() {
       if (!isTauri()) {
         set((state) => ({
           logs: appendLog(state.logs, "Tunnel disponível apenas no app desktop."),
           status: "STOPPED",
         }));
         return;
       }
       set({ loading: true, error: undefined });
       try {
         const response = (await invoke("start_tunnel")) as { public_url: string };
         set((state) => ({
           loading: false,
           status: "RUNNING",
           url: response.public_url,
+          localUrl: state.localUrl,
+          hostedFiles: state.hostedFiles,
           logs: appendLog(state.logs, `Tunnel iniciado: ${response.public_url}`),
           missingBinary: false,
         }));
+        void get().refresh();
       } catch (error) {
         const message = typeof error === "string" ? error : (error as Error).message;
         set((state) => ({
           loading: false,
           status: "STOPPED",
           logs: appendLog(state.logs, `Erro: ${message}`),
           error: message,
           missingBinary: /cloudflared/i.test(message),
         }));
         throw error;
       }
     },
+    async host(files, cfMode = "cloudflared") {
+      if (!isTauri()) {
+        set((state) => ({
+          logs: appendLog(state.logs, "Hospedagem disponível apenas no app desktop."),
+          error: "Hospedagem disponível apenas no app desktop.",
+        }));
+        return;
+      }
+      if (!files || files.length === 0) {
+        set((state) => ({
+          logs: appendLog(state.logs, "Selecione ao menos um arquivo para hospedar."),
+          error: "Nenhum arquivo selecionado.",
+        }));
+        return;
+      }
+      set({ loading: true, error: undefined });
+      try {
+        const response = (await invoke("start_host", { files, cfMode })) as HostSessionInfo;
+        set((state) => ({
+          loading: false,
+          status: response.publicUrl ? "RUNNING" : state.status,
+          url: response.publicUrl ?? state.url,
+          localUrl: response.localUrl,
+          hostedFiles: response.files ?? [],
+          logs: appendLog(
+            state.logs,
+            `Hospedagem iniciada com ${response.files.length} arquivo(s).`,
+          ),
+          missingBinary: false,
+        }));
+      } catch (error) {
+        const message = typeof error === "string" ? error : (error as Error).message;
+        set((state) => ({
+          loading: false,
+          logs: appendLog(state.logs, `Erro ao hospedar: ${message}`),
+          error: message,
+        }));
+        throw error;
+      }
+    },
     async stop() {
       if (!isTauri()) {
         set((state) => ({ logs: appendLog(state.logs, "Nenhum túnel ativo."), status: "STOPPED" }));
         return;
       }
       set({ loading: true });
       try {
-        await invoke("stop_tunnel");
+        await invoke("stop_host");
         set((state) => ({
           loading: false,
           status: "STOPPED",
           url: null,
+          localUrl: null,
+          hostedFiles: [],
           logs: appendLog(state.logs, "Tunnel parado."),
         }));
       } catch (error) {
         const message = typeof error === "string" ? error : (error as Error).message;
         set((state) => ({
           loading: false,
           logs: appendLog(state.logs, `Erro ao parar: ${message}`),
           error: message,
         }));
         throw error;
       }
     },
     async refresh() {
       if (!isTauri()) return;
       try {
         const status = (await invoke("tunnel_status")) as TunnelStatusPayload;
         set((state) => ({
           status: status.running ? "RUNNING" : "STOPPED",
           url: status.url ?? null,
+          localUrl:
+            typeof status.localPort === "number"
+              ? `http://127.0.0.1:${status.localPort}/`
+              : status.running
+                ? state.localUrl
+                : null,
+          hostedFiles: status.hostedFiles ?? state.hostedFiles,
           missingBinary: state.missingBinary,
         }));
       } catch (error) {
         const message = typeof error === "string" ? error : (error as Error).message;
         set((state) => ({
           logs: appendLog(state.logs, `Erro ao consultar status: ${message}`),
           error: message,
         }));
       }
     },
     clear() {
       set({ logs: [] });
     },
   };
 });
 
EOF
)