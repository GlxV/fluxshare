import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  checksum?: string | null;
}

interface Props {
  onFiles: (files: FileEntry[]) => void;
}

export default function FilePicker({ onFiles }: Props) {
  const [loading, setLoading] = useState(false);

  async function handlePick() {
    setLoading(true);
    try {
      const picked = await open({ multiple: true, directory: false });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const files = (await invoke<FileEntry[]>("list_files", { paths })).map((file) => ({
        ...file,
        checksum: file.checksum ?? null,
      }));
      onFiles(files);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handlePick} disabled={loading}>
      {loading ? "Carregando..." : "Selecionar arquivos"}
    </button>
  );
}
