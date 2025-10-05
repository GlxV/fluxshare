// apps/client/src-tauri/src/lib.rs
use serde::{Deserialize, Serialize};

// Define o módulo aqui dentro (sem arquivos extras) para compilar de primeira
pub mod commands {
    use super::*;

    pub mod transfer {
        use super::*;

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

        // Comando de teste (opcional)
        #[tauri::command]
        pub async fn ping() -> &'static str {
            "ok"
        }
    }
}

// mantém o reexport que seu código esperava
pub use commands::transfer::{FileEntry, TransferStatus};
