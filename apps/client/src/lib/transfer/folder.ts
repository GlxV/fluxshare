import JSZip from "jszip";
import { appCacheDir, downloadDir, join } from "@tauri-apps/api/path";
import { createDir, readBinaryFile, readDir, removeFile, writeBinaryFile } from "@tauri-apps/api/fs";
import { isTauri } from "../persist/tauri";
import { toast } from "../../store/useToast";

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

async function ensureDir(path: string) {
  try {
    await createDir(path, { recursive: true });
  } catch {
    // ignore existing dirs
  }
}

async function addFolderToZip(zip: JSZip, folderPath: string, rootName: string) {
  const entries = await readDir(folderPath, { recursive: false });
  for (const entry of entries) {
    const name = entry.name ?? "item";
    const relativePath = `${rootName}/${name}`;
    if (entry.children && entry.children.length > 0) {
      const sub = zip.folder(relativePath);
      if (sub && entry.path) {
        await addFolderToZip(sub, entry.path, "");
      }
      continue;
    }
    if (entry.path) {
      const content = await readBinaryFile(entry.path);
      zip.file(relativePath, content);
    }
  }
}

export async function prepareFolderTransfer(selection: FolderSelection): Promise<FolderTransferPlan | null> {
  if (!isTauri()) {
    toast({ message: "Envio de pastas requer o aplicativo desktop.", variant: "info" });
    return null;
  }

  const cacheRoot = await appCacheDir();
  const targetDir = await join(cacheRoot, "fluxshare-archives");
  await ensureDir(targetDir);

  try {
    const zip = new JSZip();
    await addFolderToZip(zip, selection.path, selection.name);
    const content = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const archiveName = `${selection.name}.zip`;
    const archivePath = await join(targetDir, `${Date.now()}-${archiveName}`);
    await writeBinaryFile({ path: archivePath, contents: content });
    const plan: FolderTransferPlan = {
      archivePath,
      displayName: archiveName,
      size: content.byteLength,
      archiveRoot: selection.name,
      cleanup: async () => {
        try {
          await removeFile(archivePath);
        } catch {
          /* ignore */
        }
      },
    };
    toast({ message: "Pasta compactada para envio.", variant: "success", duration: 2500 });
    return plan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast({ message: `Falha ao compactar pasta: ${message}`, variant: "error" });
    return null;
  }
}

export async function extractArchiveToFolder(archivePath: string, targetFolderName?: string) {
  if (!isTauri()) {
    toast({ message: "Descompactação automática requer aplicativo desktop.", variant: "info" });
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
    toast({ message: `Pasta extraída em ${targetDir}`, variant: "success", duration: 4000 });
    return targetDir;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast({ message: `Falha ao extrair pasta: ${message}`, variant: "error" });
    return null;
  }
}
