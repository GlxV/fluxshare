use std::fmt::Write as _;

#[derive(Clone)]
pub struct HostedPageFile {
    pub id: u64,
    pub name: String,
    pub size: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextPreviewKind {
    Plain,
    Json,
    Csv,
    Markdown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreviewKind {
    Image,
    Video,
    Audio,
    Pdf,
    Text(TextPreviewKind),
    Docx,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HostedFileKind {
    Image,
    Video,
    Audio,
    Pdf,
    Archive,
    Document,
    Code,
    File,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreviewTextTone {
    Monospace,
    Prose,
}

pub enum PreviewDocumentBody {
    Text {
        text: String,
        tone: PreviewTextTone,
        wrap: bool,
    },
    Table {
        columns: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    Blocks {
        blocks: Vec<String>,
    },
}

pub struct HostedPreviewDocument {
    pub name: String,
    pub kind_label: String,
    pub summary: String,
    pub note: Option<String>,
    pub body: PreviewDocumentBody,
}

const HOSTED_PAGE_STYLES: &str = include_str!("hosted_page.css");
const HOSTED_PAGE_SCRIPT: &str = include_str!("hosted_page.js");

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn file_extension(name: &str) -> Option<&str> {
    name.rsplit_once('.')
        .map(|(_, ext)| ext.trim())
        .filter(|ext| !ext.is_empty())
}

fn extension_badge(name: &str) -> String {
    file_extension(name)
        .map(|ext| ext.chars().take(6).collect::<String>().to_ascii_uppercase())
        .filter(|ext| !ext.is_empty())
        .unwrap_or_else(|| "FILE".to_string())
}

fn classify_file(name: &str) -> HostedFileKind {
    match file_extension(name)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" => HostedFileKind::Image,
        "svg" => HostedFileKind::Code,
        "mp4" | "mov" | "webm" | "mkv" | "avi" | "m4v" => HostedFileKind::Video,
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" => HostedFileKind::Audio,
        "pdf" => HostedFileKind::Pdf,
        "zip" | "rar" | "7z" | "tar" | "gz" | "tgz" => HostedFileKind::Archive,
        "doc" | "docx" | "ppt" | "pptx" | "xls" | "xlsx" | "txt" | "rtf" | "csv" | "log" => {
            HostedFileKind::Document
        }
        "json" | "xml" | "toml" | "yaml" | "yml" | "md" | "ts" | "tsx" | "js" | "jsx" | "rs"
        | "py" | "java" | "go" | "html" | "css" => HostedFileKind::Code,
        _ => HostedFileKind::File,
    }
}

fn kind_label(kind: HostedFileKind) -> &'static str {
    match kind {
        HostedFileKind::Image => "Image",
        HostedFileKind::Video => "Video",
        HostedFileKind::Audio => "Audio",
        HostedFileKind::Pdf => "PDF",
        HostedFileKind::Archive => "Archive",
        HostedFileKind::Document => "Document",
        HostedFileKind::Code => "Code",
        HostedFileKind::File => "File",
    }
}

fn preview_button_label(kind: PreviewKind) -> &'static str {
    match kind {
        PreviewKind::Image | PreviewKind::Video | PreviewKind::Audio => "Open preview",
        PreviewKind::Pdf => "Open PDF",
        PreviewKind::Text(_) | PreviewKind::Docx => "Open reading view",
    }
}

fn render_support_label(kind: Option<PreviewKind>) -> &'static str {
    match kind {
        Some(PreviewKind::Pdf) => "PDF preview",
        Some(PreviewKind::Text(_)) => "Text preview",
        Some(PreviewKind::Docx) => "DOCX preview",
        Some(_) => "Inline preview",
        None => "Download only",
    }
}

pub fn preview_kind(name: &str) -> Option<PreviewKind> {
    match file_extension(name)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" => Some(PreviewKind::Image),
        "mp4" | "mov" | "webm" | "mkv" | "avi" | "m4v" => Some(PreviewKind::Video),
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" => Some(PreviewKind::Audio),
        "pdf" => Some(PreviewKind::Pdf),
        "txt" | "log" => Some(PreviewKind::Text(TextPreviewKind::Plain)),
        "json" => Some(PreviewKind::Text(TextPreviewKind::Json)),
        "csv" => Some(PreviewKind::Text(TextPreviewKind::Csv)),
        "md" => Some(PreviewKind::Text(TextPreviewKind::Markdown)),
        "docx" => Some(PreviewKind::Docx),
        _ => None,
    }
}

pub fn content_type_for_name(name: &str) -> &'static str {
    match file_extension(name)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "pdf" => "application/pdf",
        "txt" | "log" => "text/plain; charset=utf-8",
        "csv" => "text/csv; charset=utf-8",
        "json" => "application/json",
        "html" => "text/html; charset=utf-8",
        "md" => "text/markdown; charset=utf-8",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        _ => "application/octet-stream",
    }
}

pub fn format_file_size(size: u64) -> String {
    const UNITS: [&str; 6] = ["B", "KB", "MB", "GB", "TB", "PB"];
    let mut value = size as f64;
    let mut unit_index = 0;

    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", size, UNITS[unit_index])
    } else if value >= 100.0 {
        format!("{value:.0} {}", UNITS[unit_index])
    } else if value >= 10.0 {
        format!("{value:.1} {}", UNITS[unit_index])
    } else {
        format!("{value:.2} {}", UNITS[unit_index])
    }
}

fn render_page_shell(title: &str, topbar: &str, body: &str) -> String {
    let safe_title = escape_html(title);
    format!(
        r##"<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{safe_title} · FluxShare</title>
    <style>{HOSTED_PAGE_STYLES}</style>
  </head>
  <body>
    <div class="page">
      <div class="shell">
        {topbar}
        {body}
      </div>
    </div>
    <script>{HOSTED_PAGE_SCRIPT}</script>
  </body>
</html>"##
    )
}

fn render_preview_shell(title: &str, body: &str) -> String {
    let safe_title = escape_html(title);
    format!(
        r##"<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{safe_title} · FluxShare Preview</title>
    <style>{HOSTED_PAGE_STYLES}</style>
  </head>
  <body class="preview-frame-body">
    {body}
  </body>
</html>"##
    )
}

fn render_topbar(file_count: Option<usize>, label: &str, danger: bool) -> String {
    let count_markup = match file_count {
        Some(1) => "<span>1 file</span>".to_string(),
        Some(count) => format!("<span>{count} files</span>"),
        None => "<span>FluxShare link</span>".to_string(),
    };

    let dot_class = if danger {
        "topbar__dot topbar__dot--danger"
    } else {
        "topbar__dot"
    };

    format!(
        r#"<header class="topbar">
  <div class="brand">
    <div class="brand__mark" aria-hidden="true"></div>
    <div class="brand__text">
      <div class="brand__name">FluxShare</div>
      <div class="brand__subtle">Direct file share</div>
    </div>
  </div>
  <div class="topbar__status">
    {count_markup}
    <span class="{dot_class}" aria-hidden="true"></span>
    <span>{label}</span>
  </div>
</header>"#
    )
}

fn render_placeholder(file: &HostedPageFile) -> String {
    let kind = classify_file(&file.name);
    let badge = escape_html(&extension_badge(&file.name));
    let label = kind_label(kind);
    format!(
        r#"<div class="viewer__placeholder">
  <div class="viewer__placeholder-icon">{badge}</div>
  <div class="viewer__placeholder-title">No inline preview available</div>
  <div class="viewer__placeholder-copy">This {label} stays downloadable, but FluxShare does not expose a safe inline renderer for it yet.</div>
</div>"#
    )
}

fn render_audio_preview(raw_preview_url: &str) -> String {
    format!(
        r#"<div class="viewer__audio">
  <div class="viewer__audio-art" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Audio">
      <path d="M6 18V9a1 1 0 0 1 .76-.97l9-2.25A1 1 0 0 1 17 6.75V15" />
      <circle cx="8" cy="18" r="2.5" />
      <circle cx="17" cy="15" r="2.5" />
    </svg>
  </div>
  <div class="viewer__audio-player">
    <audio controls preload="metadata" src="{raw_preview_url}"></audio>
  </div>
</div>"#
    )
}

fn render_viewer(file: &HostedPageFile) -> String {
    let safe_name = escape_html(&file.name);
    let raw_preview_url = format!("/preview/{}/raw", file.id);
    let browser_preview_url = format!("/preview/{}", file.id);

    let content = match preview_kind(&file.name) {
        Some(PreviewKind::Image) => format!(
            r#"<img class="viewer__image" src="{raw_preview_url}" alt="{safe_name}" loading="eager" />"#
        ),
        Some(PreviewKind::Video) => format!(
            r#"<video class="viewer__video" controls preload="metadata" src="{raw_preview_url}"></video>"#
        ),
        Some(PreviewKind::Audio) => render_audio_preview(&raw_preview_url),
        Some(PreviewKind::Pdf) => format!(
            r#"<iframe class="viewer__frame viewer__frame--document" src="{raw_preview_url}" title="{safe_name} preview"></iframe>"#
        ),
        Some(PreviewKind::Text(_)) | Some(PreviewKind::Docx) => format!(
            r#"<iframe class="viewer__frame viewer__frame--document" src="{browser_preview_url}" title="{safe_name} preview"></iframe>"#
        ),
        None => render_placeholder(file),
    };

    format!(
        r#"<section class="viewer">
  <div class="viewer__surface">
    {content}
  </div>
</section>"#
    )
}

fn render_sidebar(file: &HostedPageFile) -> String {
    let safe_name = escape_html(&file.name);
    let size_label = format_file_size(file.size);
    let type_label = kind_label(classify_file(&file.name));
    let ext_label = extension_badge(&file.name);
    let preview = preview_kind(&file.name);
    let download_url = format!("/download/{}", file.id);
    let preview_url = format!("/preview/{}", file.id);
    let preview_support = render_support_label(preview);
    let secondary_action = match preview {
        Some(kind) => format!(
            r#"<a class="button button--secondary" href="{preview_url}" target="_blank" rel="noreferrer">{}</a>"#,
            preview_button_label(kind)
        ),
        None => {
            r#"<button class="button button--secondary" type="button" data-copy-current="url">Copy link</button>"#
                .to_string()
        }
    };

    format!(
        r#"<aside class="sidebar">
  <div class="sidebar__head">
    <div class="sidebar__lead">
      <div class="file-icon" aria-hidden="true">{ext_label}</div>
      <div class="title-tools">
        <button class="utility-button" type="button" data-copy="{safe_name}">Copy name</button>
      </div>
    </div>

    <h1 class="file-title" title="{safe_name}">{safe_name}</h1>

    <div class="meta-row" aria-label="File details">
      <span class="meta-row__item">{type_label}</span>
      <span class="meta-row__item">{size_label}</span>
      <span class="meta-row__item status-inline">Available now</span>
    </div>
  </div>

  <div class="actions">
    <div class="action-row">
      <a class="button button--primary" href="{download_url}" download="{safe_name}">Download file</a>
      {secondary_action}
    </div>
    <div class="utility-row">
      <button class="utility-button" type="button" data-copy-path="{download_url}">Copy download link</button>
    </div>
  </div>

  <details class="details">
    <summary>Technical details</summary>
    <div class="detail-grid">
      <div>
        <span class="detail-label">Format</span>
        <span class="detail-value">{ext_label}</span>
      </div>
      <div>
        <span class="detail-label">Type</span>
        <span class="detail-value">{type_label}</span>
      </div>
      <div>
        <span class="detail-label">Size</span>
        <span class="detail-value">{size_label}</span>
      </div>
      <div>
        <span class="detail-label">Preview</span>
        <span class="detail-value">{preview_support}</span>
      </div>
    </div>
  </details>
</aside>"#
    )
}

fn render_file_list(files: &[HostedPageFile]) -> String {
    if files.len() <= 1 {
        return String::new();
    }

    let mut items = String::new();
    for file in files.iter().skip(1) {
        let safe_name = escape_html(&file.name);
        let badge = escape_html(&extension_badge(&file.name));
        let size = format_file_size(file.size);
        let _ = write!(
            items,
            r#"<div class="file-list__item">
  <div class="file-icon" aria-hidden="true">{badge}</div>
  <div class="file-list__item-name">
    <div class="file-list__item-title" title="{safe_name}">{safe_name}</div>
    <div class="file-list__item-meta">{size}</div>
  </div>
  <a class="file-list__item-link" href="/download/{id}" download="{safe_name}">Download</a>
</div>"#,
            id = file.id
        );
    }

    format!(
        r#"<section class="file-list">
  <div class="file-list__head">
    <div class="file-list__title">More files in this share</div>
    <div class="file-list__copy">{count} additional items</div>
  </div>
  <div class="file-list__items">{items}</div>
</section>"#,
        count = files.len() - 1
    )
}

fn render_preview_text_body(text: &str, tone: PreviewTextTone, wrap: bool) -> String {
    let mut class_name = "preview-frame__pre".to_string();
    if wrap {
        class_name.push_str(" preview-frame__pre--wrap");
    }
    if tone == PreviewTextTone::Prose {
        class_name.push_str(" preview-frame__pre--prose");
    }

    format!(r#"<pre class="{class_name}">{}</pre>"#, escape_html(text))
}

fn render_preview_table(columns: &[String], rows: &[Vec<String>]) -> String {
    if columns.is_empty() && rows.is_empty() {
        return r#"<div class="preview-frame__empty">This CSV file does not contain any readable rows yet.</div>"#
            .to_string();
    }

    let mut header_markup = String::new();
    for column in columns {
        let _ = write!(header_markup, "<th>{}</th>", escape_html(column));
    }

    let mut rows_markup = String::new();
    for row in rows {
        rows_markup.push_str("<tr>");
        for cell in row {
            let _ = write!(rows_markup, "<td>{}</td>", escape_html(cell));
        }
        rows_markup.push_str("</tr>");
    }

    format!(
        r#"<div class="preview-frame__table-wrap">
  <table class="preview-frame__table">
    <thead><tr>{header_markup}</tr></thead>
    <tbody>{rows_markup}</tbody>
  </table>
</div>"#
    )
}

fn render_preview_blocks(blocks: &[String]) -> String {
    if blocks.is_empty() {
        return r#"<div class="preview-frame__empty">FluxShare could not extract readable text from this document.</div>"#
            .to_string();
    }

    let mut markup = String::from(r#"<article class="preview-frame__blocks">"#);
    for block in blocks {
        let _ = write!(markup, "<p>{}</p>", escape_html(block));
    }
    markup.push_str("</article>");
    markup
}

pub fn render_preview_document_page(document: &HostedPreviewDocument) -> String {
    let note_markup = document
        .note
        .as_ref()
        .map(|note| {
            format!(
                r#"<div class="preview-frame__notice">{}</div>"#,
                escape_html(note)
            )
        })
        .unwrap_or_default();
    let body_markup = match &document.body {
        PreviewDocumentBody::Text { text, tone, wrap } => {
            render_preview_text_body(text, *tone, *wrap)
        }
        PreviewDocumentBody::Table { columns, rows } => render_preview_table(columns, rows),
        PreviewDocumentBody::Blocks { blocks } => render_preview_blocks(blocks),
    };

    let body = format!(
        r#"<main class="preview-frame">
  <section class="preview-frame__shell">
    <header class="preview-frame__header">
      <div>
        <div class="preview-frame__eyebrow">{}</div>
        <div class="preview-frame__title" title="{}">{}</div>
      </div>
      <div class="preview-frame__summary">{}</div>
    </header>
    {note_markup}
    <div class="preview-frame__content">
      {body_markup}
    </div>
  </section>
</main>"#,
        escape_html(&document.kind_label),
        escape_html(&document.name),
        escape_html(&document.name),
        escape_html(&document.summary)
    );

    render_preview_shell(&document.name, &body)
}

pub fn render_preview_state_page(
    file_name: &str,
    kind_label: &str,
    title: &str,
    description: &str,
    action_href: Option<&str>,
    action_label: Option<&str>,
) -> String {
    let action_markup = match (action_href, action_label) {
        (Some(href), Some(label)) => format!(
            r#"<a class="preview-frame__action" href="{href}" target="_top">{}</a>"#,
            escape_html(label)
        ),
        _ => String::new(),
    };

    let body = format!(
        r#"<main class="preview-frame">
  <section class="preview-frame__shell">
    <header class="preview-frame__header">
      <div>
        <div class="preview-frame__eyebrow">{}</div>
        <div class="preview-frame__title" title="{}">{}</div>
      </div>
      <div class="preview-frame__summary">Preview unavailable</div>
    </header>
    <div class="preview-frame__content">
      <div class="preview-frame__state">
        <div class="preview-frame__state-title">{}</div>
        <div class="preview-frame__state-copy">{}</div>
        {action_markup}
      </div>
    </div>
  </section>
</main>"#,
        escape_html(kind_label),
        escape_html(file_name),
        escape_html(file_name),
        escape_html(title),
        escape_html(description)
    );

    render_preview_shell(file_name, &body)
}

pub fn render_status_page(title: &str, description: &str, danger: bool) -> String {
    let topbar = render_topbar(None, if danger { "Unavailable" } else { "Notice" }, danger);
    let status_class = if danger {
        "status-card status-card--danger"
    } else {
        "status-card"
    };
    let body = format!(
        r#"<main class="status-layout">
  <section class="{status_class}">
    <div class="status-card__eyebrow">FluxShare</div>
    <h1 class="status-card__title">{}</h1>
    <div class="status-card__copy">{}</div>
  </section>
</main>"#,
        escape_html(title),
        escape_html(description)
    );

    render_page_shell(title, &topbar, &body)
}

pub fn render_index_page(files: &[HostedPageFile]) -> String {
    if files.is_empty() {
        return render_status_page(
            "No files available",
            "This share is empty or is no longer available.",
            true,
        );
    }

    let primary = &files[0];
    let title = primary.name.clone();
    let topbar = render_topbar(Some(files.len()), "Available", false);
    let body = format!(
        r#"<main class="layout">
  {}
  {}
</main>
{}"#,
        render_viewer(primary),
        render_sidebar(primary),
        render_file_list(files)
    );

    render_page_shell(&title, &topbar, &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_supported_preview_kinds() {
        assert_eq!(preview_kind("photo.png"), Some(PreviewKind::Image));
        assert_eq!(preview_kind("clip.mp4"), Some(PreviewKind::Video));
        assert_eq!(preview_kind("song.mp3"), Some(PreviewKind::Audio));
        assert_eq!(preview_kind("report.pdf"), Some(PreviewKind::Pdf));
        assert_eq!(
            preview_kind("notes.txt"),
            Some(PreviewKind::Text(TextPreviewKind::Plain))
        );
        assert_eq!(
            preview_kind("payload.json"),
            Some(PreviewKind::Text(TextPreviewKind::Json))
        );
        assert_eq!(
            preview_kind("sheet.csv"),
            Some(PreviewKind::Text(TextPreviewKind::Csv))
        );
        assert_eq!(
            preview_kind("readme.md"),
            Some(PreviewKind::Text(TextPreviewKind::Markdown))
        );
        assert_eq!(preview_kind("brief.docx"), Some(PreviewKind::Docx));
        assert_eq!(preview_kind("vector.svg"), None);
        assert_eq!(preview_kind("archive.zip"), None);
    }

    #[test]
    fn maps_content_types() {
        assert_eq!(content_type_for_name("image.webp"), "image/webp");
        assert_eq!(content_type_for_name("movie.mov"), "video/quicktime");
        assert_eq!(
            content_type_for_name("notes.txt"),
            "text/plain; charset=utf-8"
        );
        assert_eq!(
            content_type_for_name("brief.docx"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        assert_eq!(
            content_type_for_name("unknown.bin"),
            "application/octet-stream"
        );
    }

    #[test]
    fn renders_download_cta_and_copy_utility() {
        let html = render_index_page(&[HostedPageFile {
            id: 7,
            name: "camera-roll.mp4".to_string(),
            size: 42_000_000,
        }]);

        assert!(html.contains("Download file"));
        assert!(html.contains("Copy name"));
        assert!(!html.contains("No inline preview available"));
    }

    #[test]
    fn renders_iframe_for_document_previews() {
        let html = render_index_page(&[HostedPageFile {
            id: 9,
            name: "incident-log.txt".to_string(),
            size: 8_192,
        }]);

        assert!(html.contains("viewer__frame"));
        assert!(html.contains("/preview/9"));
    }
}
