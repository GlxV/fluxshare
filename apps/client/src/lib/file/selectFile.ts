import { saveFileHandle } from "../persist/indexeddb";
import { toast } from "../../store/useToast";

export interface WebSelectFileResult {
  source: "web";
  file: File;
  fileId: string;
  handle: FileSystemFileHandle;
}

export interface WebFallbackSelectFileResult {
  source: "web-fallback";
  file: File;
  fileId: string;
}

export type SelectFileResult = WebSelectFileResult | WebFallbackSelectFileResult;

const fallbackFiles = new Map<string, File>();

export async function computeFileId(name: string, size: number, lastModified: number) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${name}:${size}:${lastModified}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getFallbackFile(fileId: string) {
  return fallbackFiles.get(fileId) ?? null;
}

export function hasFallbackFile(fileId: string) {
  return fallbackFiles.has(fileId);
}

export function clearFallbackFile(fileId: string) {
  fallbackFiles.delete(fileId);
}

export async function selectFile(): Promise<SelectFileResult | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if ("showOpenFilePicker" in window) {
    const [handle] = await (window as any).showOpenFilePicker({ multiple: false });
    if (!handle) return null;
    const file = await handle.getFile();
    const fileId = await computeFileId(file.name, file.size, file.lastModified);
    await saveFileHandle(fileId, handle).catch(() => undefined);
    return { source: "web", file, fileId, handle };
  }

  const input = document.createElement("input");
  input.type = "file";
  input.style.position = "fixed";
  input.style.top = "-1000px";
  input.style.left = "-1000px";
  input.style.width = "1px";
  input.style.height = "1px";
  input.style.opacity = "0";
  input.setAttribute("tabindex", "-1");

  return new Promise<SelectFileResult | null>((resolve) => {
    let settled = false;

    const finalize = (result: SelectFileResult | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const cleanup = () => {
      window.removeEventListener("focus", handleWindowFocus, true);
      input.remove();
    };

    const handleWindowFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          finalize(null);
        }
      }, 0);
    };

    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) {
          finalize(null);
          return;
        }
        const fileId = await computeFileId(file.name, file.size, file.lastModified);
        fallbackFiles.set(fileId, file);
        toast({
          message:
            "Modo compatível ativado. Se recarregar a página, re-selecione o mesmo arquivo para continuar.",
          variant: "info",
          duration: 6000,
        });
        finalize({ source: "web-fallback", file, fileId });
      },
      { once: true },
    );

    input.addEventListener(
      "cancel",
      () => {
        finalize(null);
      },
      { once: true },
    );

    window.addEventListener("focus", handleWindowFocus, { once: true, capture: true });

    document.body.appendChild(input);
    input.click();
  });
}
