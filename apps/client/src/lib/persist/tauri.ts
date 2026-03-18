import { invoke } from "@tauri-apps/api/tauri";

type PathInfoPayload = {
  size: number;
  isDir: boolean;
  name: string;
  path: string;
};

type RegisteredTransferSourcePayload = {
  handleId: string;
  path: string;
  name: string;
  size: number;
};

type TransferTempFilePayload = {
  handleId: string;
  path: string;
};

export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_IPC__" in window;
}

export async function getPathInfo(path: string) {
  const info = (await invoke("inspect_path", { path })) as PathInfoPayload;
  return {
    size: info.size ?? 0,
    isDir: Boolean(info.isDir),
    name: info.name,
    path: info.path,
  };
}

export async function registerTransferSource(path: string) {
  const info = (await invoke("register_transfer_source", { path })) as RegisteredTransferSourcePayload;
  return {
    handleId: info.handleId,
    path: info.path,
    name: info.name,
    size: info.size ?? 0,
  };
}

export async function releaseTransferSource(handleId: string) {
  await invoke("release_transfer_source", { handleId });
}

export async function readFileRange(handleId: string, start: number, length: number): Promise<ArrayBuffer> {
  const bytes = (await invoke("read_file_range", { handleId, start, length })) as number[];
  return Uint8Array.from(bytes).buffer;
}

export async function createTransferTempFile(fileName: string, expectedSize?: number | null) {
  const info = (await invoke("create_transfer_temp_file", {
    fileName,
    expectedSize: typeof expectedSize === "number" ? expectedSize : null,
  })) as TransferTempFilePayload;
  return {
    handleId: info.handleId,
    path: info.path,
  };
}

export async function writeFileRange(handleId: string, start: number, data: Uint8Array) {
  await invoke("write_file_range", { handleId, start, bytes: Array.from(data) });
}

export async function deleteTransferTempFile(handleId: string) {
  await invoke("delete_transfer_temp_file", { handleId });
}

export async function persistReceivedFile(handleId: string, suggestedName: string) {
  return (await invoke("persist_received_file", {
    handleId,
    suggestedName,
  })) as string;
}

export async function extractReceivedArchive(handleId: string, targetFolderName?: string) {
  return (await invoke("extract_received_archive", {
    handleId,
    targetFolderName,
  })) as string;
}
