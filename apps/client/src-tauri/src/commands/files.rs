use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;
use rand::{distributions::Alphanumeric, Rng};
use serde::Serialize;

use super::import::extract_archive_to_downloads;

const MAX_TRANSFER_READ_BYTES: usize = 1024 * 1024;
const MAX_TRANSFER_WRITE_BYTES: usize = 1024 * 1024;
const MAX_ACTIVE_TEMP_FILES: usize = 256;
const TRANSFER_TEMP_DIR: &str = "fluxshare-transfer-temp";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredTransferSource {
    pub handle_id: String,
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransferTempFile {
    pub handle_id: String,
    pub path: String,
}

#[derive(Clone)]
struct SourceHandle {
    path: PathBuf,
    size: u64,
}

#[derive(Clone)]
struct TempHandle {
    path: PathBuf,
    expected_size: Option<u64>,
}

#[derive(Default)]
struct TransferFileState {
    sources: HashMap<String, SourceHandle>,
    temp_files: HashMap<String, TempHandle>,
}

#[derive(Clone, Default)]
pub struct TransferFileManager {
    inner: Arc<Mutex<TransferFileState>>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn random_handle_id() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(24)
        .map(char::from)
        .collect()
}

fn sanitize_filename(name: &str) -> String {
    let mut sanitized = String::with_capacity(name.len());
    for ch in name.chars() {
        match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => sanitized.push('_'),
            _ if ch.is_control() => sanitized.push('_'),
            _ => sanitized.push(ch),
        }
    }
    let trimmed = sanitized.trim().trim_matches('.');
    if trimmed.is_empty() {
        "file.bin".to_string()
    } else {
        trimmed.to_string()
    }
}

fn transfer_temp_root(app: &tauri::AppHandle) -> PathBuf {
    app.path_resolver()
        .app_cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(TRANSFER_TEMP_DIR)
}

fn cleanup_directory_tree(root: &Path) -> Result<(), String> {
    if root.exists() {
        fs::remove_dir_all(root)
            .map_err(|error| format!("failed to clean directory {}: {error}", root.display()))?;
    }
    Ok(())
}

fn downloads_root(app: &tauri::AppHandle) -> PathBuf {
    let _ = app;
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(std::env::temp_dir)
}

fn canonical_path(path: &str) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|error| format!("failed to resolve path {path}: {error}"))
}

fn unique_file_path(root: &Path, name: &str) -> PathBuf {
    let candidate = root.join(name);
    if !candidate.exists() {
        return candidate;
    }

    let stem = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("file");
    let extension = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();

    for index in 1..10_000 {
        let next = root.join(format!("{stem} ({index}){extension}"));
        if !next.exists() {
            return next;
        }
    }

    root.join(format!("{stem}-{}{}", now_ms(), extension))
}

fn validate_range_request(start: u64, length: u64, max_length: usize) -> Result<usize, String> {
    if length == 0 {
        return Ok(0);
    }
    if length > max_length as u64 {
        return Err(format!(
            "requested range length {length} exceeds the max allowed {max_length}"
        ));
    }
    if start.checked_add(length).is_none() {
        return Err("range overflows the allowed file size".to_string());
    }
    Ok(length as usize)
}

fn build_path_info(path: &str) -> Result<PathInfo, String> {
    let canonical = canonical_path(path)?;
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("failed to read metadata for {}: {error}", canonical.display()))?;
    let name = canonical
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.to_string_lossy().to_string());

    Ok(PathInfo {
        path: canonical.to_string_lossy().to_string(),
        name,
        size: metadata.len(),
        is_dir: metadata.is_dir(),
    })
}

fn read_source_bytes(
    state: &TransferFileState,
    handle_id: &str,
    start: u64,
    length: u64,
) -> Result<Vec<u8>, String> {
    let requested = validate_range_request(start, length, MAX_TRANSFER_READ_BYTES)?;
    let source = state
        .sources
        .get(handle_id)
        .ok_or_else(|| "unknown transfer source handle".to_string())?;

    if start > source.size {
        return Err("range start exceeds file size".to_string());
    }

    let mut file = fs::File::open(&source.path)
        .map_err(|error| format!("failed to open approved source {}: {error}", source.path.display()))?;
    file.seek(SeekFrom::Start(start))
        .map_err(|error| format!("failed to seek source {}: {error}", source.path.display()))?;

    let mut buffer = vec![0u8; requested];
    let read = file
        .read(&mut buffer)
        .map_err(|error| format!("failed to read source {}: {error}", source.path.display()))?;
    buffer.truncate(read);
    Ok(buffer)
}

fn write_temp_bytes(
    state: &TransferFileState,
    handle_id: &str,
    start: u64,
    bytes: &[u8],
) -> Result<(), String> {
    let _ = validate_range_request(start, bytes.len() as u64, MAX_TRANSFER_WRITE_BYTES)?;
    let temp = state
        .temp_files
        .get(handle_id)
        .ok_or_else(|| "unknown temp file handle".to_string())?;

    if let Some(expected_size) = temp.expected_size {
        let end = start
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| "write range overflows".to_string())?;
        if end > expected_size {
            return Err(format!(
                "write exceeds the declared file size ({end} > {expected_size})"
            ));
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .open(&temp.path)
        .map_err(|error| format!("failed to open temp file {}: {error}", temp.path.display()))?;
    file.seek(SeekFrom::Start(start))
        .map_err(|error| format!("failed to seek temp file {}: {error}", temp.path.display()))?;
    file.write_all(bytes)
        .map_err(|error| format!("failed to write temp file {}: {error}", temp.path.display()))
}

impl TransferFileManager {
    fn register_source(&self, path: &str) -> Result<RegisteredTransferSource, String> {
        let info = build_path_info(path)?;
        if info.is_dir {
            return Err("directories cannot be registered as transfer sources".to_string());
        }

        let handle_id = random_handle_id();
        let mut state = self.inner.lock();
        state.sources.insert(
            handle_id.clone(),
            SourceHandle {
                path: PathBuf::from(&info.path),
                size: info.size,
            },
        );

        Ok(RegisteredTransferSource {
            handle_id,
            path: info.path,
            name: info.name,
            size: info.size,
        })
    }

    fn release_source(&self, handle_id: &str) {
        self.inner.lock().sources.remove(handle_id);
    }

    fn take_temp_file(&self, handle_id: &str) -> Result<TempHandle, String> {
        self.inner
            .lock()
            .temp_files
            .remove(handle_id)
            .ok_or_else(|| "unknown temp file handle".to_string())
    }

    fn delete_temp_file(&self, handle_id: &str) -> Result<(), String> {
        let temp = self.take_temp_file(handle_id)?;
        if temp.path.exists() {
            fs::remove_file(&temp.path)
                .map_err(|error| format!("failed to remove temp file {}: {error}", temp.path.display()))?;
        }
        Ok(())
    }
}

pub fn cleanup_transfer_temp_artifacts(app: &tauri::AppHandle) -> Result<(), String> {
    cleanup_directory_tree(&transfer_temp_root(app))
}

pub fn is_managed_transfer_temp_path(app: &tauri::AppHandle, path: &Path) -> bool {
    let root = transfer_temp_root(app);
    path.starts_with(root)
}

#[tauri::command]
pub fn inspect_path(path: String) -> Result<PathInfo, String> {
    build_path_info(&path)
}

#[tauri::command]
pub fn register_transfer_source(
    manager: tauri::State<'_, TransferFileManager>,
    path: String,
) -> Result<RegisteredTransferSource, String> {
    manager.register_source(&path)
}

#[tauri::command]
pub fn release_transfer_source(
    manager: tauri::State<'_, TransferFileManager>,
    handle_id: String,
) -> Result<(), String> {
    manager.release_source(&handle_id);
    Ok(())
}

#[tauri::command]
pub fn read_file_range(
    manager: tauri::State<'_, TransferFileManager>,
    handle_id: String,
    start: u64,
    length: u64,
) -> Result<Vec<u8>, String> {
    let state = manager.inner.lock();
    read_source_bytes(&state, &handle_id, start, length)
}

#[tauri::command]
pub fn create_transfer_temp_file(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TransferFileManager>,
    file_name: String,
    expected_size: Option<u64>,
) -> Result<TransferTempFile, String> {
    let root = transfer_temp_root(&app);
    fs::create_dir_all(&root)
        .map_err(|error| format!("failed to create temp root {}: {error}", root.display()))?;

    let sanitized = sanitize_filename(&file_name);
    let file_path = root.join(format!("{}-{sanitized}", random_handle_id()));
    let handle_id = random_handle_id();

    let mut state = manager.inner.lock();
    if state.temp_files.len() >= MAX_ACTIVE_TEMP_FILES {
        return Err("too many active temp files".to_string());
    }

    fs::File::create(&file_path)
        .map_err(|error| format!("failed to create temp file {}: {error}", file_path.display()))?;
    state.temp_files.insert(
        handle_id.clone(),
        TempHandle {
            path: file_path.clone(),
            expected_size,
        },
    );

    Ok(TransferTempFile {
        handle_id,
        path: file_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn write_file_range(
    manager: tauri::State<'_, TransferFileManager>,
    handle_id: String,
    start: u64,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let state = manager.inner.lock();
    write_temp_bytes(&state, &handle_id, start, &bytes)
}

#[tauri::command]
pub fn delete_transfer_temp_file(
    manager: tauri::State<'_, TransferFileManager>,
    handle_id: String,
) -> Result<(), String> {
    manager.delete_temp_file(&handle_id)
}

#[tauri::command]
pub fn persist_received_file(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TransferFileManager>,
    handle_id: String,
    suggested_name: String,
) -> Result<String, String> {
    let temp = manager.take_temp_file(&handle_id)?;
    let target_root = downloads_root(&app);
    fs::create_dir_all(&target_root)
        .map_err(|error| format!("failed to create downloads root {}: {error}", target_root.display()))?;

    let destination = unique_file_path(&target_root, &sanitize_filename(&suggested_name));
    match fs::rename(&temp.path, &destination) {
        Ok(()) => Ok(destination.to_string_lossy().to_string()),
        Err(_) => {
            fs::copy(&temp.path, &destination).map_err(|error| {
                format!(
                    "failed to copy received file {} to {}: {error}",
                    temp.path.display(),
                    destination.display()
                )
            })?;
            fs::remove_file(&temp.path).map_err(|error| {
                format!(
                    "failed to remove temp file after persisting {}: {error}",
                    temp.path.display()
                )
            })?;
            Ok(destination.to_string_lossy().to_string())
        }
    }
}

#[tauri::command]
pub fn extract_received_archive(
    app: tauri::AppHandle,
    manager: tauri::State<'_, TransferFileManager>,
    handle_id: String,
    target_folder_name: Option<String>,
) -> Result<String, String> {
    let temp = manager.take_temp_file(&handle_id)?;
    let target_root = downloads_root(&app);
    let result = extract_archive_to_downloads(
        &temp.path,
        &target_root,
        target_folder_name.as_deref(),
    );

    let cleanup_result = if temp.path.exists() {
        fs::remove_file(&temp.path).map_err(|error| {
            format!(
                "failed to remove extracted temp archive {}: {error}",
                temp.path.display()
            )
        })
    } else {
        Ok(())
    };

    match (result, cleanup_result) {
        (Ok(path), Ok(())) => Ok(path.to_string_lossy().to_string()),
        (Ok(_), Err(error)) => Err(error),
        (Err(error), _) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_oversized_read_requests() {
        let error = validate_range_request(0, (MAX_TRANSFER_READ_BYTES + 1) as u64, MAX_TRANSFER_READ_BYTES)
            .expect_err("oversized read should fail");
        assert!(error.contains("exceeds the max allowed"));
    }

    #[test]
    fn rejects_unknown_source_handles() {
        let state = TransferFileState::default();
        let error = read_source_bytes(&state, "missing", 0, 32).expect_err("missing handle should fail");
        assert!(error.contains("unknown transfer source handle"));
    }

    #[test]
    fn rejects_writes_beyond_declared_size() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("recv.bin");
        fs::File::create(&path).unwrap();

        let mut state = TransferFileState::default();
        state.temp_files.insert(
            "temp".to_string(),
            TempHandle {
                path: path.clone(),
                expected_size: Some(8),
            },
        );

        let error = write_temp_bytes(&state, "temp", 4, &[1, 2, 3, 4, 5])
            .expect_err("write beyond declared size should fail");
        assert!(error.contains("declared file size"));
    }

    #[test]
    fn unique_file_path_appends_suffix_for_collisions() {
        let dir = tempdir().unwrap();
        let original = dir.path().join("file.txt");
        fs::write(&original, b"hello").unwrap();

        let next = unique_file_path(dir.path(), "file.txt");
        assert_ne!(next, original);
        assert!(next.file_name().unwrap().to_string_lossy().contains("(1)"));
    }

    #[test]
    fn deleting_temp_file_removes_artifact() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("recv.bin");
        fs::write(&path, b"payload").unwrap();

        let manager = TransferFileManager::default();
        manager.inner.lock().temp_files.insert(
            "temp".to_string(),
            TempHandle {
                path: path.clone(),
                expected_size: None,
            },
        );

        manager.delete_temp_file("temp").unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn cleanup_directory_tree_removes_stale_temp_artifacts() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("fluxshare-transfer-temp");
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested").join("stale.bin"), b"payload").unwrap();

        cleanup_directory_tree(&root).unwrap();
        assert!(!root.exists());
    }
}
