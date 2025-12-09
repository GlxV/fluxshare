import JSZip from "jszip";
import { appCacheDir, downloadDir, join } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  createDir,
  readBinaryFile,
  readDir,
  removeFile,
  writeBinaryFile,
} from "@tauri-apps/api/fs";
import { isTauri } from "../persist/tauri";
import { toast } from "../../store/useToast";
import { translateInstant } from "../../i18n/translate";

export interface FolderSelection {
  path: string;
  name: string;
}

export interface FolderTransferPlan {
  archivePath: string;
  displayName: string;
  size?: number;
  archiveRoot: string;
  cleanup: () => Promise<void>;
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

async function ensureDir(path: string) {
  try {
    await createDir(path, { recursive: true });
  } catch {
    // ignore existing dirs
  }
}

async function addEntryToZip(zip: JSZip, entry: { path?: string; name?: string; children?: any[] }, prefix: string) {
  const name = entry.name ?? "item";
  const currentPath = prefix ? `${prefix}/${name}` : name;
  if (entry.children) {
    const folder = zip.folder(currentPath);
    if (folder && entry.children.length > 0) {
      for (const child of entry.children) {
        await addEntryToZip(folder, child, "");
      }
    }
    return;
  }
  if (entry.path) {
    const content = await readBinaryFile(entry.path);
    zip.file(currentPath, content);
  }
}

export async function prepareFolderTransfer(
  selection: FolderSelection,
  t?: TranslateFn,
): Promise<FolderTransferPlan | null> {
  const translate =
    t ??
    ((key: string, params?: Record<string, string | number>) =>
      translateInstant(key as any, params) ?? params?.message?.toString() ?? key);
  if (!isTauri()) {
    toast({ message: translate("toast.folderDesktop"), variant: "info" });
    return null;
  }

  const cacheRoot = await appCacheDir();
  const targetDir = await join(cacheRoot, "fluxshare-archives");
  await ensureDir(targetDir);

  try {
    const zip = new JSZip();
    const entries = await readDir(selection.path, { recursive: true });
    for (const entry of entries) {
      await addEntryToZip(zip, entry, selection.name);
    }
    const content = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const archiveName = `${selection.name}.zip`;
    const relativeArchive = `fluxshare-archives/${Date.now()}-${archiveName}`;
    const archivePath = await join(cacheRoot, relativeArchive);
    await writeBinaryFile({ path: relativeArchive, contents: content }, { dir: BaseDirectory.AppCache });
    const plan: FolderTransferPlan = {
      archivePath,
      displayName: archiveName,
      size: content.byteLength,
      archiveRoot: selection.name,
      cleanup: async () => {
        try {
          await removeFile(relativeArchive, { dir: BaseDirectory.AppCache });
        } catch {
          /* ignore */
        }
      },
    };
    toast({ message: translate("toast.folderReady"), variant: "success", duration: 2500 });
    return plan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast({ message: translate("toast.folderFail", { message }), variant: "error" });
    return null;
  }
}

export async function extractArchiveToFolder(
  archivePath: string,
  targetFolderName?: string,
  t?: TranslateFn,
) {
  const translate =
    t ??
    ((key: string, params?: Record<string, string | number>) =>
      translateInstant(key as any, params) ?? params?.message?.toString() ?? key);
  if (!isTauri()) {
    toast({ message: translate("toast.extractDesktop"), variant: "info" });
    return null;
  }
  try {
    const data = await readBinaryFile(archivePath);
    const zip = await JSZip.loadAsync(data);
    const downloads = await downloadDir();
    const rootName = targetFolderName ?? "FluxShare-Folder";
    const targetDir = await join(downloads, rootName);
    await ensureDir(targetDir);

    const writes: Array<Promise<void>> = [];
    zip.forEach((relativePath, file) => {
      if (file.dir) {
        writes.push(
          (async () => {
            const dirPath = await join(targetDir, relativePath);
            await ensureDir(dirPath);
          })(),
        );
        return;
      }
      writes.push(
        (async () => {
          const content = await file.async("uint8array");
          const filePath = await join(targetDir, relativePath);
          const dirPath = filePath.split(/[\\/]/).slice(0, -1).join("/");
          if (dirPath) {
            await ensureDir(dirPath);
          }
          await writeBinaryFile({ path: filePath, contents: content });
        })(),
      );
    });
    await Promise.all(writes);
    toast({ message: translate("toast.extractSuccess", { path: targetDir }), variant: "success", duration: 4000 });
    return targetDir;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast({ message: translate("toast.extractFail", { message }), variant: "error" });
    return null;
  }
}
