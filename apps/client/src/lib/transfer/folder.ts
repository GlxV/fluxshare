import { removeFile } from "@tauri-apps/api/fs";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { nanoid } from "nanoid";
import { extractReceivedArchive, isTauri } from "../persist/tauri";
import { toast } from "../../store/useToast";
import { translateInstant } from "../../i18n/translate";
import { type ImportProgressEventPayload, type ImportStatusReporter } from "./importStatus";

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

export async function prepareFolderTransfer(
  selection: FolderSelection,
  t?: TranslateFn,
  reportStatus?: ImportStatusReporter,
): Promise<FolderTransferPlan | null> {
  const translate =
    t ??
    ((key: string, params?: Record<string, string | number>) =>
      translateInstant(key as any, params) ?? params?.message?.toString() ?? key);
  if (!isTauri()) {
    toast({ message: translate("toast.folderDesktop"), variant: "info" });
    return null;
  }

  const jobId = `folder-${nanoid(10)}`;
  let stopListening: (() => void) | null = null;

  try {
    stopListening = await listen<ImportProgressEventPayload>("fluxshare://import-progress", (event) => {
      const payload = event.payload;
      if (!payload || payload.jobId !== jobId || !reportStatus) return;
      const stage = payload.stage;
      reportStatus({
        active: stage !== "complete" && stage !== "error",
        stage:
          stage === "scanning" || stage === "packing" || stage === "error"
            ? stage
            : stage === "complete"
              ? "ready"
              : "analyzing",
        progress: typeof payload.progress === "number" ? Math.max(0, Math.min(1, payload.progress)) : null,
        message:
          stage === "scanning"
            ? translate("import.folder.scanning")
            : stage === "packing"
              ? translate("import.folder.packing")
              : stage === "complete"
                ? translate("import.folder.ready")
                : translate("import.folder.failed"),
        detail: payload.message,
        filesProcessed: payload.filesProcessed,
        totalFiles: payload.totalFiles ?? undefined,
        bytesProcessed: payload.bytesProcessed,
        totalBytes: payload.totalBytes ?? undefined,
      });
    });

    reportStatus?.({
      active: true,
      stage: "scanning",
      progress: null,
      message: translate("import.folder.scanning"),
    });

    const result = (await invoke("prepare_folder_archive", {
      path: selection.path,
      name: selection.name,
      jobId,
    })) as {
      archivePath: string;
      displayName: string;
      size: number;
      archiveRoot: string;
    };

    const plan: FolderTransferPlan = {
      archivePath: result.archivePath,
      displayName: result.displayName,
      size: result.size,
      archiveRoot: result.archiveRoot,
      cleanup: async () => {
        try {
          await removeFile(result.archivePath);
        } catch {
          /* ignore */
        }
      },
    };
    reportStatus?.({
      active: false,
      stage: "ready",
      progress: 1,
      message: translate("import.folder.ready"),
      totalBytes: result.size,
      bytesProcessed: result.size,
    });
    toast({ message: translate("toast.folderReady"), variant: "success", duration: 2500 });
    return plan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportStatus?.({
      active: false,
      stage: "error",
      progress: null,
      message: translate("import.folder.failed"),
      detail: message,
    });
    toast({ message: translate("toast.folderFail", { message }), variant: "error" });
    return null;
  } finally {
    stopListening?.();
  }
}

export async function extractArchiveToFolder(
  archiveHandleId: string,
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
    const targetDir = await extractReceivedArchive(archiveHandleId, targetFolderName);
    toast({ message: translate("toast.extractSuccess", { path: targetDir }), variant: "success", duration: 4000 });
    return targetDir;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast({ message: translate("toast.extractFail", { message }), variant: "error" });
    return null;
  }
}
