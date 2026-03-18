import { createTransferTempFile, deleteTransferTempFile, writeFileRange } from "../persist/tauri";
import { type ImportStatusReporter } from "./importStatus";

export async function copyBrowserFileInChunks(
  file: File,
  onChunk: (chunk: Uint8Array, offset: number) => Promise<void>,
  reportStatus?: ImportStatusReporter,
) {
  const reader = file.stream().getReader();
  let offset = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!(value instanceof Uint8Array)) {
      continue;
    }

    await onChunk(value, offset);
    offset += value.byteLength;
    reportStatus?.({
      active: true,
      stage: "copying",
      progress: file.size > 0 ? Math.min(1, offset / file.size) : 1,
      message: "",
      bytesProcessed: offset,
      totalBytes: file.size,
    });
  }
}

export async function stageBrowserFileForTauri(
  file: File,
  reportStatus?: ImportStatusReporter,
): Promise<{ handleId: string; path: string; cleanup: () => Promise<void> }> {
  const temp = await createTransferTempFile(file.name || `fluxshare-${Date.now()}`, file.size);

  try {
    await copyBrowserFileInChunks(
      file,
      async (chunk, offset) => {
        await writeFileRange(temp.handleId, offset, chunk);
      },
      reportStatus,
    );

    reportStatus?.({
      active: false,
      stage: "ready",
      progress: 1,
      message: "",
      bytesProcessed: file.size,
      totalBytes: file.size,
    });

    return {
      handleId: temp.handleId,
      path: temp.path,
      cleanup: async () => {
        try {
          await deleteTransferTempFile(temp.handleId);
        } catch (error) {
          console.warn("fluxshare:file", "failed to clean staged browser file", error);
          throw error;
        }
      },
    };
  } catch (error) {
    try {
      await deleteTransferTempFile(temp.handleId);
    } catch (cleanupError) {
      console.warn("fluxshare:file", "failed to clean staged browser file after error", cleanupError);
    }
    throw error;
  }
}
