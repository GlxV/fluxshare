use std::fs;
use std::path::PathBuf;

use super::transfer::FileEntry;

#[tauri::command]
pub fn list_files(paths: Vec<String>) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    for path in paths {
        let path_buf = PathBuf::from(&path);
        let metadata = fs::metadata(&path_buf).map_err(|e| e.to_string())?;
        let name = path_buf
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        let checksum = if metadata.is_file() {
            Some(calculate_checksum(&path_buf).map_err(|e| e.to_string())?)
        } else {
            None
        };
        entries.push(FileEntry {
            path: path.clone(),
            name,
            size: metadata.len(),
            is_dir: metadata.is_dir(),
            checksum,
        });
    }
    Ok(entries)
}

fn calculate_checksum(path: &PathBuf) -> anyhow::Result<String> {
    use std::io::Read;
    let mut file = fs::File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 8192];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}
