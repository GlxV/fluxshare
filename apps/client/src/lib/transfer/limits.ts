import { isTauri } from "../persist/tauri";

export const DEFAULT_MAX_TRANSFER_SIZE = 2 * 1024 ** 4;
export const MAX_TRANSFER_CHUNK_SIZE = 1024 * 1024;
export const MIN_TRANSFER_CHUNK_SIZE = 16 * 1024;
export const MAX_TRANSFER_TOTAL_CHUNKS = 4_000_000;
export const MAX_TRANSFER_FILENAME_LENGTH = 255;
export const MAX_BROWSER_RECEIVE_SIZE = 256 * 1024 * 1024;

export interface TransferMetaLike {
  id: string;
  name: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
}

function isSafeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function validateTransferMeta(meta: TransferMetaLike) {
  if (typeof meta.id !== "string" || meta.id.trim().length === 0) {
    throw new Error("Transfer metadata is missing an id.");
  }

  if (typeof meta.name !== "string" || meta.name.trim().length === 0) {
    throw new Error("Transfer metadata is missing a file name.");
  }

  if (meta.name.length > MAX_TRANSFER_FILENAME_LENGTH) {
    throw new Error("Transfer metadata file name is too long.");
  }

  if (!isSafeInteger(meta.size) || meta.size < 0 || meta.size > DEFAULT_MAX_TRANSFER_SIZE) {
    throw new Error("Transfer metadata size is invalid.");
  }

  if (
    !isSafeInteger(meta.chunkSize) ||
    meta.chunkSize < MIN_TRANSFER_CHUNK_SIZE ||
    meta.chunkSize > MAX_TRANSFER_CHUNK_SIZE
  ) {
    throw new Error("Transfer metadata chunk size is invalid.");
  }

  if (!isSafeInteger(meta.totalChunks) || meta.totalChunks < 0 || meta.totalChunks > MAX_TRANSFER_TOTAL_CHUNKS) {
    throw new Error("Transfer metadata chunk count is invalid.");
  }

  const expectedChunks = meta.size === 0 ? 0 : Math.ceil(meta.size / meta.chunkSize);
  if (meta.totalChunks !== expectedChunks) {
    throw new Error("Transfer metadata is inconsistent.");
  }

  if (!isTauri() && meta.size > MAX_BROWSER_RECEIVE_SIZE) {
    throw new Error("Browser receive size limit exceeded.");
  }
}
