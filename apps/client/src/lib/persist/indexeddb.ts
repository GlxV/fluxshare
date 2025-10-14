import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "fluxshare";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const CHECKPOINT_STORE = "checkpoints";

export interface TransferCheckpoint {
  fileId: string;
  nextChunkIndex: number;
  receivedBytes: number;
  updatedAt: number;
}

type FluxshareDB = IDBPDatabase<unknown>;

let dbPromise: Promise<FluxshareDB> | null = null;

async function getDb(): Promise<FluxshareDB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(HANDLE_STORE)) {
          db.createObjectStore(HANDLE_STORE);
        }
        if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
          db.createObjectStore(CHECKPOINT_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveFileHandle(fileId: string, handle: FileSystemFileHandle) {
  const db = await getDb();
  await db.put(HANDLE_STORE, handle, fileId);
}

export async function getFileHandle(fileId: string) {
  const db = await getDb();
  return (await db.get(HANDLE_STORE, fileId)) as FileSystemFileHandle | undefined;
}

export async function removeFileHandle(fileId: string) {
  const db = await getDb();
  await db.delete(HANDLE_STORE, fileId);
}

export async function saveCheckpoint(checkpoint: TransferCheckpoint) {
  const db = await getDb();
  await db.put(CHECKPOINT_STORE, checkpoint, checkpoint.fileId);
}

export async function getCheckpoint(fileId: string) {
  const db = await getDb();
  return (await db.get(CHECKPOINT_STORE, fileId)) as TransferCheckpoint | undefined;
}

export async function getAllCheckpoints() {
  const db = await getDb();
  const values: TransferCheckpoint[] = [];
  let cursor = await db.transaction(CHECKPOINT_STORE).store.openCursor();
  while (cursor) {
    values.push(cursor.value as TransferCheckpoint);
    cursor = await cursor.continue();
  }
  return values;
}

export async function clearCheckpoint(fileId: string) {
  const db = await getDb();
  await db.delete(CHECKPOINT_STORE, fileId);
}
