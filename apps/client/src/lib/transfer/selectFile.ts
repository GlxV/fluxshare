import { nanoid } from "nanoid";
import { toast } from "../../store/useToast";
import { isTauri, getFileInfo } from "../persist/tauri";
import { prepareFolderTransfer } from "./folder";

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export interface SelectedItem {
  id: string;
  name: string;
  size: number;
  mime?: string;
  kind: "file" | "folder";
  source: "web" | "tauri" | "tauri-folder";
  file?: File;
  path?: string;
  archiveRoot?: string;
  cleanup?: () => Promise<void>;
}

export async function computeFileId(name: string, size: number, lastModified: number) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${name}:${size}:${lastModified}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function pickWebFile(): Promise<SelectedItem | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const id = await computeFileId(file.name, file.size, file.lastModified);
      resolve({
        id,
        name: file.name,
        size: file.size,
        mime: file.type || undefined,
        kind: "file",
        source: "web",
        file,
      });
    });
    input.click();
  });
}

export async function pickTauriFile(): Promise<SelectedItem | null> {
  try {
    const { open } = await import("@tauri-apps/api/dialog");
    const selection = await open({ multiple: false });
    if (!selection || Array.isArray(selection)) {
      return null;
    }
    const path = selection;
    const info = await getFileInfo(path);
    const size = info.size ?? 0;
    const name = path.split(/[\\/]/).pop() ?? "file";
    const id = await computeFileId(name, size, Date.now());
    return {
      id,
      name,
      size,
      mime: undefined,
      kind: "file",
      source: "tauri",
      path,
    };
  } catch (error) {
    console.error("fluxshare:file", "tauri picker failed", error);
    return null;
  }
}

export async function pickTauriFolder(t?: TranslateFn): Promise<SelectedItem | null> {
  const translate = t ?? ((key: string) => key);
  if (!isTauri()) {
    toast({ message: translate("toast.folderDesktop"), variant: "info" });
    return null;
  }
  try {
    const { open } = await import("@tauri-apps/api/dialog");
    const selection = await open({ multiple: false, directory: true });
    if (!selection || Array.isArray(selection)) {
      return null;
    }
    const path = selection;
    const name = path.split(/[\\/]/).pop() ?? "folder";
    const plan = await prepareFolderTransfer({ path, name }, translate);
    if (!plan) return null;
    const info = await getFileInfo(plan.archivePath);
    const size = info.size ?? plan.size ?? 0;
    const id = await computeFileId(plan.displayName, size || 1, Date.now());
    return {
      id,
      name: plan.displayName.endsWith(".zip") ? plan.displayName : `${plan.displayName}.zip`,
      size,
      mime: "application/zip",
      kind: "folder",
      source: "tauri-folder",
      path: plan.archivePath,
      archiveRoot: plan.archiveRoot,
      cleanup: plan.cleanup,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast({ message: translate("toast.folderFail", { message }), variant: "error" });
    return null;
  }
}
