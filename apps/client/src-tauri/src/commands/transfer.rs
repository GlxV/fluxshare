use chacha20poly1305::KeyInit;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::Context;
use argon2::Argon2;
use blake3::Hasher;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileProgress {
    pub path: String,
    pub transferred: u64,
    pub total: u64,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferStatus {
    pub session_id: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub file_progress: Vec<FileProgress>,
    pub rate: f64,
    pub eta_seconds: Option<f64>,
    pub state: String,
    #[serde(skip, default = "instant_now")]
    pub started_at: Instant,
}

fn instant_now() -> Instant {
    Instant::now()
}

impl TransferStatus {
    fn new(session_id: String, files: &[FileEntry]) -> Self {
        let total = files.iter().map(|f| f.size).sum();
        Self {
            session_id,
            total_bytes: total,
            transferred_bytes: 0,
            file_progress: files
                .iter()
                .map(|f| FileProgress {
                    path: f.path.clone(),
                    transferred: 0,
                    total: f.size,
                    done: false,
                })
                .collect(),
            rate: 0.0,
            eta_seconds: None,
            state: "pending".into(),
            started_at: Instant::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendOptions {
    #[serde(default)]
    pub encrypt: bool,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChunkInfo {
    pub index: u64,
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FileManifest {
    pub path: String,
    pub chunks: Vec<ChunkInfo>,
    pub final_hash: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TransferManifest {
    pub session_id: String,
    pub encrypted: bool,
    pub files: HashMap<String, FileManifest>,
}

#[derive(Clone, Default)]
pub struct TransferManager {
    inner: Arc<Mutex<HashMap<String, TransferStatus>>>,
}

impl TransferManager {
    pub fn set_status(&self, session_id: String, status: TransferStatus) {
        self.inner.lock().insert(session_id, status);
    }

    pub fn get_status(&self, session_id: &str) -> Option<TransferStatus> {
        self.inner.lock().get(session_id).cloned()
    }
}

#[tauri::command]
pub async fn send_files(
    transfer_manager: tauri::State<'_, TransferManager>,
    settings: tauri::State<'_, crate::commands::settings::SettingsManager>,
    session_id: String,
    files: Vec<FileEntry>,
    options: SendOptions,
) -> Result<(), String> {
    if files.is_empty() {
        return Err("nenhum arquivo fornecido".into());
    }
    let chunk_size = settings
        .get_settings()
        .map_err(|e| e.to_string())?
        .chunk_size;
    let manager = transfer_manager.inner.clone();
    let manifest_dir = manifest_dir();
    let options_clone = options.clone();

    transfer_manager.set_status(
        session_id.clone(),
        TransferStatus::new(session_id.clone(), &files),
    );

    tauri::async_runtime::spawn(async move {
        if let Err(err) = execute_transfer(
            session_id,
            files,
            options_clone,
            chunk_size,
            manifest_dir,
            manager,
        )
        .await
        {
            tracing::error!(?err, "transfer failed");
        }
    });

    Ok(())
}

async fn execute_transfer(
    session_id: String,
    files: Vec<FileEntry>,
    options: SendOptions,
    chunk_size: u64,
    manifest_dir: PathBuf,
    manager: Arc<Mutex<HashMap<String, TransferStatus>>>,
) -> anyhow::Result<()> {
    let manifest_path = manifest_dir.join(format!("{}.json", session_id));
    let mut manifest = load_manifest(&manifest_path).unwrap_or_else(|| TransferManifest {
        session_id: session_id.clone(),
        encrypted: options.encrypt,
        files: HashMap::new(),
    });

    let started = Instant::now();
    let mut total_transferred = 0u64;
    let mut last_tick = Instant::now();
    let mut last_transferred = 0u64;

    let key = if options.encrypt {
        Some(derive_key(
            options.password.as_deref().unwrap_or(""),
            &session_id,
        )?)
    } else {
        None
    };

    update_status(
        |status| {
            status.state = "transferindo".into();
        },
        &manager,
        &session_id,
    );

    for file in files {
        if file.is_dir {
            continue;
        }
        let path = PathBuf::from(&file.path);
        let mut handle =
            File::open(&path).with_context(|| format!("abrir arquivo {}", path.display()))?;
        let mut file_hasher = Hasher::new();
        let mut chunk_index = 0u64;

        // Garante que existe um entry no manifest sem manter &mut vivo
        manifest.files.entry(file.path.clone()).or_insert_with(|| FileManifest {
            path: file.path.clone(),
            size: file.size,
            ..Default::default()
        });

        // bytes já existentes (para "resumindo")
        let reused_bytes: u64 = manifest
            .files
            .get(&file.path)
            .map(|e| e.chunks.iter().map(|c| c.size).sum())
            .unwrap_or(0);

        // Determine resume state
        update_status(
            |status| {
                status.state = "resumindo".into();
                if let Some(p) = status
                    .file_progress
                    .iter_mut()
                    .find(|p| p.path == file.path)
                {
                    p.transferred = reused_bytes.min(p.total);
                }
            },
            &manager,
            &session_id,
        );

        loop {
            let mut buffer = vec![0u8; chunk_size as usize];
            let read = handle.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            buffer.truncate(read);
            let chunk_hash = blake3::hash(&buffer).to_hex().to_string();

            // Checa se já existe esse chunk igual (apenas leitura)
            let exists_equal = manifest
                .files
                .get(&file.path)
                .and_then(|e| e.chunks.iter().find(|c| c.index == chunk_index))
                .map(|c| c.hash == chunk_hash && c.size == read as u64)
                .unwrap_or(false);

           if exists_equal {
    file_hasher.update(&buffer);
    total_transferred += read as u64;
    update_progress(
        &manager,
        &session_id,
        &file.path,
        read as u64,
        total_transferred,
        started,
    );
    chunk_index += 1;
    continue;
}

            if let Some(key) = &key {
                use chacha20poly1305::{aead::Aead, ChaCha20Poly1305, Key, Nonce};
                let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
                let mut nonce_bytes = [0u8; 12];
                nonce_bytes[..8].copy_from_slice(&chunk_index.to_be_bytes());
                let nonce = Nonce::from_slice(&nonce_bytes);
                let _encrypted = cipher.encrypt(nonce, buffer.as_ref()).context("encrypt chunk")?;
            }

            file_hasher.update(&buffer);

            // altera os chunks num bloco curto (&mut termina aqui)
            {
                let entry = manifest.files.get_mut(&file.path).expect("entry existente");
                entry.chunks.retain(|c| c.index != chunk_index);
                entry.chunks.push(ChunkInfo {
                    index: chunk_index,
                    hash: chunk_hash,
                    size: read as u64,
                });
            }
            // só agora salva
            save_manifest(&manifest_path, &manifest)?;

            total_transferred += read as u64;
            update_progress(
                &manager,
                &session_id,
                &file.path,
                read as u64,
                total_transferred,
                started,
            );

            let now = Instant::now();
            if now.duration_since(last_tick) >= Duration::from_secs(1) {
                let delta = total_transferred - last_transferred;
                let rate = delta as f64 / now.duration_since(last_tick).as_secs_f64();
                update_status(
                    |status| {
                        status.rate = rate;
                        if status.total_bytes > 0 {
                            let remaining =
                                status.total_bytes.saturating_sub(status.transferred_bytes);
                            status.eta_seconds = Some(remaining as f64 / rate.max(1.0));
                        }
                    },
                    &manager,
                    &session_id,
                );
                last_tick = now;
                last_transferred = total_transferred;
            }

            chunk_index += 1;
        }

        // final_hash: altera e depois salva (sem &mut pendente)
        {
            let entry = manifest.files.get_mut(&file.path).expect("entry existente");
            entry.final_hash = Some(file_hasher.finalize().to_hex().to_string());
        }
        save_manifest(&manifest_path, &manifest)?;

        update_status(
            |status| {
                if let Some(p) = status
                    .file_progress
                    .iter_mut()
                    .find(|p| p.path == file.path)
                {
                    p.done = true;
                    p.transferred = p.total;
                }
            },
            &manager,
            &session_id,
        );
    }

    update_status(
        |status| {
            status.state = "concluído".into();
            status.transferred_bytes = status.total_bytes;
            status.rate = 0.0;
            status.eta_seconds = Some(0.0);
        },
        &manager,
        &session_id,
    );

    Ok(())
}

fn update_progress(
    manager: &Arc<Mutex<HashMap<String, TransferStatus>>>,
    session_id: &str,
    file_path: &str,
    chunk_bytes: u64,
    total_transferred: u64,
    started: Instant,
) {
    update_status(
        |status| {
            if let Some(p) = status
                .file_progress
                .iter_mut()
                .find(|p| p.path == file_path)
            {
                p.transferred = (p.transferred + chunk_bytes).min(p.total);
            }
            status.transferred_bytes = total_transferred;
            let elapsed = started.elapsed().as_secs_f64().max(0.001);
            status.rate = status.transferred_bytes as f64 / elapsed;
        },
        manager,
        session_id,
    );
}

fn update_status<F>(
    mut f: F,
    manager: &Arc<Mutex<HashMap<String, TransferStatus>>>,
    session_id: &str,
) where
    F: FnMut(&mut TransferStatus),
{
    if let Some(status) = manager.lock().get_mut(session_id) {
        f(status);
    }
}

fn derive_key(password: &str, session_id: &str) -> anyhow::Result<[u8; 32]> {
    let mut salt_bytes = [0u8; 16];
    let digest = blake3::hash(session_id.as_bytes());
    salt_bytes.copy_from_slice(&digest.as_bytes()[..16]);

    let mut output = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt_bytes, &mut output)
        .map_err(|e| anyhow::anyhow!("argon2 derivation: {}", e))?;

    Ok(output)
}

fn manifest_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("FLUXSHARE_DATA_DIR") {
        let dir = PathBuf::from(custom).join("manifests");
        fs::create_dir_all(&dir).ok();
        return dir;
    }
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join(".fluxshare").join("manifests");
    fs::create_dir_all(&dir).ok();
    dir
}

fn load_manifest(path: &Path) -> Option<TransferManifest> {
    let data = fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

fn save_manifest(path: &Path, manifest: &TransferManifest) -> anyhow::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(manifest)?;
    fs::write(path, json)?;
    Ok(())
}

#[tauri::command]
pub fn get_status(
    transfer_manager: tauri::State<'_, TransferManager>,
    session_id: String,
) -> Option<TransferStatus> {
    transfer_manager.get_status(&session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Seek, Write};
    use tempfile::NamedTempFile;

    #[test]
    fn chunk_and_resume() {
        let mut tmp = NamedTempFile::new().unwrap();
        let data = vec![1u8; 2 * 1024 * 1024];
        tmp.write_all(&data).unwrap();
        tmp.rewind().unwrap();

        let file_entry = FileEntry {
            path: tmp.path().to_string_lossy().to_string(),
            name: "tmp.bin".into(),
            size: data.len() as u64,
            is_dir: false,
            checksum: None,
        };

        let manager = TransferManager::default();
        manager.set_status(
            "session".into(),
            TransferStatus::new("session".into(), &[file_entry.clone()]),
        );

        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let temp_dir = tempfile::tempdir().unwrap();
            std::env::set_var("FLUXSHARE_DATA_DIR", temp_dir.path());
            execute_transfer(
                "session".into(),
                vec![file_entry.clone()],
                SendOptions {
                    encrypt: false,
                    password: None,
                },
                1024 * 512,
                manifest_dir(),
                manager.inner.clone(),
            )
            .await
            .unwrap();
        });

        let status = manager.get_status("session").unwrap();
        assert_eq!(status.transferred_bytes, status.total_bytes);
        assert!(status.file_progress[0].done);
    }
}

