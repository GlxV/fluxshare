use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use serde::Serialize;

use super::settings::SettingsManager;

#[derive(Default, Clone)]
pub struct TunnelManager {
    inner: Arc<Mutex<TunnelState>>,
}

#[derive(Default)]
struct TunnelState {
    child: Option<Child>,
    url: Option<String>,
}

#[derive(Serialize)]
pub struct TunnelInfo {
    pub public_url: String,
}

#[tauri::command]
pub fn start_tunnel(
    manager: tauri::State<'_, TunnelManager>,
    settings: tauri::State<'_, SettingsManager>,
    local_port: u16,
) -> Result<TunnelInfo, String> {
    {
        let state = manager.inner.lock();
        if state.child.is_some() {
            if let Some(url) = state.url.clone() {
                return Ok(TunnelInfo { public_url: url });
            }
        }
    }

    let settings = settings.get_settings().map_err(|e| e.to_string())?;
    let mut child = Command::new(&settings.cloudflared_path)
        .args(["tunnel", "--url", &format!("http://127.0.0.1:{local_port}")])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("falha ao iniciar cloudflared: {e}"))?;

    let stdout = child.stdout.take().map(BufReader::new);
    let stderr = child.stderr.take().map(BufReader::new);

    let (tx, rx) = std::sync::mpsc::channel();
    let state_arc = manager.inner.clone();
    std::thread::spawn(move || {
        let mut found_url: Option<String> = None;
        if let Some(reader) = stdout {
            if let Some(url) = read_for_url(reader) {
                let _ = tx.send(url.clone());
                found_url = Some(url);
            }
        }
        if found_url.is_none() {
            if let Some(reader) = stderr {
                if let Some(url) = read_for_url(reader) {
                    let _ = tx.send(url.clone());
                    found_url = Some(url);
                }
            }
        }
        if let Some(url) = found_url {
            let mut state = state_arc.lock();
            state.url = Some(url);
        }
    });

    let url = rx
        .recv_timeout(Duration::from_secs(15))
        .map_err(|_| "não foi possível detectar URL do tunnel".to_string())?;

    {
        let mut state = manager.inner.lock();
        state.child = Some(child);
        state.url = Some(url.clone());
    }

    Ok(TunnelInfo { public_url: url })
}

#[tauri::command]
pub fn stop_tunnel(manager: tauri::State<'_, TunnelManager>) -> Result<(), String> {
    let mut state = manager.inner.lock();
    if let Some(mut child) = state.child.take() {
        child.kill().ok();
        child.wait().ok();
    }
    state.url = None;
    Ok(())
}

fn extract_url(line: &str) -> Option<String> {
    line.split_whitespace()
        .find(|segment| segment.contains("trycloudflare.com"))
        .map(|s| s.trim_matches(|c: char| c == '"'))
        .map(|s| s.to_string())
}

fn read_for_url<R: BufRead>(reader: R) -> Option<String> {
    for line in reader.lines().flatten() {
        if let Some(url) = extract_url(&line) {
            return Some(url);
        }
    }
    None
}
