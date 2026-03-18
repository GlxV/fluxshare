import { toast } from "../../store/useToast";
import { getPathInfo, isTauri, registerTransferSource, releaseTransferSource } from "../persist/tauri";
import { prepareFolderTransfer } from "./folder";
import { type ImportStatusReporter } from "./importStatus";

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
  transferHandleId?: string;
  archiveRoot?: string;
  cleanup?: () => Promise<void>;
}

function reportStatus(
  reporter: ImportStatusReporter | undefined,
  status: Parameters<ImportStatusReporter>[0],
) {
  reporter?.(status);
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

export async function pickTauriFile(reportImportStatus?: ImportStatusReporter): Promise<SelectedItem | null> {
  try {
    const { open } = await import("@tauri-apps/api/dialog");
    const selection = await open({ multiple: false });
    if (!selection || Array.isArray(selection)) {
      return null;
    }
    const path = selection;
    reportStatus(reportImportStatus, {
      active: true,
      stage: "analyzing",
      progress: null,
      message: "",
    });
    const source = await registerTransferSource(path);
    const size = source.size ?? 0;
    const name = source.name || path.split(/[\\/]/).pop() || "file";
    const id = await computeFileId(name, size, Date.now());
    reportStatus(reportImportStatus, {
      active: false,
      stage: "ready",
      progress: 1,
      message: "",
      bytesProcessed: size,
      totalBytes: size,
    });
    return {
      id,
      name,
      size,
      mime: undefined,
      kind: "file",
      source: "tauri",
      path: source.path,
      transferHandleId: source.handleId,
      cleanup: async () => {
        await releaseTransferSource(source.handleId);
      },
    };
  } catch (error) {
    console.error("fluxshare:file", "tauri picker failed", error);
    const message = error instanceof Error ? error.message : String(error);
    reportStatus(reportImportStatus, {
      active: false,
      stage: "error",
      progress: null,
      message: "",
      detail: message,
    });
    return null;
  }
}

export async function pickTauriFolder(
  t?: TranslateFn,
  reportImportStatus?: ImportStatusReporter,
): Promise<SelectedItem | null> {
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
    const plan = await prepareFolderTransfer({ path, name }, translate, reportImportStatus);
    if (!plan) return null;
    const source = await registerTransferSource(plan.archivePath).catch(async (error) => {
      await plan.cleanup().catch(() => undefined);
      throw error;
    });
    const size = source.size ?? plan.size ?? 0;
    const id = await computeFileId(plan.displayName, size || 1, Date.now());
    return {
      id,
      name: plan.displayName.endsWith(".zip") ? plan.displayName : `${plan.displayName}.zip`,
      size,
      mime: "application/zip",
      kind: "folder",
      source: "tauri-folder",
      path: source.path,
      transferHandleId: source.handleId,
      archiveRoot: plan.archiveRoot,
      cleanup: async () => {
        await releaseTransferSource(source.handleId);
        await plan.cleanup();
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportStatus(reportImportStatus, {
      active: false,
      stage: "error",
      progress: null,
      message: translate("import.folder.failed"),
      detail: message,
    });
    toast({ message: translate("toast.folderFail", { message }), variant: "error" });
    return null;
  }
}

export async function selectTauriPath(
  path: string,
  t?: TranslateFn,
  reportImportStatus?: ImportStatusReporter,
): Promise<SelectedItem | null> {
  const translate = t ?? ((key: string) => key);
  if (!isTauri()) {
    toast({ message: translate("send.desktopRequired"), variant: "info" });
    return null;
  }
  let info;
  try {
    reportStatus(reportImportStatus, {
      active: true,
      stage: "analyzing",
      progress: null,
      message: "",
    });
    info = await getPathInfo(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportStatus(reportImportStatus, {
      active: false,
      stage: "error",
      progress: null,
      message: "",
      detail: message,
    });
    toast({ message: translate("send.toast.dropFailed", { message }), variant: "error" });
    return null;
  }
  const fallbackName = path.split(/[\\/]/).pop() ?? (info.isDir ? "folder" : "file");
  const name = info.name || fallbackName;
  if (info.isDir) {
    const plan = await prepareFolderTransfer({ path, name }, translate, reportImportStatus);
    if (!plan) return null;
    const size = plan.size ?? 0;
    const source = await registerTransferSource(plan.archivePath).catch(async (error) => {
      await plan.cleanup().catch(() => undefined);
      throw error;
    });
    const id = await computeFileId(plan.displayName, size || 1, Date.now());
    return {
      id,
      name: plan.displayName.endsWith(".zip") ? plan.displayName : `${plan.displayName}.zip`,
      size,
      mime: "application/zip",
      kind: "folder",
      source: "tauri-folder",
      path: source.path,
      transferHandleId: source.handleId,
      archiveRoot: plan.archiveRoot,
      cleanup: async () => {
        await releaseTransferSource(source.handleId);
        await plan.cleanup();
      },
    };
  }
  const source = await registerTransferSource(info.path);
  const size = source.size ?? 0;
  const id = await computeFileId(name, size, Date.now());
  reportStatus(reportImportStatus, {
    active: false,
    stage: "ready",
    progress: 1,
    message: "",
    bytesProcessed: size,
    totalBytes: size,
  });
  return {
    id,
    name,
    size,
    mime: undefined,
    kind: "file",
    source: "tauri",
    path: source.path,
    transferHandleId: source.handleId,
    cleanup: async () => {
      await releaseTransferSource(source.handleId);
    },
  };
}
