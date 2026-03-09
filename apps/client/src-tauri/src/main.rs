#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands {
    pub mod explorer;
    pub mod files;
    pub mod hosted_page;
    pub mod import;
    pub mod launch;
    pub mod quic;
    pub mod settings;
    pub mod transfer;
    pub mod tunnel;
    pub mod webrtc;
}

use commands::{
    explorer::{
        get_explorer_integration_status, set_explorer_context_menu_enabled,
        sync_explorer_integration,
    },
    files::{list_files, read_file_range, write_file_range},
    import::prepare_folder_archive,
    launch::{
        collect_share_paths_from_args, consume_pending_explorer_share_requests,
        start_single_instance_server, try_forward_to_existing_instance, LaunchRequestManager,
    },
    quic::{quic_start, QuicManager},
    settings::{get_settings, set_settings, SettingsManager},
    transfer::{get_status, send_files, TransferManager},
    tunnel::{
        probe_tunnel_endpoint, start_host, start_tunnel, stop_host, stop_tunnel, tunnel_status,
        TunnelManager,
    },
    webrtc::{start_signaling, webrtc_start, WebRTCManager},
};
use tauri::Manager;
use tracing_subscriber::{fmt, EnvFilter};

fn init_tracing() {
    let base = fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("fluxshare=info".parse().unwrap()),
        )
        .with_target(false)
        .json();

    if let Some(dir) = dirs::home_dir() {
        let log_dir = dir.join(".fluxshare").join("logs");
        let _ = std::fs::create_dir_all(&log_dir);

        let file_appender = tracing_appender::rolling::daily(log_dir, "latest.log");
        let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

        // usa arquivo de log
        base.with_writer(non_blocking).init();
    } else {
        // fallback: stdout
        base.init();
    }
}

#[tauri::command]
fn open_logs_folder(app: tauri::AppHandle) -> Result<(), String> {
    let path = dirs::home_dir()
        .ok_or_else(|| "home dir not found".to_string())?
        .join(".fluxshare")
        .join("logs");
    tauri::api::shell::open(&app.shell_scope(), path.to_string_lossy(), None)
        .map_err(|e| e.to_string())
}

fn main() {
    let launch_paths = collect_share_paths_from_args(std::env::args().collect::<Vec<_>>());
    if try_forward_to_existing_instance(launch_paths.clone()).unwrap_or(false) {
        return;
    }

    init_tracing();
    let transfer_manager = TransferManager::default();
    let settings_manager = SettingsManager::default();
    let launch_manager = LaunchRequestManager::with_initial_paths(launch_paths);
    let tunnel_manager = TunnelManager::default(); // LLM-LOCK: central manager for Cloudflare tunnel lifecycle and stop events
    let webrtc_manager = WebRTCManager::default();
    let quic_manager = QuicManager::default();

    settings_manager
        .ensure_initialized()
        .expect("settings init");
    if let Err(error) = sync_explorer_integration(&settings_manager) {
        tracing::error!(?error, "explorer_integration_sync_failed");
    }
    if let Err(error) = start_single_instance_server(launch_manager.clone()) {
        tracing::error!(?error, "single_instance_server_start_failed");
    }

    tauri::Builder::default()
        .manage(transfer_manager.clone())
        .manage(settings_manager.clone())
        .manage(launch_manager.clone())
        .manage(tunnel_manager.clone())
        .manage(webrtc_manager.clone())
        .manage(quic_manager.clone())
        .invoke_handler(tauri::generate_handler![
            list_files,
            read_file_range,
            write_file_range,
            prepare_folder_archive,
            start_signaling,
            webrtc_start,
            quic_start,
            send_files,
            get_status,
            start_host,
            start_tunnel,
            stop_host,
            stop_tunnel,
            tunnel_status,
            probe_tunnel_endpoint,
            consume_pending_explorer_share_requests,
            get_explorer_integration_status,
            set_explorer_context_menu_enabled,
            set_settings,
            get_settings,
            open_logs_folder
        ])
        .setup(move |app| {
            launch_manager.attach_app(app.handle());
            app.listen_global("tauri://close-requested", move |_event| {
                tracing::info!("shutdown requested");
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running FluxShare");
}
