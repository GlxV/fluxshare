use std::net::SocketAddr;

use parking_lot::Mutex;
use quinn::{ClientConfig, Endpoint};
use std::sync::Arc;

#[derive(Clone, Default)]
pub struct QuicManager {
    endpoint: Arc<Mutex<Option<Endpoint>>>,
}

impl QuicManager {
    async fn ensure_endpoint(&self) -> anyhow::Result<Endpoint> {
        if let Some(ep) = self.endpoint.lock().as_ref() {
            return Ok(ep.clone());
        }
        let client_cfg = ClientConfig::with_native_roots();
        let mut endpoint = quinn::Endpoint::client("0.0.0.0:0".parse::<SocketAddr>()?)?;
        endpoint.set_default_client_config(client_cfg);
        *self.endpoint.lock() = Some(endpoint.clone());
        Ok(endpoint)
    }
}

#[tauri::command]
pub async fn quic_start(
    manager: tauri::State<'_, QuicManager>,
    self_id: String,
    remote_addr: String,
) -> Result<(), String> {
    let endpoint = manager
        .ensure_endpoint()
        .await
        .map_err(|e| format!("erro ao criar endpoint QUIC: {e}"))?;
    let addr: SocketAddr = remote_addr.parse::<SocketAddr>().map_err(|e| e.to_string())?;
    let connection = endpoint
        .connect(addr, "fluxshare")
        .map_err(|e| e.to_string())?;
    let _ = connection.await.map_err(|e| e.to_string())?;
    tracing::info!(self_id = %self_id, remote = %remote_addr, "quic_connected");
    Ok(())
}
