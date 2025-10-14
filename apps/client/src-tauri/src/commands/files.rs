use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
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

#[tauri::command]
pub fn read_file_range(path: String, start: u64, length: u64) -> Result<Vec<u8>, String> {
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; length as usize];
    let read = file.read(&mut buffer).map_err(|e| e.to_string())?;
    buffer.truncate(read);
    Ok(buffer)
}

#[tauri::command]
pub fn write_file_range(path: String, start: u64, bytes: Vec<u8>) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
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
