use axum::body::Body;
use std::fs;
use std::io::{BufRead, BufReader, Cursor, Read, SeekFrom};
use std::net::TcpListener;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::thread::JoinHandle as ThreadJoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path as AxumPath, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{Html, Response},
    routing::get,
    Router,
};
use csv::ReaderBuilder;
use parking_lot::Mutex;
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::redirect::Policy;
use roxmltree::Document;
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
use zip::ZipArchive;

use super::hosted_page::{
    content_type_for_name, format_file_size, preview_kind, render_index_page,
    render_preview_document_page, render_preview_state_page, render_status_page, HostedPageFile,
    HostedPreviewDocument, PreviewDocumentBody, PreviewKind, PreviewTextTone, TextPreviewKind,
};
use super::files::is_managed_transfer_temp_path;

const EVENT_TUNNEL_LOG: &str = "fluxshare://tunnel-log";
const EVENT_TUNNEL_STATUS: &str = "fluxshare://tunnel-status";
const EVENT_TUNNEL_STOPPED: &str = "tunnel:stopped";
const URL_DETECTION_TIMEOUT: Duration = Duration::from_secs(20);
const FAST_READY_TIMEOUT: Duration = Duration::from_secs(3);
const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(25);
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_millis(800);
const PUBLIC_READY_TIMEOUT: Duration = Duration::from_secs(60);
const RECONNECT_DELAY: Duration = Duration::from_secs(2);
const MAX_RECONNECT_ATTEMPTS: u8 = 1;
const TEXT_PREVIEW_MAX_BYTES: u64 = 256 * 1024;
const TEXT_PREVIEW_MAX_CHARS: usize = 80_000;
const CSV_PREVIEW_MAX_ROWS: usize = 40;
const CSV_PREVIEW_MAX_COLUMNS: usize = 8;
const CSV_PREVIEW_MAX_CELL_CHARS: usize = 160;
const DOCX_PREVIEW_MAX_XML_BYTES: u64 = 1_000_000;
const DOCX_PREVIEW_MAX_PARAGRAPHS: usize = 140;
const DOCX_PREVIEW_MAX_CHARS: usize = 90_000;

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

#[derive(Clone, Debug)]
struct HostedFile {
    id: u64,
    path: PathBuf,
    name: String,
    size: u64,
    modified_at_ms: Option<u64>,
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

pub(super) struct TunnelState {
    child: Option<Child>,
    public_base_url: Option<String>,
    url: Option<String>,
    local_url: Option<String>,
    log_handles: Vec<ThreadJoinHandle<()>>,
    server_handle: Option<tauri::async_runtime::JoinHandle<()>>,
    server_shutdown: Option<oneshot::Sender<()>>,
    server_port: Option<u16>,
    exit_monitor: Option<tauri::async_runtime::JoinHandle<()>>,
    files: Vec<HostedFile>,
    next_file_id: u64,
    share_id: Option<String>,
    phase: String,
    message: Option<String>,
    public_ready: bool,
    local_ready: bool,
    provider: Option<String>,
    last_error: Option<String>,
    desired_tunnel: bool,
    reconnect_attempts: u8,
    last_checked_at: Option<u64>,
}

impl Default for TunnelState {
    fn default() -> Self {
        Self {
            child: None,
            public_base_url: None,
            url: None,
            local_url: None,
            log_handles: Vec::new(),
            server_handle: None,
            server_shutdown: None,
            server_port: None,
            exit_monitor: None,
            files: Vec::new(),
            next_file_id: 0,
            share_id: None,
            phase: "stopped".to_string(),
            message: None,
            public_ready: false,
            local_ready: false,
            provider: None,
            last_error: None,
            desired_tunnel: false,
            reconnect_attempts: 0,
            last_checked_at: None,
        }
    }
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
    pub local_url: Option<String>,
    pub local_port: Option<u16>,
    pub hosted_files: Vec<HostedFileSummary>,
    pub phase: String,
    pub message: Option<String>,
    pub public_ready: bool,
    pub local_ready: bool,
    pub provider: Option<String>,
    pub last_error: Option<String>,
    pub last_checked_at: Option<u64>,
}

#[derive(Serialize, Clone)]
struct TunnelLogPayload {
    line: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub ok: bool,
    pub status_code: Option<u16>,
    pub message: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn random_share_id() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(18)
        .map(char::from)
        .collect()
}

fn metadata_modified_ms(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
}

fn compose_share_url(base_url: &str, share_id: Option<&str>) -> String {
    let trimmed = base_url.trim_end_matches('/');
    match share_id {
        Some(share_id) if !share_id.is_empty() => format!("{trimmed}/{share_id}/"),
        _ => format!("{trimmed}/"),
    }
}

fn refresh_exposed_urls(state: &mut TunnelState) {
    state.local_url = state
        .server_port
        .map(|port| compose_share_url(&format!("http://127.0.0.1:{port}"), state.share_id.as_deref()));
    state.url = state
        .public_base_url
        .as_ref()
        .map(|base_url| compose_share_url(base_url, state.share_id.as_deref()));
}

fn archive_cache_root(app: &tauri::AppHandle) -> PathBuf {
    app.path_resolver()
        .app_cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("fluxshare-archives")
}

fn is_managed_host_artifact(app: &tauri::AppHandle, path: &PathBuf) -> bool {
    is_managed_transfer_temp_path(app, path) || path.starts_with(archive_cache_root(app))
}

fn cleanup_hosted_artifacts(app: &tauri::AppHandle, files: &[HostedFile]) {
    for file in files {
        if is_managed_host_artifact(app, &file.path) && file.path.exists() {
            let _ = fs::remove_file(&file.path);
        }
    }
}

fn set_phase(state: &mut TunnelState, phase: &str, message: Option<String>) {
    state.phase = phase.to_string();
    state.message = message;
    state.last_checked_at = Some(now_ms());
}

fn emit_log(app: &tauri::AppHandle, line: &str) {
    let _ = app.emit_all(
        EVENT_TUNNEL_LOG,
        TunnelLogPayload {
            line: line.to_string(),
        },
    );
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

fn summarize_state(state: &TunnelState) -> TunnelStatus {
    TunnelStatus {
        running: state.child.is_some(),
        url: state.url.clone(),
        local_url: state.local_url.clone(),
        local_port: state.server_port,
        hosted_files: summarize_files(&state.files),
        phase: state.phase.clone(),
        message: state.message.clone(),
        public_ready: state.public_ready,
        local_ready: state.local_ready,
        provider: state.provider.clone(),
        last_error: state.last_error.clone(),
        last_checked_at: state.last_checked_at,
    }
}

fn emit_status(app: &tauri::AppHandle, manager: &TunnelManager) {
    let payload = {
        let state = manager.inner.lock();
        summarize_state(&state)
    };
    let _ = app.emit_all(EVENT_TUNNEL_STATUS, payload);
}

fn emit_tunnel_stopped(app: &tauri::AppHandle, code: Option<i32>) -> i32 {
    let resolved = code.unwrap_or(-1);
    tracing::info!(code = resolved, "cloudflare_tunnel_exited");
    let _ = app.emit_all(EVENT_TUNNEL_STOPPED, resolved);
    resolved
}

fn cleanup_finished(state: &mut TunnelState) {
    if state.exit_monitor.is_some() {
        return;
    }
    if let Some(child) = state.child.as_mut() {
        if let Ok(Some(_)) = child.try_wait() {
            state.child = None;
            state.public_base_url = None;
            state.url = None;
            refresh_exposed_urls(state);
            state.public_ready = false;
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

fn share_base_path(share_id: &str) -> String {
    format!("/{share_id}")
}

fn hosted_file_matches_snapshot(file: &HostedFile) -> bool {
    match fs::metadata(&file.path) {
        Ok(metadata) => metadata.len() == file.size && metadata_modified_ms(&metadata) == file.modified_at_ms,
        Err(_) => false,
    }
}

enum HostedLookupError {
    ShareUnavailable,
    FileUnavailable,
    FileChanged,
}

fn resolve_hosted_file(
    manager: &TunnelManager,
    requested_share_id: &str,
    file_id: Option<u64>,
) -> Result<Option<HostedFile>, HostedLookupError> {
    let state = manager.inner.lock();
    if state.share_id.as_deref() != Some(requested_share_id) {
        return Err(HostedLookupError::ShareUnavailable);
    }

    match file_id {
        Some(file_id) => {
            let file = state
                .files
                .iter()
                .find(|file| file.id == file_id)
                .cloned()
                .ok_or(HostedLookupError::FileUnavailable)?;
            if hosted_file_matches_snapshot(&file) {
                Ok(Some(file))
            } else {
                Err(HostedLookupError::FileChanged)
            }
        }
        None => Ok(None),
    }
}

async fn index_handler(
    State(state): State<ServerState>,
    AxumPath(share_id): AxumPath<String>,
) -> Response {
    match resolve_hosted_file(&state.manager, &share_id, None) {
        Ok(None) => {
            let base_path = share_base_path(&share_id);
            let files = {
                let state_guard = state.manager.inner.lock();
                state_guard
                    .files
                    .iter()
                    .filter(|file| hosted_file_matches_snapshot(file))
                    .map(|file| HostedPageFile {
                        id: file.id,
                        name: file.name.clone(),
                        size: file.size,
                        base_path: base_path.clone(),
                    })
                    .collect::<Vec<_>>()
            };
            html_response(StatusCode::OK, render_index_page(&files))
        }
        _ => html_response(
            StatusCode::NOT_FOUND,
            render_status_page(
                "Compartilhamento indisponível",
                "Este link público não corresponde mais ao compartilhamento ativo.",
                true,
            ),
        ),
    }
}

fn parse_range_header(value: &str, total_size: u64) -> Result<Option<(u64, u64)>, ()> {
    let trimmed = value.trim();
    if !trimmed.starts_with("bytes=") {
        return Err(());
    }
    let ranges = &trimmed[6..];
    if ranges.contains(',') || ranges.is_empty() || total_size == 0 {
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

#[derive(Copy, Clone, Eq, PartialEq)]
enum FileDisposition {
    Attachment,
    Inline,
}

fn html_response(status: StatusCode, html: String) -> Response {
    let mut response = Response::new(Body::from(html));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0"),
    );
    response
}

async fn serve_hosted_file(
    file: HostedFile,
    headers: HeaderMap,
    disposition: FileDisposition,
) -> Result<Response, StatusCode> {
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
    let mut response = Response::new(Body::from_stream(stream));
    *response.status_mut() = status;

    if let Ok(value) = HeaderValue::from_str(&bytes_to_read.to_string()) {
        response.headers_mut().insert(header::CONTENT_LENGTH, value);
    }
    response
        .headers_mut()
        .insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0"),
    );

    if status == StatusCode::PARTIAL_CONTENT {
        if let Ok(value) =
            HeaderValue::from_str(&format!("bytes {start}-{end}/{total}", total = file.size))
        {
            response.headers_mut().insert(header::CONTENT_RANGE, value);
        }
    }

    if disposition == FileDisposition::Attachment {
        let ascii_name = ascii_filename_fallback(&file.name);
        let encoded_name = utf8_percent_encode(&file.name, FILENAME_ENCODE_SET).to_string();
        let value = format!(
            "attachment; filename=\"{}\"; filename*=UTF-8''{}",
            ascii_name, encoded_name
        );
        if let Ok(header_value) = HeaderValue::from_str(&value) {
            response
                .headers_mut()
                .insert(header::CONTENT_DISPOSITION, header_value);
        }
    } else if let Ok(header_value) = HeaderValue::from_str("inline") {
        response
            .headers_mut()
            .insert(header::CONTENT_DISPOSITION, header_value);
    }

    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type_for_name(&file.name)),
    );
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );

    Ok(response)
}

struct PreviewBuildError {
    title: &'static str,
    description: String,
}

struct DocxPreviewData {
    blocks: Vec<String>,
    truncated: bool,
}

fn preview_kind_label(kind: PreviewKind) -> &'static str {
    match kind {
        PreviewKind::Image => "Image preview",
        PreviewKind::Video => "Video preview",
        PreviewKind::Audio => "Audio preview",
        PreviewKind::Pdf => "PDF preview",
        PreviewKind::Text(TextPreviewKind::Plain) => "Text preview",
        PreviewKind::Text(TextPreviewKind::Json) => "JSON preview",
        PreviewKind::Text(TextPreviewKind::Csv) => "CSV preview",
        PreviewKind::Text(TextPreviewKind::Markdown) => "Markdown preview",
        PreviewKind::Docx => "DOCX preview",
    }
}

fn preview_summary(kind_label: &str, file_size: u64, truncated: bool) -> String {
    if truncated {
        format!(
            "{kind_label} - excerpt from {}",
            format_file_size(file_size)
        )
    } else {
        format!("{kind_label} - {}", format_file_size(file_size))
    }
}

fn excerpt_note(kind_label: &str, file_size: u64, max_bytes: u64) -> String {
    format!(
        "Showing the first {} of this {} to keep the page responsive. Download the original {} file for the full content.",
        format_file_size(max_bytes.min(file_size)),
        kind_label.to_ascii_lowercase(),
        kind_label.to_ascii_lowercase()
    )
}

fn clamp_chars(value: &str, max_chars: usize) -> (String, bool) {
    let mut output = String::new();
    let mut count = 0usize;
    for ch in value.chars() {
        if count == max_chars {
            return (output, true);
        }
        output.push(ch);
        count += 1;
    }
    (output, false)
}

fn join_preview_notes(notes: Vec<String>) -> Option<String> {
    let filtered = notes
        .into_iter()
        .filter(|note| !note.trim().is_empty())
        .collect::<Vec<_>>();

    if filtered.is_empty() {
        None
    } else {
        Some(filtered.join(" "))
    }
}

fn truncate_cell(value: &str) -> (String, bool) {
    let trimmed = value.trim();
    let mut output = String::new();
    let mut count = 0usize;
    for ch in trimmed.chars() {
        if count == CSV_PREVIEW_MAX_CELL_CHARS {
            output.push_str("...");
            return (output, true);
        }
        output.push(ch);
        count += 1;
    }
    (output, false)
}

fn normalize_docx_block(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

async fn read_preview_prefix(
    file: &HostedFile,
    max_bytes: u64,
) -> Result<Vec<u8>, PreviewBuildError> {
    let read_limit = file.size.min(max_bytes);
    let handle = File::open(&file.path)
        .await
        .map_err(|_| PreviewBuildError {
            title: "Preview unavailable",
            description: "The shared file could not be opened for inline preview.".to_string(),
        })?;
    let mut bytes = Vec::with_capacity(read_limit as usize);
    handle
        .take(read_limit)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| PreviewBuildError {
            title: "Preview unavailable",
            description: "FluxShare could not read the shared file for inline preview.".to_string(),
        })?;
    Ok(bytes)
}

async fn build_plain_text_preview(
    file: &HostedFile,
    kind: TextPreviewKind,
) -> Result<HostedPreviewDocument, PreviewBuildError> {
    let kind_label = preview_kind_label(PreviewKind::Text(kind));
    let bytes = read_preview_prefix(file, TEXT_PREVIEW_MAX_BYTES).await?;
    let mut notes = Vec::new();
    let mut preview_text = String::from_utf8_lossy(&bytes).replace('\u{feff}', "");
    let file_truncated = file.size > TEXT_PREVIEW_MAX_BYTES;

    if file_truncated {
        notes.push(excerpt_note(kind_label, file.size, TEXT_PREVIEW_MAX_BYTES));
    }

    let mut tone = PreviewTextTone::Monospace;
    let mut wrap = false;

    if matches!(kind, TextPreviewKind::Markdown) {
        tone = PreviewTextTone::Prose;
        wrap = true;
    }

    if matches!(kind, TextPreviewKind::Json) && !file_truncated {
        match serde_json::from_slice::<serde_json::Value>(&bytes) {
            Ok(value) => {
                preview_text =
                    serde_json::to_string_pretty(&value).unwrap_or_else(|_| preview_text.clone());
            }
            Err(_) => {
                notes.push(
                    "The JSON payload could not be reformatted cleanly, so FluxShare is showing the raw text excerpt."
                        .to_string(),
                );
            }
        }
    }

    let (preview_text, text_truncated) = clamp_chars(&preview_text, TEXT_PREVIEW_MAX_CHARS);
    if text_truncated {
        notes.push(
            "Only the first part of the document text is shown here. Download the file for the complete content."
                .to_string(),
        );
    }

    Ok(HostedPreviewDocument {
        name: file.name.clone(),
        kind_label: kind_label.to_string(),
        summary: preview_summary(kind_label, file.size, file_truncated || text_truncated),
        note: join_preview_notes(notes),
        body: PreviewDocumentBody::Text {
            text: preview_text,
            tone,
            wrap,
        },
    })
}

async fn build_csv_preview(file: &HostedFile) -> Result<HostedPreviewDocument, PreviewBuildError> {
    let kind_label = preview_kind_label(PreviewKind::Text(TextPreviewKind::Csv));
    let bytes = read_preview_prefix(file, TEXT_PREVIEW_MAX_BYTES).await?;
    let file_truncated = file.size > TEXT_PREVIEW_MAX_BYTES;
    let mut notes = Vec::new();
    let mut rows = Vec::new();
    let mut max_columns = 0usize;
    let mut row_truncated = false;
    let mut column_truncated = false;
    let mut parse_interrupted = false;

    let mut reader = ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(Cursor::new(bytes));

    for record in reader.records() {
        if rows.len() >= CSV_PREVIEW_MAX_ROWS {
            row_truncated = true;
            break;
        }

        match record {
            Ok(record) => {
                let mut row = Vec::new();
                for (index, field) in record.iter().enumerate() {
                    if index >= CSV_PREVIEW_MAX_COLUMNS {
                        column_truncated = true;
                        break;
                    }

                    let (cell, cell_truncated) = truncate_cell(field);
                    if cell_truncated {
                        column_truncated = true;
                    }
                    row.push(cell);
                }

                max_columns = max_columns.max(row.len());
                rows.push(row);
            }
            Err(_) => {
                parse_interrupted = true;
                break;
            }
        }
    }

    if rows.is_empty() {
        return Err(PreviewBuildError {
            title: "CSV preview unavailable",
            description:
                "FluxShare could not extract readable rows from this CSV file. Download the original file to inspect it."
                    .to_string(),
        });
    }

    if file_truncated {
        notes.push(excerpt_note(kind_label, file.size, TEXT_PREVIEW_MAX_BYTES));
    }
    if row_truncated {
        notes.push(format!(
            "Only the first {CSV_PREVIEW_MAX_ROWS} rows are shown in the inline preview."
        ));
    }
    if column_truncated {
        notes.push(format!(
            "Only the first {CSV_PREVIEW_MAX_COLUMNS} columns are shown here."
        ));
    }
    if parse_interrupted {
        notes.push(
            "The CSV preview stopped before the end of the file, likely because the excerpt ends inside a quoted row."
                .to_string(),
        );
    }

    let columns = (0..max_columns)
        .map(|index| format!("Column {}", index + 1))
        .collect::<Vec<_>>();

    for row in &mut rows {
        while row.len() < max_columns {
            row.push(String::new());
        }
    }

    Ok(HostedPreviewDocument {
        name: file.name.clone(),
        kind_label: kind_label.to_string(),
        summary: preview_summary(
            kind_label,
            file.size,
            file_truncated || row_truncated || column_truncated || parse_interrupted,
        ),
        note: join_preview_notes(notes),
        body: PreviewDocumentBody::Table { columns, rows },
    })
}

fn extract_docx_preview(path: &PathBuf) -> Result<DocxPreviewData, PreviewBuildError> {
    const WORD_NS: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    let docx_file = std::fs::File::open(path).map_err(|_| PreviewBuildError {
        title: "DOCX preview unavailable",
        description: "FluxShare could not open this DOCX package for inline preview.".to_string(),
    })?;
    let mut archive = ZipArchive::new(docx_file).map_err(|_| PreviewBuildError {
        title: "DOCX preview unavailable",
        description: "This DOCX package could not be read safely for inline preview.".to_string(),
    })?;
    let mut document_xml = archive
        .by_name("word/document.xml")
        .map_err(|_| PreviewBuildError {
            title: "DOCX preview unavailable",
            description: "This DOCX file does not contain a readable Word document payload."
                .to_string(),
        })?;

    if document_xml.size() > DOCX_PREVIEW_MAX_XML_BYTES {
        return Err(PreviewBuildError {
            title: "DOCX preview unavailable",
            description: "This document is too large for a safe inline preview. Download the original DOCX to view the full layout."
                .to_string(),
        });
    }

    let mut xml = String::new();
    document_xml
        .read_to_string(&mut xml)
        .map_err(|_| PreviewBuildError {
            title: "DOCX preview unavailable",
            description: "FluxShare could not extract text from this DOCX document.".to_string(),
        })?;

    let document = Document::parse(&xml).map_err(|_| PreviewBuildError {
        title: "DOCX preview unavailable",
        description: "FluxShare could not parse the extracted DOCX content for preview."
            .to_string(),
    })?;

    let mut blocks = Vec::new();
    let mut total_chars = 0usize;
    let mut truncated = false;

    for paragraph in document
        .descendants()
        .filter(|node| node.has_tag_name((WORD_NS, "p")))
    {
        let mut paragraph_text = String::new();
        for node in paragraph.descendants() {
            if node.has_tag_name((WORD_NS, "t")) {
                if let Some(text) = node.text() {
                    paragraph_text.push_str(text);
                }
            } else if node.has_tag_name((WORD_NS, "tab")) {
                paragraph_text.push('\t');
            } else if node.has_tag_name((WORD_NS, "br")) || node.has_tag_name((WORD_NS, "cr")) {
                paragraph_text.push('\n');
            }
        }

        let normalized = normalize_docx_block(&paragraph_text);
        if normalized.is_empty() {
            continue;
        }

        let next_chars = normalized.chars().count();
        if blocks.len() >= DOCX_PREVIEW_MAX_PARAGRAPHS
            || total_chars + next_chars > DOCX_PREVIEW_MAX_CHARS
        {
            truncated = true;
            break;
        }

        total_chars += next_chars;
        blocks.push(normalized);
    }

    if blocks.is_empty() {
        return Err(PreviewBuildError {
            title: "DOCX preview unavailable",
            description: "FluxShare did not find readable paragraph text in this DOCX document."
                .to_string(),
        });
    }

    Ok(DocxPreviewData { blocks, truncated })
}

async fn build_docx_preview(file: &HostedFile) -> Result<HostedPreviewDocument, PreviewBuildError> {
    let path = file.path.clone();
    let extracted = tauri::async_runtime::spawn_blocking(move || extract_docx_preview(&path))
        .await
        .map_err(|_| PreviewBuildError {
            title: "DOCX preview unavailable",
            description: "FluxShare could not finish preparing the DOCX preview.".to_string(),
        })??;

    let kind_label = preview_kind_label(PreviewKind::Docx);
    let mut notes = vec![
        "This reading view is generated from extracted DOCX text. Layout, tables, images and pagination can differ from the original document."
            .to_string(),
    ];
    if extracted.truncated {
        notes.push(
            "Only the first readable sections are shown here. Download the original DOCX for the full content."
                .to_string(),
        );
    }

    Ok(HostedPreviewDocument {
        name: file.name.clone(),
        kind_label: kind_label.to_string(),
        summary: preview_summary(kind_label, file.size, extracted.truncated),
        note: join_preview_notes(notes),
        body: PreviewDocumentBody::Blocks {
            blocks: extracted.blocks,
        },
    })
}

async fn build_preview_document(
    file: &HostedFile,
    kind: PreviewKind,
) -> Result<HostedPreviewDocument, PreviewBuildError> {
    match kind {
        PreviewKind::Text(TextPreviewKind::Csv) => build_csv_preview(file).await,
        PreviewKind::Text(text_kind) => build_plain_text_preview(file, text_kind).await,
        PreviewKind::Docx => build_docx_preview(file).await,
        _ => Err(PreviewBuildError {
            title: "Preview unavailable",
            description: "This file type is not rendered through the document preview pipeline."
                .to_string(),
        }),
    }
}

async fn download_handler(
    State(state): State<ServerState>,
    AxumPath((share_id, id)): AxumPath<(String, u64)>,
    headers: HeaderMap,
) -> Response {
    let file = match resolve_hosted_file(&state.manager, &share_id, Some(id)) {
        Ok(Some(file)) => Some(file),
        Err(HostedLookupError::FileChanged) => {
            return html_response(
                StatusCode::GONE,
                render_status_page(
                    "Arquivo alterado",
                    "O arquivo original mudou depois que este link foi criado. Gere um novo compartilhamento para publicar a nova versao.",
                    true,
                ),
            )
        }
        _ => {
            return html_response(
                StatusCode::NOT_FOUND,
                render_status_page(
                    "Arquivo indisponivel",
                    "Este arquivo nao esta mais disponivel para download. O compartilhamento pode ter expirado ou ter sido encerrado.",
                    true,
                ),
            )
        }
    };

    let Some(file) = file else {
        return html_response(
            StatusCode::NOT_FOUND,
            render_status_page(
                "Arquivo indisponível",
                "Este arquivo não está mais disponível para download. O compartilhamento pode ter expirado ou ter sido encerrado.",
                true,
            ),
        );
    };

    match serve_hosted_file(file, headers, FileDisposition::Attachment).await {
        Ok(response) => response,
        Err(StatusCode::RANGE_NOT_SATISFIABLE) => html_response(
            StatusCode::RANGE_NOT_SATISFIABLE,
            render_status_page(
                "Faixa inválida",
                "O navegador pediu um trecho do arquivo que não existe mais neste compartilhamento.",
                true,
            ),
        ),
        Err(_) => html_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            render_status_page(
                "Falha ao preparar o download",
                "O arquivo existe, mas não pôde ser transmitido agora. Atualize a página e tente novamente.",
                true,
            ),
        ),
    }
}

async fn preview_handler(
    State(state): State<ServerState>,
    AxumPath((share_id, id)): AxumPath<(String, u64)>,
    headers: HeaderMap,
) -> Response {
    let file = match resolve_hosted_file(&state.manager, &share_id, Some(id)) {
        Ok(Some(file)) => Some(file),
        Err(HostedLookupError::FileChanged) => {
            return html_response(
                StatusCode::GONE,
                render_preview_state_page(
                    "Changed file",
                    "Preview",
                    "Preview expired",
                    "This file changed after the share was created. Ask the sender for a fresh link.",
                    None,
                    None,
                ),
            )
        }
        _ => None,
    };

    let Some(file) = file else {
        return html_response(
            StatusCode::NOT_FOUND,
            render_preview_state_page(
                "Missing file",
                "Preview",
                "Preview unavailable",
                "This preview is no longer available. The file may have expired or the sender may have stopped sharing it.",
                None,
                None,
            ),
        );
    };
    let base_path = share_base_path(&share_id);

    let Some(kind) = preview_kind(&file.name) else {
        return html_response(
            StatusCode::NOT_FOUND,
            render_preview_state_page(
                &file.name,
                "Preview",
                "Preview not supported",
                "This file type does not expose a safe inline renderer yet. Download the original file to open it locally.",
                Some(&format!("{base_path}/download/{}", file.id)),
                Some("Download original"),
            ),
        );
    };

    match kind {
        PreviewKind::Image | PreviewKind::Video | PreviewKind::Audio | PreviewKind::Pdf => {
            let download_url = format!("{base_path}/download/{}", file.id);
            let file_name = file.name.clone();
            match serve_hosted_file(file, headers, FileDisposition::Inline).await {
                Ok(response) => response,
                Err(StatusCode::RANGE_NOT_SATISFIABLE) => html_response(
                    StatusCode::RANGE_NOT_SATISFIABLE,
                    render_preview_state_page(
                        &file_name,
                        preview_kind_label(kind),
                        "Preview range invalid",
                        "The browser requested a byte range that is no longer available for this preview. Refresh the page and try again.",
                        Some(&download_url),
                        Some("Download original"),
                    ),
                ),
                Err(_) => html_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    render_preview_state_page(
                        &file_name,
                        preview_kind_label(kind),
                        "Preview unavailable",
                        "FluxShare could not stream this preview right now. The original download may still be available.",
                        Some(&download_url),
                        Some("Download original"),
                    ),
                ),
            }
        }
        PreviewKind::Text(_) | PreviewKind::Docx => match build_preview_document(&file, kind).await
        {
            Ok(document) => html_response(StatusCode::OK, render_preview_document_page(&document)),
            Err(error) => html_response(
                StatusCode::OK,
                render_preview_state_page(
                    &file.name,
                    preview_kind_label(kind),
                    error.title,
                    &error.description,
                    Some(&format!("{base_path}/download/{}", file.id)),
                    Some("Download original"),
                ),
            ),
        },
    }
}

async fn raw_preview_handler(
    State(state): State<ServerState>,
    AxumPath((share_id, id)): AxumPath<(String, u64)>,
    headers: HeaderMap,
) -> Response {
    let file = match resolve_hosted_file(&state.manager, &share_id, Some(id)) {
        Ok(Some(file)) => Some(file),
        Err(HostedLookupError::FileChanged) => {
            return html_response(
                StatusCode::GONE,
                render_preview_state_page(
                    "Changed file",
                    "Preview",
                    "Preview expired",
                    "This file changed after the share was created. Ask the sender for a fresh link.",
                    None,
                    None,
                ),
            )
        }
        _ => None,
    };

    let Some(file) = file else {
        return html_response(
            StatusCode::NOT_FOUND,
            render_preview_state_page(
                "Missing file",
                "Preview",
                "Preview unavailable",
                "This preview is no longer available. The file may have expired or the sender may have stopped sharing it.",
                None,
                None,
            ),
        );
    };
    let base_path = share_base_path(&share_id);

    let Some(kind) = preview_kind(&file.name) else {
        return html_response(
            StatusCode::NOT_FOUND,
            render_preview_state_page(
                &file.name,
                "Preview",
                "Preview not supported",
                "This file type does not expose a raw inline preview stream. Download the original file to open it locally.",
                Some(&format!("{base_path}/download/{}", file.id)),
                Some("Download original"),
            ),
        );
    };

    match kind {
        PreviewKind::Image | PreviewKind::Video | PreviewKind::Audio | PreviewKind::Pdf => {
            let download_url = format!("{base_path}/download/{}", file.id);
            let file_name = file.name.clone();
            match serve_hosted_file(file, headers, FileDisposition::Inline).await {
                Ok(response) => response,
                Err(StatusCode::RANGE_NOT_SATISFIABLE) => html_response(
                    StatusCode::RANGE_NOT_SATISFIABLE,
                    render_preview_state_page(
                        &file_name,
                        preview_kind_label(kind),
                        "Preview range invalid",
                        "The browser requested a byte range that is no longer available for this preview. Refresh the page and try again.",
                        Some(&download_url),
                        Some("Download original"),
                    ),
                ),
                Err(_) => html_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    render_preview_state_page(
                        &file_name,
                        preview_kind_label(kind),
                        "Preview unavailable",
                        "FluxShare could not stream this preview right now. The original download may still be available.",
                        Some(&download_url),
                        Some("Download original"),
                    ),
                ),
            }
        }
        PreviewKind::Text(_) | PreviewKind::Docx => html_response(
            StatusCode::NOT_FOUND,
            render_preview_state_page(
                &file.name,
                preview_kind_label(kind),
                "Open the reading view instead",
                "This file uses FluxShare's document preview renderer rather than a raw inline media stream.",
                Some(&format!("{base_path}/preview/{}", file.id)),
                Some("Open preview"),
            ),
        ),
    }
}

async fn not_found_handler() -> Response {
    html_response(
        StatusCode::NOT_FOUND,
        render_status_page(
            "Página não encontrada",
            "O endereço acessado não existe neste compartilhamento ou já não está mais disponível.",
            true,
        ),
    )
}

async fn ensure_http_server(manager: &TunnelManager) -> Result<u16, String> {
    {
        let mut state = manager.inner.lock();
        cleanup_finished(&mut state);
        if let Some(port) = state.server_port {
            return Ok(port);
        }
    }

    let (ready_tx, ready_rx) = oneshot::channel::<Result<u16, String>>();
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let server_manager = manager.clone();

    let handle = tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(("127.0.0.1", 0)).await {
            Ok(listener) => listener,
            Err(error) => {
                let _ = ready_tx.send(Err(format!("failed to bind local HTTP port: {error}")));
                return;
            }
        };

        let port = match listener.local_addr() {
            Ok(addr) => addr.port(),
            Err(error) => {
                let _ = ready_tx.send(Err(format!("failed to resolve local HTTP port: {error}")));
                return;
            }
        };

        let router = Router::new()
            .route("/:share_id", get(index_handler))
            .route("/:share_id/", get(index_handler))
            .route("/:share_id/download/:id", get(download_handler))
            .route("/:share_id/preview/:id", get(preview_handler))
            .route("/:share_id/preview/:id/raw", get(raw_preview_handler))
            .route("/health", get(|| async { Html("ok") }))
            .fallback(get(not_found_handler))
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
        .map_err(|_| "failed to start local HTTP server".to_string())??;

    let mut state = manager.inner.lock();
    state.server_handle = Some(handle);
    state.server_shutdown = Some(shutdown_tx);
    state.server_port = Some(port);
    refresh_exposed_urls(&mut state);
    Ok(port)
}

fn build_health_url(base_url: &str) -> String {
    format!("{}/health", base_url.trim_end_matches('/'))
}

fn build_cloudflared_ready_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/ready")
}

fn build_probe_url(base_url: &str) -> String {
    match url::Url::parse(base_url) {
        Ok(url) => match url.host_str() {
            Some(host) if host == "127.0.0.1" || host == "localhost" => format!(
                "{}://{}:{}/health",
                url.scheme(),
                host,
                url.port_or_known_default().unwrap_or(80)
            ),
            _ => base_url.trim_end_matches('/').to_string(),
        },
        Err(_) => base_url.trim_end_matches('/').to_string(),
    }
}

fn is_private_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.octets() == [169, 254, 169, 254]
        || (ip.octets()[0] == 100 && (ip.octets()[1] & 0b1100_0000) == 0b0100_0000)
}

fn is_private_ipv6(ip: Ipv6Addr) -> bool {
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_unicast_link_local()
        || (ip.segments()[0] & 0xfe00) == 0xfc00
}

fn normalize_host(host: &str) -> String {
    host.trim().trim_end_matches('.').to_ascii_lowercase()
}

fn is_internal_hostname(host: &str) -> bool {
    host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.ends_with(".home")
        || !host.contains('.')
}

fn validate_probe_target(
    target: &str,
    allowed_public_host: Option<&str>,
    allowed_local_port: Option<u16>,
) -> Result<url::Url, String> {
    let url = url::Url::parse(target).map_err(|error| format!("invalid probe target: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("probe target must use http or https".to_string());
    }

    let host = url
        .host_str()
        .map(normalize_host)
        .ok_or_else(|| "probe target is missing a host".to_string())?;
    let allowed_public_host = allowed_public_host.map(normalize_host);

    if let Ok(ip) = host.parse::<IpAddr>() {
        match ip {
            IpAddr::V4(ipv4) => {
                if let Some(port) = allowed_local_port {
                    if url.scheme() == "http"
                        && ipv4 == Ipv4Addr::new(127, 0, 0, 1)
                        && url.port_or_known_default() == Some(port)
                    {
                        return Ok(url);
                    }
                }
                if is_private_ipv4(ipv4) {
                    return Err("probe target resolves to a blocked private IPv4 address".to_string());
                }
            }
            IpAddr::V6(ipv6) => {
                if is_private_ipv6(ipv6) {
                    return Err("probe target resolves to a blocked private IPv6 address".to_string());
                }
            }
        }
    } else {
        if let Some(allowed_host) = allowed_public_host {
            if host == allowed_host && url.scheme() == "https" {
                return Ok(url);
            }
        }

        if is_internal_hostname(&host) {
            return Err("probe target uses a blocked internal hostname".to_string());
        }

        return Err("probe target host is not on the allowlist".to_string());
    }

    Ok(url)
}

fn reserve_loopback_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .map_err(|error| format!("failed to reserve local metrics port: {error}"))
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(Policy::limited(5))
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|error| error.to_string())
}

fn build_probe_http_client(
    allowed_public_host: Option<&str>,
    allowed_local_port: Option<u16>,
) -> Result<reqwest::Client, String> {
    let allowed_public_host = allowed_public_host.map(normalize_host);
    reqwest::Client::builder()
        .redirect(Policy::custom(move |attempt| {
            if attempt.previous().len() >= 3 {
                return attempt.error("too many redirects");
            }
            match validate_probe_target(attempt.url().as_str(), allowed_public_host.as_deref(), allowed_local_port) {
                Ok(_) => attempt.follow(),
                Err(error) => attempt.error(error),
            }
        }))
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|error| error.to_string())
}

async fn probe_endpoint_with_client(
    client: &reqwest::Client,
    target: &str,
) -> Result<(bool, Option<u16>, String), String> {
    match client.get(target).send().await {
        Ok(response) => {
            let status = response.status();
            let ok = status.is_success() || status.is_redirection();
            let message = if ok {
                format!("Endpoint ready ({status})")
            } else {
                format!("Endpoint responded with {status}")
            };
            Ok((ok, Some(status.as_u16()), message))
        }
        Err(error) => Err(error.to_string()),
    }
}

async fn wait_for_endpoint(
    client: &reqwest::Client,
    target: &str,
    timeout: Duration,
) -> Result<(), String> {
    let started_at = Instant::now();

    loop {
        let last_error = match probe_endpoint_with_client(client, target).await {
            Ok((true, _, _)) => return Ok(()),
            Ok((false, _, message)) => message,
            Err(error) => error,
        };

        if started_at.elapsed() >= timeout {
            return Err(last_error);
        }

        sleep(HEALTH_CHECK_INTERVAL).await;
    }
}

async fn join_log_handles(log_handles: Vec<ThreadJoinHandle<()>>) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        for handle in log_handles {
            let _ = handle.join();
        }
    })
    .await;
}

async fn shutdown_public_tunnel(
    manager: &TunnelManager,
    kill: bool,
) -> Result<Option<i32>, String> {
    let (child, log_handles, monitor_handle) = {
        let mut state = manager.inner.lock();
        (
            state.child.take(),
            state.log_handles.drain(..).collect::<Vec<_>>(),
            state.exit_monitor.take(),
        )
    };

    if let Some(handle) = monitor_handle {
        handle.abort();
    }

    let exit_code = if let Some(mut child) = child {
        if kill {
            let _ = child.kill();
        }
        child.wait().ok().and_then(|status| status.code())
    } else {
        None
    };

    join_log_handles(log_handles).await;
    Ok(exit_code)
}

fn spawn_log_reader<R: BufRead + Send + 'static>(
    reader: R,
    source: &'static str,
    app: tauri::AppHandle,
    url_sender: std::sync::mpsc::Sender<String>,
) -> ThreadJoinHandle<()> {
    std::thread::spawn(move || {
        for line in reader.lines().flatten() {
            let formatted = format!("[{source}] {line}");
            emit_log(&app, &formatted);
            if let Some(url) = extract_url(&line) {
                let _ = url_sender.send(url);
            }
        }
    })
}

fn extract_url(line: &str) -> Option<String> {
    let start = line
        .find("https://")
        .or_else(|| line.find("http://"))
        .or_else(|| line.find("trycloudflare.com"))?;

    let raw = &line[start..];
    let token = raw
        .split(|ch: char| {
            ch.is_whitespace() || matches!(ch, '"' | '\'' | '<' | '>' | '\u{1b}' | '(' | ')')
        })
        .next()?
        .trim_matches(|ch: char| matches!(ch, '"' | '\'' | '`'))
        .trim_end_matches(|ch: char| matches!(ch, '.' | ',' | ';' | ':' | ')' | ']' | '}'));

    let candidate = if token.starts_with("http://") || token.starts_with("https://") {
        token.to_string()
    } else {
        format!("https://{token}")
    };

    url::Url::parse(&candidate)
        .ok()
        .filter(|url| {
            url.host_str()
                .map(|host| host != "trycloudflare.com" && host.ends_with(".trycloudflare.com"))
                .unwrap_or(false)
        })
        .map(|url| url.to_string())
}

fn spawn_public_readiness_monitor(app: tauri::AppHandle, url: String) {
    tauri::async_runtime::spawn(async move {
        let client = match build_http_client() {
            Ok(client) => client,
            Err(error) => {
                emit_log(
                    &app,
                    &format!("Public readiness probe setup failed: {error}"),
                );
                return;
            }
        };

        let probe_url = build_probe_url(&url);
        match wait_for_endpoint(&client, &probe_url, PUBLIC_READY_TIMEOUT).await {
            Ok(_) => emit_log(&app, &format!("Public URL answered successfully: {url}")),
            Err(error) => emit_log(
                &app,
                &format!("Public URL still not answering from this device at {probe_url}: {error}"),
            ),
        }
    });
}

fn spawn_cloudflared_ready_monitor(
    app: tauri::AppHandle,
    manager: TunnelManager,
    url: String,
    metrics_port: u16,
) {
    tauri::async_runtime::spawn(async move {
        let client = match build_http_client() {
            Ok(client) => client,
            Err(error) => {
                let should_emit = {
                    let mut state = manager.inner.lock();
                    if state.public_base_url.as_deref() != Some(url.as_str()) || state.child.is_none() {
                        false
                    } else {
                        state.public_ready = false;
                        state.last_error = Some(error.clone());
                        set_phase(
                            &mut state,
                            "failed",
                            Some("Failed to start tunnel readiness checks".to_string()),
                        );
                        state.desired_tunnel = false;
                        true
                    }
                };
                if should_emit {
                    emit_status(&app, &manager);
                    emit_log(
                        &app,
                        &format!("Failed to create readiness probe client: {error}"),
                    );
                }
                return;
            }
        };

        let ready_url = build_cloudflared_ready_url(metrics_port);
        match wait_for_endpoint(&client, &ready_url, PUBLIC_READY_TIMEOUT).await {
            Ok(_) => {
                mark_tunnel_online(&app, &manager, &url, "Tunnel connected to Cloudflare");
                spawn_public_readiness_monitor(app.clone(), url);
            }
            Err(error) => {
                let should_emit = {
                    let mut state = manager.inner.lock();
                    if state.public_base_url.as_deref() != Some(url.as_str()) || state.child.is_none() {
                        false
                    } else {
                        state.public_ready = false;
                        state.last_error = Some(error.clone());
                        state.desired_tunnel = false;
                        set_phase(
                            &mut state,
                            "failed",
                            Some("Tunnel did not connect to Cloudflare in time".to_string()),
                        );
                        true
                    }
                };
                if should_emit {
                    emit_status(&app, &manager);
                    emit_log(
                        &app,
                        &format!("Tunnel readiness timed out via {ready_url}: {error}"),
                    );
                }
            }
        }
    });
}

fn mark_tunnel_online(app: &tauri::AppHandle, manager: &TunnelManager, url: &str, message: &str) {
    let should_emit = {
        let mut state = manager.inner.lock();
        if state.public_base_url.as_deref() != Some(url) || state.child.is_none() {
            false
        } else {
            state.public_ready = true;
            state.last_error = None;
            state.reconnect_attempts = 0;
            refresh_exposed_urls(&mut state);
            set_phase(&mut state, "online", Some(message.to_string()));
            true
        }
    };

    if should_emit {
        emit_status(app, manager);
        emit_log(app, &format!("Tunnel connected to Cloudflare edge: {url}"));
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_cloudflared_ready_url, build_probe_url, compose_share_url, extract_url,
        resolve_hosted_file, validate_probe_target, HostedFile, HostedLookupError, TunnelManager,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn extracts_plain_trycloudflare_url() {
        let line = "INF | https://orange-waterfall.trycloudflare.com";
        let url = extract_url(line).expect("url should be extracted");
        assert_eq!(url, "https://orange-waterfall.trycloudflare.com/");
    }

    #[test]
    fn extracts_trycloudflare_url_with_ansi_suffix() {
        let line = "\u{1b}[32mINF\u{1b}[0m tunnel available at https://orange-waterfall.trycloudflare.com\u{1b}[0m";
        let url = extract_url(line).expect("url should be extracted");
        assert_eq!(url, "https://orange-waterfall.trycloudflare.com/");
    }

    #[test]
    fn ignores_root_trycloudflare_domain() {
        let line = "Read more at https://trycloudflare.com";
        let url = extract_url(line);
        assert!(url.is_none());
    }

    #[test]
    fn uses_health_probe_for_local_urls() {
        let url = build_probe_url("http://127.0.0.1:7777/");
        assert_eq!(url, "http://127.0.0.1:7777/health");
    }

    #[test]
    fn uses_root_probe_for_public_urls() {
        let url = build_probe_url("https://orange-waterfall.trycloudflare.com/");
        assert_eq!(url, "https://orange-waterfall.trycloudflare.com");
    }

    #[test]
    fn builds_cloudflared_ready_url() {
        let url = build_cloudflared_ready_url(60123);
        assert_eq!(url, "http://127.0.0.1:60123/ready");
    }

    #[test]
    fn builds_share_scoped_urls() {
        let url = compose_share_url("https://orange-waterfall.trycloudflare.com/", Some("share123"));
        assert_eq!(url, "https://orange-waterfall.trycloudflare.com/share123/");
    }

    #[test]
    fn old_share_ids_do_not_resolve_new_files() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("file.txt");
        fs::write(&path, b"hello").unwrap();
        let metadata = fs::metadata(&path).unwrap();

        let manager = TunnelManager::default();
        {
            let mut state = manager.inner.lock();
            state.share_id = Some("new-share".to_string());
            state.files = vec![HostedFile {
                id: 0,
                path: path.clone(),
                name: "file.txt".to_string(),
                size: metadata.len(),
                modified_at_ms: super::metadata_modified_ms(&metadata),
            }];
        }

        let error = resolve_hosted_file(&manager, "old-share", Some(0)).expect_err("old share must not resolve");
        assert!(matches!(error, HostedLookupError::ShareUnavailable));
    }

    #[test]
    fn blocks_loopback_and_internal_probe_targets() {
        let loopback = validate_probe_target("http://127.0.0.1:9000/", None, Some(7777))
            .expect_err("unexpected local port should be blocked");
        assert!(loopback.contains("blocked"));

        let private_ip =
            validate_probe_target("https://10.20.30.40/status", Some("orange-waterfall.trycloudflare.com"), None)
                .expect_err("private IPv4 should be blocked");
        assert!(private_ip.contains("blocked"));

        let internal =
            validate_probe_target("https://db.internal/status", Some("orange-waterfall.trycloudflare.com"), None)
                .expect_err("internal hostname should be blocked");
        assert!(internal.contains("blocked"));
    }
}

async fn start_cloudflared_inner(
    app: &tauri::AppHandle,
    manager: &TunnelManager,
) -> Result<String, String> {
    {
        let mut state = manager.inner.lock();
        cleanup_finished(&mut state);
        if let Some(child) = state.child.as_mut() {
            if child
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_none()
                && state.public_ready
            {
                if let Some(url) = state.public_base_url.clone() {
                    return Ok(url);
                }
            }
        }
        state.provider = Some("cloudflare".to_string());
        state.last_error = None;
        state.public_ready = false;
        refresh_exposed_urls(&mut state);
        set_phase(
            &mut state,
            "starting",
            Some("Launching cloudflare tunnel".to_string()),
        );
    }
    emit_status(app, manager);

    let port = ensure_http_server(manager).await?;
    let local_url = format!("http://127.0.0.1:{port}/");
    let local_health_url = build_health_url(&local_url);
    let client = build_http_client()?;

    {
        let mut state = manager.inner.lock();
        state.local_ready = false;
        set_phase(
            &mut state,
            "waiting_local",
            Some("Checking local server availability".to_string()),
        );
    }
    emit_status(app, manager);
    wait_for_endpoint(&client, &local_health_url, HEALTH_CHECK_TIMEOUT).await?;

    {
        let mut state = manager.inner.lock();
        state.local_ready = true;
        set_phase(
            &mut state,
            "starting",
            Some("Local server ready. Requesting public address".to_string()),
        );
    }
    emit_status(app, manager);

    let binary = which("cloudflared").map_err(|_| "cloudflared not found in PATH".to_string())?;
    let metrics_port = reserve_loopback_port()?;
    emit_log(
        app,
        &format!("Starting cloudflared against http://127.0.0.1:{port}"),
    );
    emit_log(
        app,
        &format!("Cloudflared readiness endpoint reserved at 127.0.0.1:{metrics_port}"),
    );

    let mut child = Command::new(binary)
        .args([
            "--no-autoupdate",
            "tunnel",
            "--metrics",
            &format!("127.0.0.1:{metrics_port}"),
            "--url",
            &format!("http://127.0.0.1:{port}"),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start cloudflared: {error}"))?;

    let stdout = child.stdout.take().map(BufReader::new);
    let stderr = child.stderr.take().map(BufReader::new);
    let (url_tx, url_rx) = std::sync::mpsc::channel();
    let mut log_handles = Vec::new();

    if let Some(reader) = stdout {
        log_handles.push(spawn_log_reader(
            reader,
            "stdout",
            app.clone(),
            url_tx.clone(),
        ));
    }
    if let Some(reader) = stderr {
        log_handles.push(spawn_log_reader(
            reader,
            "stderr",
            app.clone(),
            url_tx.clone(),
        ));
    }
    drop(url_tx);

    let url = match url_rx.recv_timeout(URL_DETECTION_TIMEOUT) {
        Ok(url) => url,
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            join_log_handles(log_handles).await;
            return Err("cloudflared did not announce a public URL in time".to_string());
        }
    };

    {
        let mut state = manager.inner.lock();
        state.child = Some(child);
        state.public_base_url = Some(url.clone());
        refresh_exposed_urls(&mut state);
        state.log_handles.extend(log_handles);
        state.public_ready = false;
        set_phase(
            &mut state,
            "waiting_public",
            Some("Public URL announced. Validating availability".to_string()),
        );
    }

    let exit_monitor = spawn_exit_monitor(app.clone(), manager.clone());
    {
        let mut state = manager.inner.lock();
        state.exit_monitor = Some(exit_monitor);
    }
    emit_status(app, manager);

    let ready_url = build_cloudflared_ready_url(metrics_port);
    if wait_for_endpoint(&client, &ready_url, FAST_READY_TIMEOUT)
        .await
        .is_ok()
    {
        mark_tunnel_online(app, manager, &url, "Tunnel connected to Cloudflare");
        spawn_public_readiness_monitor(app.clone(), url.clone());
        return Ok(url);
    }

    spawn_cloudflared_ready_monitor(app.clone(), manager.clone(), url.clone(), metrics_port);
    Ok(url)
}

async fn handle_unexpected_exit(
    app: &tauri::AppHandle,
    manager: &TunnelManager,
    code: Option<i32>,
) {
    let exit_message = format!("Tunnel process exited with code {}", code.unwrap_or(-1));
    let (log_handles, should_reconnect) = {
        let mut state = manager.inner.lock();
        state.child = None;
        state.public_base_url = None;
        state.url = None;
        state.public_ready = false;
        state.exit_monitor = None;
        refresh_exposed_urls(&mut state);
        let should_reconnect =
            state.desired_tunnel && state.reconnect_attempts < MAX_RECONNECT_ATTEMPTS;
        if should_reconnect {
            state.reconnect_attempts += 1;
            state.last_error = Some(exit_message.clone());
            set_phase(
                &mut state,
                "reconnecting",
                Some("Tunnel disconnected. Reconnecting".to_string()),
            );
        } else {
            state.desired_tunnel = false;
            state.last_error = Some(exit_message.clone());
            let phase = if state.local_ready {
                "failed"
            } else {
                "stopped"
            };
            set_phase(&mut state, phase, Some(exit_message.clone()));
        }
        (
            state.log_handles.drain(..).collect::<Vec<_>>(),
            should_reconnect,
        )
    };

    join_log_handles(log_handles).await;
    emit_log(app, &exit_message);
    emit_status(app, manager);

    if should_reconnect {
        sleep(RECONNECT_DELAY).await;
        match start_cloudflared_inner(app, manager).await {
            Ok(url) => emit_log(app, &format!("Tunnel reconnected: {url}")),
            Err(error) => {
                {
                    let mut state = manager.inner.lock();
                    state.desired_tunnel = false;
                    state.last_error = Some(error.clone());
                    state.public_ready = false;
                    state.public_base_url = None;
                    state.url = None;
                    refresh_exposed_urls(&mut state);
                    set_phase(
                        &mut state,
                        "failed",
                        Some("Reconnect attempt failed".to_string()),
                    );
                }
                emit_status(app, manager);
                let resolved = emit_tunnel_stopped(app, code);
                emit_log(
                    app,
                    &format!("Reconnect failed after exit (code {resolved}): {error}"),
                );
            }
        }
    } else {
        let resolved = emit_tunnel_stopped(app, code);
        emit_log(
            app,
            &format!("Tunnel stopped unexpectedly (code {resolved})."),
        );
    }
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
                    handle_unexpected_exit(&app, &manager, status.code()).await;
                    return;
                }
                Some(Err(error)) => {
                    tracing::error!(?error, "cloudflare_tunnel_wait_error");
                    handle_unexpected_exit(&app, &manager, None).await;
                    return;
                }
                None => sleep(Duration::from_millis(500)).await,
            }
        }
    })
}

async fn stop_all(app: &tauri::AppHandle, manager: &TunnelManager) -> Result<(), String> {
    {
        let mut state = manager.inner.lock();
        state.desired_tunnel = false;
        state.reconnect_attempts = 0;
        state.last_error = None;
        set_phase(&mut state, "stopping", Some("Stopping tunnel".to_string()));
    }
    emit_status(app, manager);

    let exit_code = shutdown_public_tunnel(manager, true).await?;

    let (server_shutdown, server_handle) = {
        let mut state = manager.inner.lock();
        let shutdown = state.server_shutdown.take();
        let handle = state.server_handle.take();
        let hosted_files = state.files.drain(..).collect::<Vec<_>>();
        cleanup_hosted_artifacts(app, &hosted_files);
        state.server_port = None;
        state.next_file_id = 0;
        state.share_id = None;
        state.public_base_url = None;
        state.url = None;
        state.local_url = None;
        state.provider = None;
        state.public_ready = false;
        state.local_ready = false;
        state.last_error = None;
        refresh_exposed_urls(&mut state);
        set_phase(&mut state, "stopped", Some("Tunnel stopped".to_string()));
        (shutdown, handle)
    };

    if let Some(tx) = server_shutdown {
        let _ = tx.send(());
    }
    if let Some(handle) = server_handle {
        let _ = handle.await;
    }

    let code = emit_tunnel_stopped(app, exit_code);
    emit_status(app, manager);
    emit_log(app, &format!("Tunnel stopped (code {code})."));
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
                return Err(format!("file not found: {raw}"));
            }
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("failed to read metadata for {raw}: {error}"))?;
            if !metadata.is_file() {
                return Err(format!("path is not a file: {raw}"));
            }
            let name = path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| raw.clone());
            Ok((path, name, metadata.len(), metadata_modified_ms(&metadata)))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let summaries = {
        let mut state = manager.inner.lock();
        cleanup_finished(&mut state);
        let previous_files = state.files.drain(..).collect::<Vec<_>>();
        cleanup_hosted_artifacts(&app, &previous_files);
        state.next_file_id = 0;
        state.share_id = Some(random_share_id());
        let mut hosted = Vec::with_capacity(prepared.len());
        for (path, name, size, modified_at_ms) in prepared {
            let id = state.next_file_id;
            state.next_file_id += 1;
            hosted.push(HostedFile {
                id,
                path,
                name,
                size,
                modified_at_ms,
            });
        }
        state.files = hosted;
        state.public_ready = false;
        state.last_error = None;
        refresh_exposed_urls(&mut state);
        summarize_files(&state.files)
    };

    let port = ensure_http_server(&manager).await?;
    let share_id = {
        let state = manager.inner.lock();
        state.share_id.clone()
    };
    let local_url = compose_share_url(&format!("http://127.0.0.1:{port}"), share_id.as_deref());
    let local_health_url = build_health_url(&format!("http://127.0.0.1:{port}/"));
    let client = build_http_client()?;

    {
        let mut state = manager.inner.lock();
        state.local_ready = false;
        refresh_exposed_urls(&mut state);
        set_phase(
            &mut state,
            "waiting_local",
            Some("Preparing local host".to_string()),
        );
    }
    emit_status(&app, &manager);
    wait_for_endpoint(&client, &local_health_url, HEALTH_CHECK_TIMEOUT).await?;

    {
        let mut state = manager.inner.lock();
        state.local_ready = true;
        refresh_exposed_urls(&mut state);
        set_phase(&mut state, "starting", Some("Local host ready".to_string()));
    }
    emit_status(&app, &manager);

    if summaries.is_empty() {
        emit_log(&app, "Hosting 0 files.");
    } else {
        let names = summaries
            .iter()
            .map(|file| file.name.clone())
            .collect::<Vec<_>>()
            .join(", ");
        emit_log(&app, &format!("Hosting {} files: {names}", summaries.len()));
    }

    let wants_tunnel = cf_mode
        .as_deref()
        .map(|mode| mode.eq_ignore_ascii_case("cloudflared"))
        .unwrap_or(false);

    let public_url = if wants_tunnel {
        {
            let mut state = manager.inner.lock();
            state.desired_tunnel = true;
            state.reconnect_attempts = 0;
            refresh_exposed_urls(&mut state);
        }
        match start_cloudflared_inner(&app, &manager).await {
            Ok(url) => Some(compose_share_url(&url, share_id.as_deref())),
            Err(error) => {
                let mut state = manager.inner.lock();
                state.desired_tunnel = false;
                state.last_error = Some(error.clone());
                set_phase(
                    &mut state,
                    "failed",
                    Some("Public tunnel failed to start".to_string()),
                );
                drop(state);
                emit_status(&app, &manager);
                return Err(error);
            }
        }
    } else {
        let _ = shutdown_public_tunnel(&manager, true).await?;
        {
            let mut state = manager.inner.lock();
            state.desired_tunnel = false;
            state.provider = None;
            state.public_base_url = None;
            state.url = None;
            state.public_ready = false;
            state.last_error = None;
            refresh_exposed_urls(&mut state);
            set_phase(
                &mut state,
                "online",
                Some("Local link ready. Public tunnel disabled".to_string()),
            );
        }
        emit_status(&app, &manager);
        None
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
    {
        let mut state = manager.inner.lock();
        state.desired_tunnel = true;
        state.reconnect_attempts = 0;
        state.last_error = None;
        refresh_exposed_urls(&mut state);
    }

    match start_cloudflared_inner(&app, &manager).await {
        Ok(url) => {
            let share_id = {
                let state = manager.inner.lock();
                state.share_id.clone()
            };
            Ok(TunnelInfo {
                public_url: compose_share_url(&url, share_id.as_deref()),
            })
        }
        Err(error) => {
            let mut state = manager.inner.lock();
            state.desired_tunnel = false;
            state.last_error = Some(error.clone());
            state.public_base_url = None;
            state.url = None;
            refresh_exposed_urls(&mut state);
            set_phase(
                &mut state,
                "failed",
                Some("Public tunnel failed to start".to_string()),
            );
            drop(state);
            emit_status(&app, &manager);
            Err(error)
        }
    }
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
    Ok(summarize_state(&state))
}

#[tauri::command]
pub async fn probe_tunnel_endpoint(
    manager: tauri::State<'_, TunnelManager>,
    target: Option<String>,
) -> Result<ProbeResult, String> {
    let (endpoint, allowed_public_host, allowed_local_port) = {
        let state = manager.inner.lock();
        let endpoint = if let Some(target) = target {
            target
        } else if let Some(url) = state.url.clone() {
            url
        } else if let Some(local_url) = state.local_url.clone() {
            local_url
        } else {
            return Ok(ProbeResult {
                ok: false,
                status_code: None,
                message: "No tunnel endpoint available".to_string(),
            });
        };

        let allowed_public_host = state
            .public_base_url
            .as_ref()
            .and_then(|url| url::Url::parse(url).ok())
            .and_then(|url| url.host_str().map(str::to_string));
        (endpoint, allowed_public_host, state.server_port)
    };

    let validated = match validate_probe_target(&endpoint, allowed_public_host.as_deref(), allowed_local_port) {
        Ok(url) => url,
        Err(message) => {
            return Ok(ProbeResult {
                ok: false,
                status_code: None,
                message,
            })
        }
    };

    let client = build_probe_http_client(allowed_public_host.as_deref(), allowed_local_port)?;
    match probe_endpoint_with_client(&client, &build_probe_url(validated.as_str())).await {
        Ok((ok, status_code, message)) => Ok(ProbeResult {
            ok,
            status_code,
            message,
        }),
        Err(error) => Ok(ProbeResult {
            ok: false,
            status_code: None,
            message: error,
        }),
    }
}
