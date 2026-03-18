use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Manager;
use walkdir::WalkDir;
use zip::{write::FileOptions, ZipArchive};

const EVENT_IMPORT_PROGRESS: &str = "fluxshare://import-progress";
const EMIT_BYTES_STEP: u64 = 4 * 1024 * 1024;
const ARCHIVE_CACHE_DIR: &str = "fluxshare-archives";
const MAX_ARCHIVE_ENTRIES: usize = 20_000;
const MAX_ARCHIVE_TOTAL_COMPRESSED_BYTES: u64 = 64 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES: u64 = 128 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES: u64 = 32 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_DEPTH: usize = 32;
const MAX_ARCHIVE_COMPRESSION_RATIO: u64 = 250;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgressPayload {
    pub job_id: String,
    pub stage: String,
    pub progress: Option<f64>,
    pub files_processed: usize,
    pub total_files: Option<usize>,
    pub bytes_processed: u64,
    pub total_bytes: Option<u64>,
    pub message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreparedArchive {
    pub archive_path: String,
    pub display_name: String,
    pub size: u64,
    pub archive_root: String,
}

fn emit_progress(app: &tauri::AppHandle, payload: ImportProgressPayload) {
    let _ = app.emit_all(EVENT_IMPORT_PROGRESS, payload);
}

fn current_timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
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
        "archive.zip".to_string()
    } else {
        trimmed.to_string()
    }
}

fn ensure_zip_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.to_ascii_lowercase().ends_with(".zip") {
        sanitize_filename(trimmed)
    } else {
        sanitize_filename(&format!("{trimmed}.zip"))
    }
}

fn build_cache_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path_resolver()
        .app_cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(ARCHIVE_CACHE_DIR)
}

fn cleanup_directory_tree(root: &Path) -> Result<(), String> {
    if root.exists() {
        fs::remove_dir_all(root)
            .map_err(|error| format!("failed to clean directory {}: {error}", root.display()))?;
    }
    Ok(())
}

pub fn cleanup_archive_cache(app: &tauri::AppHandle) -> Result<(), String> {
    cleanup_directory_tree(&build_cache_dir(app))
}

fn build_archive_root(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("archive");
    sanitize_filename(stem)
}

fn as_zip_entry(root: &str, relative: &Path) -> String {
    let relative_path = relative.to_string_lossy().replace('\\', "/");
    if relative_path.is_empty() {
        root.to_string()
    } else {
        format!("{root}/{relative_path}")
    }
}

fn unique_directory_path(root: &Path, folder_name: &str) -> PathBuf {
    let candidate = root.join(folder_name);
    if !candidate.exists() {
        return candidate;
    }

    for index in 1..10_000 {
        let next = root.join(format!("{folder_name} ({index})"));
        if !next.exists() {
            return next;
        }
    }

    root.join(format!("{folder_name}-{}", current_timestamp()))
}

fn normalize_archive_entry_path(name: &str) -> Result<PathBuf, String> {
    if name.trim().is_empty() {
        return Err("archive entry path is empty".to_string());
    }
    if name.contains('\0') {
        return Err(format!("archive entry contains NUL bytes: {name}"));
    }

    let normalized = name.replace('\\', "/");
    if normalized.starts_with('/') || normalized.starts_with("//") {
        return Err(format!("archive entry uses an absolute path: {name}"));
    }
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        return Err(format!("archive entry uses a drive-prefixed path: {name}"));
    }

    let mut output = PathBuf::new();
    let mut depth = 0usize;

    for component in Path::new(&normalized).components() {
        match component {
            Component::CurDir => {}
            Component::Normal(value) => {
                depth += 1;
                if depth > MAX_ARCHIVE_DEPTH {
                    return Err(format!("archive entry exceeds max depth: {name}"));
                }
                output.push(value);
            }
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(format!("archive entry escapes the destination root: {name}"));
            }
        }
    }

    if output.as_os_str().is_empty() {
        return Err(format!("archive entry resolved to an empty path: {name}"));
    }

    Ok(output)
}

fn is_symlink_entry(file: &zip::read::ZipFile<'_>) -> bool {
    file.unix_mode()
        .map(|mode| (mode & 0o170000) == 0o120000)
        .unwrap_or(false)
}

fn validate_archive_entry(file: &zip::read::ZipFile<'_>) -> Result<PathBuf, String> {
    if file.size() > MAX_ARCHIVE_ENTRY_BYTES {
        return Err(format!(
            "archive entry {} exceeds the per-entry size limit",
            file.name()
        ));
    }

    let compressed_size = file.compressed_size();
    if compressed_size == 0 {
        if file.size() > 0 {
            return Err(format!(
                "archive entry {} has suspicious compression metadata",
                file.name()
            ));
        }
    } else if file.size() / compressed_size > MAX_ARCHIVE_COMPRESSION_RATIO {
        return Err(format!(
            "archive entry {} exceeds the compression ratio limit",
            file.name()
        ));
    }

    if is_symlink_entry(file) {
        return Err(format!("archive entry {} is a symlink", file.name()));
    }

    normalize_archive_entry_path(file.name())
}

pub fn extract_archive_to_downloads(
    archive_path: &Path,
    downloads_root: &Path,
    target_folder_name: Option<&str>,
) -> Result<PathBuf, String> {
    let archive_file = File::open(archive_path)
        .map_err(|error| format!("failed to open archive {}: {error}", archive_path.display()))?;
    let mut archive = ZipArchive::new(archive_file)
        .map_err(|error| format!("failed to parse archive {}: {error}", archive_path.display()))?;

    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!(
            "archive contains too many entries ({} > {})",
            archive.len(),
            MAX_ARCHIVE_ENTRIES
        ));
    }

    let mut entry_specs = Vec::with_capacity(archive.len());
    let mut total_compressed_bytes = 0u64;
    let mut total_uncompressed_bytes = 0u64;

    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("failed to read archive entry #{index}: {error}"))?;
        let relative_path = validate_archive_entry(&file)?;
        total_compressed_bytes = total_compressed_bytes.saturating_add(file.compressed_size());
        total_uncompressed_bytes = total_uncompressed_bytes.saturating_add(file.size());

        if total_compressed_bytes > MAX_ARCHIVE_TOTAL_COMPRESSED_BYTES {
            return Err("archive exceeds the compressed size limit".to_string());
        }
        if total_uncompressed_bytes > MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES {
            return Err("archive exceeds the uncompressed size limit".to_string());
        }

        entry_specs.push((index, relative_path, file.is_dir()));
    }

    fs::create_dir_all(downloads_root).map_err(|error| {
        format!(
            "failed to create downloads root {}: {error}",
            downloads_root.display()
        )
    })?;
    let folder_name = sanitize_filename(target_folder_name.unwrap_or("FluxShare-Folder"));
    let target_dir = unique_directory_path(downloads_root, &folder_name);
    fs::create_dir_all(&target_dir)
        .map_err(|error| format!("failed to create extraction root {}: {error}", target_dir.display()))?;

    let mut buffer = vec![0u8; 256 * 1024];

    for (index, relative_path, is_dir) in entry_specs {
        let target_path = target_dir.join(&relative_path);
        if !target_path.starts_with(&target_dir) {
            let _ = fs::remove_dir_all(&target_dir);
            return Err(format!(
                "archive entry escapes the destination root: {}",
                relative_path.display()
            ));
        }

        if is_dir {
            fs::create_dir_all(&target_path)
                .map_err(|error| format!("failed to create directory {}: {error}", target_path.display()))?;
            continue;
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create directory {}: {error}", parent.display()))?;
        }

        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("failed to reopen archive entry #{index}: {error}"))?;
        let mut output = File::create(&target_path)
            .map_err(|error| format!("failed to create extracted file {}: {error}", target_path.display()))?;
        loop {
            let read = entry
                .read(&mut buffer)
                .map_err(|error| format!("failed to extract {}: {error}", target_path.display()))?;
            if read == 0 {
                break;
            }
            output
                .write_all(&buffer[..read])
                .map_err(|error| format!("failed to write extracted file {}: {error}", target_path.display()))?;
        }
    }

    Ok(target_dir)
}

fn fail_with_progress(
    app: &tauri::AppHandle,
    job_id: &str,
    message: String,
) -> Result<PreparedArchive, String> {
    emit_progress(
        app,
        ImportProgressPayload {
            job_id: job_id.to_string(),
            stage: "error".to_string(),
            progress: None,
            files_processed: 0,
            total_files: None,
            bytes_processed: 0,
            total_bytes: None,
            message: message.clone(),
        },
    );
    Err(message)
}

fn prepare_folder_archive_blocking(
    app: tauri::AppHandle,
    source_path: PathBuf,
    display_name: String,
    job_id: String,
) -> Result<PreparedArchive, String> {
    if !source_path.exists() {
        return fail_with_progress(
            &app,
            &job_id,
            format!("folder not found: {}", source_path.display()),
        );
    }

    if !source_path.is_dir() {
        return fail_with_progress(
            &app,
            &job_id,
            format!("path is not a folder: {}", source_path.display()),
        );
    }

    emit_progress(
        &app,
        ImportProgressPayload {
            job_id: job_id.clone(),
            stage: "scanning".to_string(),
            progress: None,
            files_processed: 0,
            total_files: None,
            bytes_processed: 0,
            total_bytes: None,
            message: "Scanning folder".to_string(),
        },
    );

    let archive_display_name = ensure_zip_name(&display_name);
    let archive_root = build_archive_root(&archive_display_name);
    let mut directories: Vec<String> = Vec::new();
    let mut files: Vec<(PathBuf, PathBuf, u64)> = Vec::new();
    let mut total_bytes = 0u64;

    for (index, entry_result) in WalkDir::new(&source_path)
        .follow_links(false)
        .into_iter()
        .enumerate()
    {
        let entry = entry_result.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        if entry_path == source_path {
            continue;
        }

        let relative = entry_path
            .strip_prefix(&source_path)
            .map_err(|error| error.to_string())?
            .to_path_buf();

        if entry.file_type().is_dir() {
            directories.push(as_zip_entry(&archive_root, &relative));
        } else if entry.file_type().is_file() {
            let metadata = entry.metadata().map_err(|error| error.to_string())?;
            total_bytes = total_bytes.saturating_add(metadata.len());
            files.push((entry_path.to_path_buf(), relative.clone(), metadata.len()));
        }

        if index == 0 || index % 250 == 0 {
            emit_progress(
                &app,
                ImportProgressPayload {
                    job_id: job_id.clone(),
                    stage: "scanning".to_string(),
                    progress: None,
                    files_processed: files.len(),
                    total_files: None,
                    bytes_processed: 0,
                    total_bytes: None,
                    message: format!("Scanning folder ({})", source_path.display()),
                },
            );
        }
    }

    let cache_dir = build_cache_dir(&app);
    fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;

    let archive_path = cache_dir.join(format!(
        "{}-{}",
        current_timestamp(),
        sanitize_filename(&archive_display_name)
    ));

    emit_progress(
        &app,
        ImportProgressPayload {
            job_id: job_id.clone(),
            stage: "packing".to_string(),
            progress: Some(0.0),
            files_processed: 0,
            total_files: Some(files.len()),
            bytes_processed: 0,
            total_bytes: Some(total_bytes),
            message: "Packing folder".to_string(),
        },
    );

    let target_file = File::create(&archive_path).map_err(|error| error.to_string())?;
    let mut zip = zip::ZipWriter::new(target_file);
    let dir_options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);
    let file_options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    if directories.is_empty() && files.is_empty() {
        zip.add_directory(format!("{archive_root}/"), dir_options)
            .map_err(|error| error.to_string())?;
    } else {
        for directory in directories {
            zip.add_directory(format!("{directory}/"), dir_options)
                .map_err(|error| error.to_string())?;
        }
    }

    let mut buffer = vec![0u8; 256 * 1024];
    let mut files_processed = 0usize;
    let mut bytes_processed = 0u64;
    let mut next_emit_threshold = EMIT_BYTES_STEP;

    let total_files = files.len();

    for (file_path, relative, _) in files {
        let zip_entry = as_zip_entry(&archive_root, &relative);
        zip.start_file(zip_entry, file_options)
            .map_err(|error| error.to_string())?;

        let mut input = File::open(&file_path).map_err(|error| error.to_string())?;
        loop {
            let read = input.read(&mut buffer).map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }

            zip.write_all(&buffer[..read])
                .map_err(|error| error.to_string())?;
            bytes_processed = bytes_processed.saturating_add(read as u64);

            if bytes_processed >= next_emit_threshold {
                emit_progress(
                    &app,
                    ImportProgressPayload {
                        job_id: job_id.clone(),
                        stage: "packing".to_string(),
                        progress: if total_bytes > 0 {
                            Some(bytes_processed as f64 / total_bytes as f64)
                        } else {
                            None
                        },
                        files_processed,
                        total_files: Some(total_files),
                        bytes_processed,
                        total_bytes: Some(total_bytes),
                        message: format!("Packing {}", file_path.display()),
                    },
                );
                next_emit_threshold = next_emit_threshold.saturating_add(EMIT_BYTES_STEP);
            }
        }

        files_processed += 1;
        emit_progress(
            &app,
            ImportProgressPayload {
                job_id: job_id.clone(),
                stage: "packing".to_string(),
                progress: if total_bytes > 0 {
                    Some(bytes_processed.min(total_bytes) as f64 / total_bytes as f64)
                } else {
                    Some(1.0)
                },
                files_processed,
                total_files: Some(total_files),
                bytes_processed: bytes_processed.min(total_bytes),
                total_bytes: Some(total_bytes),
                message: format!("Packed {}", file_path.display()),
            },
        );
    }

    let completed_file = zip.finish().map_err(|error| error.to_string())?;
    let archive_size = completed_file
        .metadata()
        .map_err(|error| error.to_string())?
        .len();

    emit_progress(
        &app,
        ImportProgressPayload {
            job_id: job_id.clone(),
            stage: "complete".to_string(),
            progress: Some(1.0),
            files_processed,
            total_files: Some(total_files),
            bytes_processed: total_bytes,
            total_bytes: Some(total_bytes),
            message: "Folder ready".to_string(),
        },
    );

    Ok(PreparedArchive {
        archive_path: archive_path.to_string_lossy().to_string(),
        display_name: archive_display_name,
        size: archive_size,
        archive_root,
    })
}

#[tauri::command]
pub async fn prepare_folder_archive(
    app: tauri::AppHandle,
    path: String,
    name: String,
    job_id: String,
) -> Result<PreparedArchive, String> {
    tauri::async_runtime::spawn_blocking(move || {
        prepare_folder_archive_blocking(app, PathBuf::from(path), name, job_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_parent_traversal_archive_entries() {
        let error = normalize_archive_entry_path("../evil.txt").expect_err("parent traversal should fail");
        assert!(error.contains("escapes"));
    }

    #[test]
    fn rejects_drive_prefixed_archive_entries() {
        let error = normalize_archive_entry_path("C:/Windows/win.ini")
            .expect_err("drive-prefixed path should fail");
        assert!(error.contains("drive-prefixed"));
    }

    #[test]
    fn rejects_absolute_archive_entries() {
        let error = normalize_archive_entry_path("/etc/passwd").expect_err("absolute path should fail");
        assert!(error.contains("absolute"));
    }

    #[test]
    fn rejects_mixed_separator_parent_traversal_archive_entries() {
        let error = normalize_archive_entry_path("folder\\..\\..\\evil.txt")
            .expect_err("mixed separator traversal should fail");
        assert!(error.contains("escapes"));
    }

    #[test]
    fn extracts_safe_archive_to_unique_folder() {
        let temp = tempdir().unwrap();
        let archive_path = temp.path().join("safe.zip");
        {
            let file = File::create(&archive_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zip.add_directory("folder/", options).unwrap();
            zip.start_file("folder/hello.txt", options).unwrap();
            zip.write_all(b"hello").unwrap();
            zip.finish().unwrap();
        }

        let downloads = temp.path().join("downloads");
        let extracted = extract_archive_to_downloads(&archive_path, &downloads, Some("Folder")).unwrap();
        let content = fs::read_to_string(extracted.join("folder").join("hello.txt")).unwrap();
        assert_eq!(content, "hello");
    }

    #[test]
    fn rejects_archive_with_too_many_entries() {
        let temp = tempdir().unwrap();
        let archive_path = temp.path().join("many.zip");
        {
            let file = File::create(&archive_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            for index in 0..=MAX_ARCHIVE_ENTRIES {
                zip.start_file(format!("entry-{index}.txt"), options).unwrap();
                zip.write_all(b"x").unwrap();
            }
            zip.finish().unwrap();
        }

        let downloads = temp.path().join("downloads");
        let error = extract_archive_to_downloads(&archive_path, &downloads, Some("Bomb"))
            .expect_err("archive with too many entries should fail");
        assert!(error.contains("too many entries"));
    }

    #[test]
    fn rejects_archive_with_excessive_compression_ratio() {
        let temp = tempdir().unwrap();
        let archive_path = temp.path().join("ratio.zip");
        {
            let file = File::create(&archive_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zip.start_file("bomb.txt", options).unwrap();
            let data = vec![0u8; 4 * 1024 * 1024];
            zip.write_all(&data).unwrap();
            zip.finish().unwrap();
        }

        let downloads = temp.path().join("downloads");
        let error = extract_archive_to_downloads(&archive_path, &downloads, Some("Bomb"))
            .expect_err("archive with abusive ratio should fail");
        assert!(error.contains("compression ratio"));
    }

    #[test]
    fn cleanup_directory_tree_removes_cached_archives() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("fluxshare-archives");
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested").join("stale.zip"), b"payload").unwrap();

        cleanup_directory_tree(&root).unwrap();
        assert!(!root.exists());
    }
}
