use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Manager;
use walkdir::WalkDir;
use zip::write::FileOptions;

const EVENT_IMPORT_PROGRESS: &str = "fluxshare://import-progress";
const EMIT_BYTES_STEP: u64 = 4 * 1024 * 1024;

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
        .join("fluxshare-archives")
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
