import { invoke } from "@tauri-apps/api/tauri";
import type { FileEntry } from "../components/FilePicker";

type SendOptions = {
  encrypt?: boolean;
  password?: string;
};

export interface TransferStatus {
  sessionId: string;
  totalBytes: number;
  transferredBytes: number;
  fileProgress: Array<{
    path: string;
    transferred: number;
    total: number;
    done: boolean;
  }>;
  rate: number;
  etaSeconds: number | null;
  state: string;
}

export async function sendFiles(
  sessionId: string,
  files: FileEntry[],
  options: SendOptions
) {
  return invoke("send_files", { sessionId, files, options });
}

export async function getStatus(sessionId: string) {
  return invoke<TransferStatus>("get_status", { sessionId });
}

export async function startTunnel(localPort: number) {
  return invoke<{ publicUrl: string }>("start_tunnel", { localPort });
}

export async function stopTunnel() {
  return invoke("stop_tunnel");
}

export async function getSettings() {
  return invoke<Record<string, unknown>>("get_settings");
}

export async function setSettings(settings: Record<string, unknown>) {
  return invoke("set_settings", { settings });
}
