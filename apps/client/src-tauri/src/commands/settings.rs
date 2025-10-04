use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub chunk_size: u64,
    pub parallel_chunks: u32,
    pub ice_timeout_ms: u64,
    pub cloudflared_path: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            chunk_size: 1024 * 1024,
            parallel_chunks: 4,
            ice_timeout_ms: 30_000,
            cloudflared_path: "cloudflared".into(),
        }
    }
}

#[derive(Clone)]
pub struct SettingsManager {
    inner: Arc<Mutex<Settings>>,
    path: Arc<PathBuf>,
}

impl Default for SettingsManager {
    fn default() -> Self {
        let path = settings_path();
        let settings = load_settings(&path).unwrap_or_default();
        Self {
            inner: Arc::new(Mutex::new(settings)),
            path: Arc::new(path),
        }
    }
}

impl SettingsManager {
    pub fn ensure_initialized(&self) -> anyhow::Result<()> {
        if !self.path.exists() {
            if let Some(parent) = self.path.parent() {
                fs::create_dir_all(parent)?;
            }
            let defaults = Settings::default();
            fs::write(&*self.path, serde_json::to_string_pretty(&defaults)?)?;
        }
        Ok(())
    }

    pub fn get_settings(&self) -> anyhow::Result<Settings> {
        Ok(self.inner.lock().clone())
    }

    pub fn update(&self, settings: Settings) -> anyhow::Result<()> {
        *self.inner.lock() = settings.clone();
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&*self.path, serde_json::to_string_pretty(&settings)?)?;
        Ok(())
    }
}

fn settings_path() -> PathBuf {
    if let Ok(custom) = std::env::var("FLUXSHARE_DATA_DIR") {
        return PathBuf::from(custom).join("settings.json");
    }
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(".fluxshare").join("settings.json")
}

fn load_settings(path: &PathBuf) -> Option<Settings> {
    let data = fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

#[tauri::command]
pub fn get_settings(manager: tauri::State<'_, SettingsManager>) -> Result<Settings, String> {
    manager.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_settings(
    manager: tauri::State<'_, SettingsManager>,
    settings: Settings,
) -> Result<(), String> {
    manager.update(settings).map_err(|e| e.to_string())
}
