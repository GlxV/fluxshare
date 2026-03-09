export type ImportPreparationStage =
  | "idle"
  | "analyzing"
  | "scanning"
  | "packing"
  | "copying"
  | "ready"
  | "error";

export interface ImportPreparationStatus {
  active: boolean;
  stage: ImportPreparationStage;
  progress: number | null;
  message: string;
  detail?: string;
  filesProcessed?: number;
  totalFiles?: number;
  bytesProcessed?: number;
  totalBytes?: number;
}

export interface ImportProgressEventPayload {
  jobId: string;
  stage: string;
  progress?: number | null;
  filesProcessed?: number;
  totalFiles?: number | null;
  bytesProcessed?: number;
  totalBytes?: number | null;
  message?: string;
}

export type ImportStatusReporter = (status: ImportPreparationStatus) => void;

export const IDLE_IMPORT_STATUS: ImportPreparationStatus = {
  active: false,
  stage: "idle",
  progress: null,
  message: "",
};
