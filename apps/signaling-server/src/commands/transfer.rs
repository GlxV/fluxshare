use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TransferStatus {
    Pending,
    InProgress { bytes_sent: u64, total: u64 },
    Completed,
    Failed { error: String },
}

// Exemplo de comando Tauri (só para testar o pipeline)
#[tauri::command]
pub async fn ping() -> &'static str {
    "ok"
}