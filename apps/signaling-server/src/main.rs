#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fluxshare::commands::transfer::ping; // nome do crate = package do Cargo.toml (parece ser "fluxshare")

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}