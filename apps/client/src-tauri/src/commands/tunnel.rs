use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::thread::JoinHandle as ThreadJoinHandle;
use std::time::Duration;

use axum::{response::Html, routing::get, Router};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::Manager;
use tokio::sync::oneshot;
use tokio::time::sleep;
use which::which;

const EVENT_TUNNEL_LOG: &str = "fluxshare://tunnel-log"; // LLM-LOCK: event name consumed by frontend listeners
const EVENT_TUNNEL_STATUS: &str = "fluxshare://tunnel-status"; // LLM-LOCK: status event contract with Admin page tests
const EVENT_TUNNEL_STOPPED: &str = "tunnel:stopped"; // LLM-LOCK: backend exit notification consumed by frontend logger
const URL_DETECTION_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Default)]
struct TunnelState {
    child: Option<Child>,
    url: Option<String>,
    log_handles: Vec<ThreadJoinHandle<()>>,
    server_handle: Option<tauri::async_runtime::JoinHandle<()>>,
    server_shutdown: Option<oneshot::Sender<()>>,
    server_port: Option<u16>,
    exit_monitor: Option<tauri::async_runtime::JoinHandle<()>>,
}

#[derive(Default, Clone)]
pub struct TunnelManager {
    pub(super) inner: Arc<Mutex<TunnelState>>,
}

#[derive(Clone, serde::Serialize)]
pub struct TunnelInfo {
    pub public_url: String,
}

#[derive(Clone, serde::Serialize)]
pub struct TunnelStatus {
    pub running: bool,
    pub url: Option<String>,
}

#[derive(Clone, serde::Serialize)]
struct TunnelLogPayload {
    line: String,
}

#[derive(Clone, serde::Serialize)]
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
    let _ = app.emit_all(
        EVENT_TUNNEL_STATUS,
        TunnelStatusPayload {
            running,
            url,
        },
    );
}

fn emit_tunnel_stopped(app: &tauri::AppHandle, code: Option<i32>) -> i32 {
    let resolved = code.unwrap_or(-1);
    tracing::info!(code = resolved, "cloudflare_tunnel_exited");
    let _ = app.emit_all(EVENT_TUNNEL_STOPPED, resolved);
    resolved
}

async fn finalize_tunnel_exit(
    app: &tauri::AppHandle,
    manager: &TunnelManager,
    code: Option<i32>,
) {
    let exit_code = emit_tunnel_stopped(app, code);
    emit_status(app, false, None);
    let (log_handles, server_shutdown, server_handle) = {
        let mut state = manager.inner.lock();
        state.child = None;
        state.url = None;
        state.server_port = None;
        state.exit_monitor = None;
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
    if let Some(handle) = &state.server_handle {
        handle.abort();
    }
    if let Some(handle) = &state.exit_monitor {
        handle.abort();
    }
}

async fn ensure_http_server(manager: &TunnelManager) -> Result<u16, String> {
    {
        let mut state = manager.inner.lock();
        cleanup_finished(&mut state);
        if let Some(port) = state.server_port {
            if let Some(handle) = &state.server_handle {
                handle.abort();
            } else {
                return Ok(port);
            }
        }
    }

    let (ready_tx, ready_rx) = oneshot::channel::<Result<u16, String>>();
    let (shutdown_tx, shutdown_rx) = oneshot::channel();

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
            .route(
                "/",
                get(|| async {
                    Html("<h1>FluxShare</h1><p>Tunnel ativo e pronto para receber conexões.</p>")
                }),
            )
            .route(
                "/health",
                get(|| async { Html("ok") }),
            );

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

#[tauri::command]
pub async fn start_tunnel(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TunnelManager>,
) -> Result<TunnelInfo, String> {
    {
        let mut state = manager.inner.lock();
        cleanup_finished(&mut state);
        if let Some(child) = state.child.as_mut() {
            if child.try_wait().map_err(|e| e.to_string())?.is_none() {
                if let Some(url) = state.url.clone() {
                    return Ok(TunnelInfo { public_url: url });
                }
            }
        }
    }

    let port = ensure_http_server(&manager).await?;
    let binary = which("cloudflared").map_err(|_| "cloudflared não encontrado no PATH".to_string())?;
    emit_log(
        &app,
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
            manager.inner().clone(),
            url_tx.clone(),
        ));
    }
    if let Some(reader) = stderr {
        log_handles.push(spawn_log_reader(
            reader,
            "stderr",
            app.clone(),
            manager.inner().clone(),
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

    let exit_monitor = spawn_exit_monitor(app.clone(), manager.inner().clone());
    {
        let mut state = manager.inner.lock();
        state.exit_monitor = Some(exit_monitor);
    }

    emit_status(&app, true, Some(url.clone()));
    Ok(TunnelInfo { public_url: url })
}

#[tauri::command]
pub async fn stop_tunnel(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TunnelManager>,
) -> Result<(), String> {
    let (
        exit_status,
        mut log_handles,
        server_shutdown,
        server_handle,
        monitor_handle,
    ) = {
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
    let code = emit_tunnel_stopped(&app, exit_code);
    emit_status(&app, false, None);
    emit_log(&app, &format!("Tunnel parado (código {code})."));
    Ok(())
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
    Ok(TunnelStatus {
        running,
        url: state.url.clone(),
    })
}
