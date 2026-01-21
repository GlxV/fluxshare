import { exists, readTextFile } from "@tauri-apps/api/fs";
import { invoke } from "@tauri-apps/api/tauri";

type FileEntryPayload = {
  size: number;
  checksum?: string | null;
  isDir: boolean;
  name: string;
  path: string;
};

export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_IPC__" in window;
}

export async function ensureFile(path: string) {
  if (!(await exists(path))) {
    throw new Error(`File not found: ${path}`);
  }
}

export async function readFileRange(path: string, start: number, length: number): Promise<ArrayBuffer> {
  const bytes = (await invoke("read_file_range", { path, start, length })) as number[];
  return Uint8Array.from(bytes).buffer;
}

export async function writeFileRange(path: string, start: number, data: Uint8Array) {
  await invoke("write_file_range", { path, start, bytes: Array.from(data) });
}

export async function readFileText(path: string) {
  return readTextFile(path);
}

export async function getPathInfo(path: string) {
  const entries = (await invoke("list_files", { paths: [path] })) as FileEntryPayload[];
  const [entry] = entries;
  if (!entry) {
    throw new Error(`File not found: ${path}`);
  }
  return {
    size: entry.size ?? 0,
    checksum: entry.checksum ?? undefined,
    isDir: entry.isDir,
    name: entry.name,
    path: entry.path,
  };
}

export async function getFileInfo(path: string) {
  const info = await getPathInfo(path);
  return {
    size: info.size ?? 0,
    createdAt: undefined as number | undefined,
  };
}
