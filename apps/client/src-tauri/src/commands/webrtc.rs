use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_init::RTCDataChannelInit;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::RTCPeerConnection;

#[derive(Default, Clone)]
pub struct WebRTCManager {
    connections: Arc<Mutex<HashMap<String, Arc<RTCPeerConnection>>>>,
}

#[derive(Serialize)]
pub struct SignalingStatus {
    pub connected: bool,
}

#[tauri::command]
pub async fn start_signaling(url: String, self_id: String) -> Result<SignalingStatus, String> {
    tracing::info!("start_signaling", url = %url, self_id = %self_id);
    Ok(SignalingStatus { connected: true })
}

#[tauri::command]
pub async fn webrtc_start(
    webrtc_manager: tauri::State<'_, WebRTCManager>,
    mode: String,
    self_id: String,
    target_id: String,
    signaling_url: String,
) -> Result<(), String> {
    let mut media_engine = MediaEngine::default();
    media_engine
        .register_default_codecs()
        .map_err(|e| e.to_string())?;

    let api = APIBuilder::new().with_media_engine(media_engine).build();
    let config = RTCConfiguration {
        ice_servers: vec![],
        ..Default::default()
    };

    let pc = api
        .new_peer_connection(config)
        .await
        .map_err(|e| format!("erro ao criar peer connection: {e}"))?;

    let data_channel = pc
        .create_data_channel("fluxshare", Some(RTCDataChannelInit::default()))
        .await
        .map_err(|e| e.to_string())?;

    data_channel.on_open(Box::new(move || {
        tracing::info!("datachannel_open", mode = %mode, self_id = %self_id, target_id = %target_id, signaling_url = %signaling_url);
        Box::pin(async {})
    }));

    data_channel.on_message(Box::new(move |msg| {
        tracing::debug!("datachannel_message", len = msg.data.len());
        Box::pin(async {})
    }));

    webrtc_manager
        .connections
        .lock()
        .insert(format!("{}->{}", self_id, target_id), pc);

    Ok(())
}
