use std::collections::VecDeque;
use std::fs;
use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use tauri::Manager;

pub const EVENT_EXPLORER_SHARE_REQUEST: &str = "fluxshare://explorer-share-request";
pub const EXPLORER_SHARE_FLAG: &str = "--explorer-share";

const IPC_CONNECT_TIMEOUT: Duration = Duration::from_millis(700);
const IPC_IO_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerShareRequest {
    pub id: u64,
    pub paths: Vec<String>,
    pub source: String,
    pub received_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct SingleInstanceState {
    port: u16,
    token: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SingleInstanceMessage {
    token: String,
    cwd: Option<String>,
    paths: Vec<String>,
}

#[derive(Clone)]
pub struct LaunchRequestManager {
    pending: Arc<Mutex<VecDeque<ExplorerShareRequest>>>,
    next_id: Arc<AtomicU64>,
    app: Arc<Mutex<Option<tauri::AppHandle>>>,
}

impl Default for LaunchRequestManager {
    fn default() -> Self {
        Self {
            pending: Arc::new(Mutex::new(VecDeque::new())),
            next_id: Arc::new(AtomicU64::new(1)),
            app: Arc::new(Mutex::new(None)),
        }
    }
}

impl LaunchRequestManager {
    pub fn with_initial_paths(paths: Vec<String>) -> Self {
        let manager = Self::default();
        if !paths.is_empty() {
            manager.enqueue_paths(paths, "launch");
        }
        manager
    }

    pub fn attach_app(&self, app: tauri::AppHandle) {
        *self.app.lock() = Some(app);
    }

    pub fn enqueue_paths(&self, paths: Vec<String>, source: &str) -> Option<ExplorerShareRequest> {
        let normalized = normalize_paths(paths);
        if normalized.is_empty() {
            return None;
        }

        let request = ExplorerShareRequest {
            id: self.next_id.fetch_add(1, Ordering::Relaxed),
            paths: normalized,
            source: source.to_string(),
            received_at: now_ms(),
        };

        self.pending.lock().push_back(request.clone());
        Some(request)
    }

    pub fn take_pending(&self) -> Vec<ExplorerShareRequest> {
        let mut pending = self.pending.lock();
        pending.drain(..).collect()
    }

    fn app_handle(&self) -> Option<tauri::AppHandle> {
        self.app.lock().clone()
    }
}

pub struct SingleInstanceServer {
    listener: TcpListener,
    state_path: PathBuf,
    token: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn runtime_state_path() -> PathBuf {
    if let Ok(custom) = std::env::var("FLUXSHARE_DATA_DIR") {
        return PathBuf::from(custom)
            .join("runtime")
            .join("single-instance.json");
    }
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(".fluxshare")
        .join("runtime")
        .join("single-instance.json")
}

fn normalize_paths(paths: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for path in paths {
        let trimmed = path.trim().trim_matches('"').trim_matches('\'');
        if trimmed.is_empty() {
            continue;
        }
        let candidate = PathBuf::from(trimmed);
        let path = candidate
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(trimmed));
        let as_string = path.to_string_lossy().to_string();
        if !normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&as_string))
        {
            normalized.push(as_string);
        }
    }
    normalized
}

pub fn collect_share_paths_from_args<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut paths = Vec::new();
    let mut awaiting_path = false;

    for raw in args.into_iter().skip(1) {
        let arg = raw.into();
        if awaiting_path {
            paths.push(arg);
            awaiting_path = false;
            continue;
        }

        if arg == EXPLORER_SHARE_FLAG {
            awaiting_path = true;
            continue;
        }

        if let Some(value) = arg.strip_prefix("--explorer-share=") {
            paths.push(value.to_string());
        }
    }

    normalize_paths(paths)
}

pub fn try_forward_to_existing_instance(paths: Vec<String>) -> anyhow::Result<bool> {
    let state_path = runtime_state_path();
    let state = match fs::read_to_string(&state_path) {
        Ok(contents) => serde_json::from_str::<SingleInstanceState>(&contents)?,
        Err(_) => return Ok(false),
    };

    let address = format!("127.0.0.1:{}", state.port);
    let socket_address = match address.parse() {
        Ok(address) => address,
        Err(_) => return Ok(false),
    };

    let cwd = std::env::current_dir()
        .ok()
        .map(|path| path.to_string_lossy().to_string());

    let mut stream = match TcpStream::connect_timeout(&socket_address, IPC_CONNECT_TIMEOUT) {
        Ok(stream) => stream,
        Err(_) => return Ok(false),
    };

    let request = SingleInstanceMessage {
        token: state.token,
        cwd,
        paths,
    };
    let payload = serde_json::to_vec(&request)?;

    stream.set_read_timeout(Some(IPC_IO_TIMEOUT))?;
    stream.set_write_timeout(Some(IPC_IO_TIMEOUT))?;
    stream.write_all(&payload)?;
    stream.shutdown(Shutdown::Write)?;

    let mut response = String::new();
    stream.read_to_string(&mut response)?;
    Ok(response.trim() == "ok")
}

pub fn start_single_instance_server(manager: LaunchRequestManager) -> anyhow::Result<()> {
    let state_path = runtime_state_path();
    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    listener.set_nonblocking(false)?;

    let token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    let port = listener.local_addr()?.port();

    let state = SingleInstanceState {
        port,
        token: token.clone(),
    };
    fs::write(&state_path, serde_json::to_vec_pretty(&state)?)?;

    let server = SingleInstanceServer {
        listener,
        state_path,
        token,
    };

    thread::spawn(move || run_single_instance_server(server, manager));
    Ok(())
}

fn run_single_instance_server(server: SingleInstanceServer, manager: LaunchRequestManager) {
    let SingleInstanceServer {
        listener,
        state_path,
        token,
    } = server;

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                let _ = stream.set_read_timeout(Some(IPC_IO_TIMEOUT));
                let _ = stream.set_write_timeout(Some(IPC_IO_TIMEOUT));

                let mut payload = String::new();
                if stream.read_to_string(&mut payload).is_err() {
                    let _ = stream.write_all(b"error");
                    continue;
                }

                let message = match serde_json::from_str::<SingleInstanceMessage>(&payload) {
                    Ok(message) if message.token == token => message,
                    _ => {
                        let _ = stream.write_all(b"error");
                        continue;
                    }
                };

                if let Some(request) = manager.enqueue_paths(message.paths, "ipc") {
                    if let Some(app) = manager.app_handle() {
                        focus_main_window(&app);
                        let _ = app.emit_all(EVENT_EXPLORER_SHARE_REQUEST, request);
                    }
                } else if let Some(app) = manager.app_handle() {
                    focus_main_window(&app);
                }

                let _ = stream.write_all(b"ok");
            }
            Err(error) => {
                tracing::error!(?error, "single_instance_listener_error");
                break;
            }
        }
    }

    let _ = fs::remove_file(state_path);
}

pub fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn consume_pending_explorer_share_requests(
    manager: tauri::State<'_, LaunchRequestManager>,
) -> Result<Vec<ExplorerShareRequest>, String> {
    Ok(manager.take_pending())
}

#[cfg(test)]
mod tests {
    use super::{collect_share_paths_from_args, EXPLORER_SHARE_FLAG};

    #[test]
    fn collects_share_paths_from_split_flag() {
        let paths = collect_share_paths_from_args([
            "FluxShare.exe".to_string(),
            EXPLORER_SHARE_FLAG.to_string(),
            r"C:\Temp\file one.txt".to_string(),
        ]);

        assert_eq!(paths, vec![r"C:\Temp\file one.txt".to_string()]);
    }

    #[test]
    fn collects_share_paths_from_inline_flag() {
        let paths = collect_share_paths_from_args([
            "FluxShare.exe".to_string(),
            r"--explorer-share=C:\Temp\file two.txt".to_string(),
        ]);

        assert_eq!(paths, vec![r"C:\Temp\file two.txt".to_string()]);
    }
}
