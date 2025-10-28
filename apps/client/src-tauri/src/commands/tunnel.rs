use std::fmt::Write as FmtWrite;
use std::fs;
use std::io::{BufRead, BufReader, SeekFrom};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::thread::JoinHandle as ThreadJoinHandle;
use std::time::Duration;

use axum::{
    body::StreamBody,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use html_escape::encode_text;
use parking_lot::Mutex;
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use serde::Serialize;
use tauri::Manager;
use tokio::sync::oneshot;
use tokio::time::sleep;
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt},
};
use tokio_util::io::ReaderStream;
use which::which;

const EVENT_TUNNEL_LOG: &str = "fluxshare://tunnel-log"; // LLM-LOCK: event name consumed by frontend listeners
const EVENT_TUNNEL_STATUS: &str = "fluxshare://tunnel-status"; // LLM-LOCK: status event contract with Admin page tests
const EVENT_TUNNEL_STOPPED: &str = "tunnel:stopped"; // LLM-LOCK: backend exit notification consumed by frontend logger
const URL_DETECTION_TIMEOUT: Duration = Duration::from_secs(20);

const FILENAME_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b'\0')
    .add(b'"')
    .add(b'%')
    .add(b'\'')
    .add(b'(')
    .add(b')')
    .add(b';')
    .add(b'=')
    .add(b'@')
    .add(b'[')
    .add(b']')
    .add(b'{')
    .add(b'}')
    .add(b'<')
    .add(b'>')
    .add(b'/')
    .add(b'?')
    .add(b':')
    .add(b'\\')
    .add(b'|')
    .add(b'*')
    .add(b'&')
    .add(b'#')
    .add(b'+')
    .add(b'^')
    .add(b'`')
    .add(b'$');

#[derive(Clone)]
struct HostedFile {
    id: u64,
    path: PathBuf,
    name: String,
    size: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostedFileSummary {
    pub id: u64,
    pub name: String,
    pub size: u64,
}

#[derive(Clone)]
struct ServerState {
    manager: TunnelManager,
}

#[derive(Default)]
struct TunnelState {
    child: Option<Child>,
    url: Option<String>,
    log_handles: Vec<ThreadJoinHandle<()>>,
    server_handle: Option<tauri::async_runtime::JoinHandle<()>>,
    server_shutdown: Option<oneshot::Sender<()>>,
    server_port: Option<u16>,
    exit_monitor: Option<tauri::async_runtime::JoinHandle<()>>,
    files: Vec<HostedFile>,
    next_file_id: u64,
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
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub running: bool,
    pub url: Option<String>,
    pub local_port: Option<u16>,
    pub hosted_files: Vec<HostedFileSummary>,
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
    let _ = app.emit_all(EVENT_TUNNEL_STATUS, TunnelStatusPayload { running, url });
}

fn emit_tunnel_stopped(app: &tauri::AppHandle, code: Option<i32>) -> i32 {
    let resolved = code.unwrap_or(-1);
    tracing::info!(code = resolved, "cloudflare_tunnel_exited");
    let _ = app.emit_all(EVENT_TUNNEL_STOPPED, resolved);
    resolved
}

async fn finalize_tunnel_exit(app: &tauri::AppHandle, manager: &TunnelManager, code: Option<i32>) {
    let exit_code = emit_tunnel_stopped(app, code);
    emit_status(app, false, None);
    let (log_handles, server_shutdown, server_handle) = {
        let mut state = manager.inner.lock();
        state.child = None;
        state.url = None;
        state.server_port = None;
        state.exit_monitor = None;
        state.files.clear();
        state.next_file_id = 0;
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

fn spawn_exit_monitor(
    app: tauri::AppHandle,
    manager: TunnelManager,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            let outcome = {
                let mut state = manager.inner.lock();
                if let Some(child) = state.child.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => Some(Ok(status)),
                        Ok(None) => None,
                        Err(error) => Some(Err(error)),
                    }
                } else {
                    state.exit_monitor = None;
                    return;
                }
            };

            match outcome {
                Some(Ok(status)) => {
                    finalize_tunnel_exit(&app, &manager, status.code()).await;
                    return;
                }
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
}

fn ascii_filename_fallback(name: &str) -> String {
    let mut fallback = String::with_capacity(name.len());
    for ch in name.chars() {
        if ch.is_ascii() {
            match ch {
                '"' | '\\' | '/' | ':' | '*' | '?' | '|' | '<' | '>' => fallback.push('_'),
                _ if ch.is_control() => fallback.push('_'),
                _ => fallback.push(ch),
            }
        } else {
            fallback.push('_');
        }
    }
    if fallback.trim().is_empty() {
        "download".into()
    } else {
        fallback
    }
}

fn format_file_size(size: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if size == 0 {
        return "0 B".into();
    }
    let mut value = size as f64;
    let mut unit_index = 0usize;
    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }
    if unit_index == 0 {
        format!("{size} {}", UNITS[unit_index])
    } else {
        format!("{value:.2} {}", UNITS[unit_index])
    }
}

fn summarize_files(files: &[HostedFile]) -> Vec<HostedFileSummary> {
    files
        .iter()
        .map(|file| HostedFileSummary {
            id: file.id,
            name: file.name.clone(),
            size: file.size,
        })
        .collect()
}

fn render_index_page(files: &[HostedFileSummary]) -> String {
    let mut html = String::new();
    let _ = write!(
        html,
        "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\" />\
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\
<title>FluxShare</title>\
<style>body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:2.5rem;}}\
.container{{max-width:720px;margin:0 auto;}}\
h1{{font-size:2rem;margin-bottom:0.5rem;}}\
p.subtitle{{margin-top:0;margin-bottom:1.5rem;color:#94a3b8;}}\
ul{{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.75rem;}}\
li{{background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);border-radius:0.75rem;padding:1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;}}\
a{{color:#38bdf8;text-decoration:none;font-weight:600;}}\
a:hover{{text-decoration:underline;}}\
.empty{{padding:1.5rem;border-radius:0.75rem;border:1px dashed rgba(148,163,184,0.4);color:#94a3b8;background:rgba(148,163,184,0.08);}}\
.size{{font-size:0.875rem;color:#cbd5f5;}}\
</style></head><body><div class=\"container\"><h1>FluxShare</h1><p class=\"subtitle\">Arquivos hospedados via FluxShare.</p>"
    );

    if files.is_empty() {
        html.push_str("<div class=\"empty\">Nenhum arquivo hospedado.</div>");
    } else {
        html.push_str("<ul>");
        for file in files {
            let _ = write!(
                html,
                "<li><a href=\"/download/{id}\">{name}</a><span class=\"size\">{size}</span></li>",
                id = file.id,
                name = encode_text(&file.name),
                size = encode_text(&format_file_size(file.size)),
            );
        }
        html.push_str("</ul>");
    }

    html.push_str("</div></body></html>");
    html
}

async fn index_handler(State(state): State<ServerState>) -> Html<String> {
    let summaries = {
        let state_guard = state.manager.inner.lock();
        summarize_files(&state_guard.files)
    };
    Html(render_index_page(&summaries))
}

fn parse_range_header(value: &str, total_size: u64) -> Result<Option<(u64, u64)>, ()> {
    let trimmed = value.trim();
    if !trimmed.starts_with("bytes=") {
        return Err(());
    }
    let ranges = &trimmed[6..];
    if ranges.contains(',') {
        return Err(());
    }
    if ranges.is_empty() {
        return Err(());
    }
    if total_size == 0 {
        return Err(());
    }
    if let Some(rest) = ranges.strip_prefix('-') {
        let suffix: u64 = rest.parse().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        let length = suffix.min(total_size);
        let end = total_size - 1;
        let start = total_size - length;
        return Ok(Some((start, end)));
    }
    let (start_str, end_str) = ranges.split_once('-').ok_or(())?;
    let start: u64 = start_str.parse().map_err(|_| ())?;
    let end: u64 = if end_str.is_empty() {
        total_size.checked_sub(1).ok_or(())?
    } else {
        end_str.parse().map_err(|_| ())?
    };
    if start > end || end >= total_size {
        return Err(());
    }
    Ok(Some((start, end)))
}

async fn download_handler(
    State(state): State<ServerState>,
    Path(id): Path<u64>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    let file = {
        let state_guard = state.manager.inner.lock();
        state_guard.files.iter().find(|file| file.id == id).cloned()
    };

    let file = file.ok_or(StatusCode::NOT_FOUND)?;
    let mut handle = File::open(&file.path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let mut status = StatusCode::OK;
    let mut start = 0u64;
    let mut end = if file.size == 0 {
        0
    } else {
        file.size.saturating_sub(1)
    };

    if let Some(range_header) = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
    {
        match parse_range_header(range_header, file.size) {
            Ok(Some((s, e))) => {
                start = s;
                end = e;
                status = StatusCode::PARTIAL_CONTENT;
            }
            Ok(None) => {}
            Err(_) => return Err(StatusCode::RANGE_NOT_SATISFIABLE),
        }
    }

    let bytes_to_read = if file.size == 0 {
        0
    } else {
        end.saturating_sub(start).saturating_add(1)
    };

    if bytes_to_read > 0 {
        handle
            .seek(SeekFrom::Start(start))
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let stream = ReaderStream::new(handle.take(bytes_to_read));
    let mut response = StreamBody::new(stream).into_response();
    *response.status_mut() = status;

    if let Ok(value) = HeaderValue::from_str(&bytes_to_read.to_string()) {
        response.headers_mut().insert(header::CONTENT_LENGTH, value);
    }
    response
        .headers_mut()
        .insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));

    if status == StatusCode::PARTIAL_CONTENT {
        if let Ok(value) =
            HeaderValue::from_str(&format!("bytes {start}-{end}/{total}", total = file.size))
        {
            response.headers_mut().insert(header::CONTENT_RANGE, value);
        }
    }

    let ascii_name = ascii_filename_fallback(&file.name);
    let encoded_name = utf8_percent_encode(&file.name, FILENAME_ENCODE_SET).to_string();
    let disposition = format!(
        "attachment; filename=\"{}\"; filename*=UTF-8''{}",
        ascii_name, encoded_name
    );
    if let Ok(value) = HeaderValue::from_str(&disposition) {
        response
            .headers_mut()
            .insert(header::CONTENT_DISPOSITION, value);
    }
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );

    Ok(response)
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
    let server_manager = manager.clone();

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
            .route("/", get(index_handler))
            .route("/download/:id", get(download_handler))
            .route("/health", get(|| async { Html("ok") }))
            .with_state(ServerState {
                manager: server_manager.clone(),
            });

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

fn spawn_log_reader<R: BufRead + Send + 'static>(
    reader: R,
    source: &'static str,
    app: tauri::AppHandle,
    manager: TunnelManager,
    url_sender: std::sync::mpsc::Sender<String>,
) -> ThreadJoinHandle<()> {
    std::thread::spawn(move || {
        for line in reader.lines().flatten() {
            let formatted = format!("[{source}] {line}");
            emit_log(&app, &formatted);
            if let Some(url) = extract_url(&line) {
                let _ = url_sender.send(url.clone());
                {
                    let mut state = manager.inner.lock();
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

async fn start_cloudflared(
    app: &tauri::AppHandle,
    manager: &TunnelManager,
) -> Result<String, String> {
    {
        let mut state = manager.inner.lock();
        cleanup_finished(&mut state);
        if let Some(child) = state.child.as_mut() {
            if child.try_wait().map_err(|e| e.to_string())?.is_none() {
                if let Some(url) = state.url.clone() {
                    return Ok(url);
                }
            }
        }
    }

    let port = ensure_http_server(manager).await?;
    let binary =
        which("cloudflared").map_err(|_| "cloudflared não encontrado no PATH".to_string())?;
    emit_log(
        app,
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
            manager.clone(),
            url_tx.clone(),
        ));
    }
    if let Some(reader) = stderr {
        log_handles.push(spawn_log_reader(
            reader,
            "stderr",
            app.clone(),
            manager.clone(),
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

    let exit_monitor = spawn_exit_monitor(app.clone(), manager.clone());
    {
        let mut state = manager.inner.lock();
        state.exit_monitor = Some(exit_monitor);
    }

    emit_status(app, true, Some(url.clone()));
    Ok(url)
}

async fn stop_all(app: &tauri::AppHandle, manager: &TunnelManager) -> Result<(), String> {
    let (exit_status, mut log_handles, server_shutdown, server_handle, monitor_handle) = {
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
        state.files.clear();
        state.next_file_id = 0;
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
    let code = emit_tunnel_stopped(app, exit_code);
    emit_status(app, false, None);
    emit_log(app, &format!("Tunnel parado (código {code})."));
    Ok(())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostSessionInfo {
    pub local_url: String,
    pub public_url: Option<String>,
    pub files: Vec<HostedFileSummary>,
}

#[tauri::command]
pub async fn start_host(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TunnelManager>,
    files: Vec<String>,
    cf_mode: Option<String>,
) -> Result<HostSessionInfo, String> {
    if files.is_empty() {
        return Err("no files provided".to_string());
    }

    let prepared = files
        .into_iter()
        .map(|raw| {
            let path = PathBuf::from(&raw);
            if !path.exists() {
                return Err(format!("arquivo não encontrado: {raw}"));
            }
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("falha ao ler arquivo {raw}: {error}"))?;
            if !metadata.is_file() {
                return Err(format!("caminho não é um arquivo: {raw}"));
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| raw.clone());
            Ok((path, name, metadata.len()))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let summaries = {
        let mut state = manager.inner.lock();
        cleanup_finished(&mut state);
        state.files.clear();
        state.next_file_id = 0;
        let mut stored = Vec::with_capacity(prepared.len());
        for (path, name, size) in prepared {
            let id = state.next_file_id;
            state.next_file_id += 1;
            stored.push(HostedFile {
                id,
                path,
                name,
                size,
            });
        }
        state.files = stored;
        summarize_files(&state.files)
    };

    let port = ensure_http_server(&manager).await?;
    let local_url = format!("http://127.0.0.1:{port}/");

    if summaries.is_empty() {
        emit_log(&app, "Hosted 0 files.");
    } else {
        let names = summaries
            .iter()
            .map(|file| file.name.clone())
            .collect::<Vec<_>>()
            .join(", ");
        emit_log(&app, &format!("Hosted {} files: {names}", summaries.len()));
    }

    let wants_tunnel = cf_mode
        .as_deref()
        .map(|mode| mode.eq_ignore_ascii_case("cloudflared"))
        .unwrap_or(false);

    let public_url = if wants_tunnel {
        Some(start_cloudflared(&app, &manager).await?)
    } else {
        let state = manager.inner.lock();
        state.url.clone()
    };

    Ok(HostSessionInfo {
        local_url,
        public_url,
        files: summaries,
    })
}

#[tauri::command]
pub async fn start_tunnel(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TunnelManager>,
) -> Result<TunnelInfo, String> {
    let url = start_cloudflared(&app, &manager).await?;
    Ok(TunnelInfo { public_url: url })
}

#[tauri::command]
pub async fn stop_tunnel(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TunnelManager>,
) -> Result<(), String> {
    stop_all(&app, &manager).await
}

#[tauri::command]
pub async fn stop_host(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TunnelManager>,
) -> Result<(), String> {
    stop_all(&app, &manager).await
}

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
    let files = summarize_files(&state.files);
    Ok(TunnelStatus {
        running,
        url: state.url.clone(),
        local_port: state.server_port,
        hosted_files: files,
    })
}
