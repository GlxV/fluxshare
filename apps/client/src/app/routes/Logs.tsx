import { useEffect, useState } from "react";
import { readTextFile } from "@tauri-apps/api/fs";
import { homeDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/tauri";

export default function Logs() {
  const [content, setContent] = useState<string>("");

  useEffect(() => {
    async function load() {
      const dir = await homeDir();
      const file = `${dir}.fluxshare/logs/latest.log`;
      try {
        const text = await readTextFile(file);
        setContent(text);
      } catch (err) {
        setContent(`Sem logs disponíveis ainda. (${String(err)})`);
      }
    }
    load();
  }, []);

  async function handleOpenFolder() {
    await invoke("open_logs_folder");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Logs</h2>
      <pre className="bg-black/40 text-xs p-4 rounded-lg h-96 overflow-auto border border-white/10 whitespace-pre-wrap">
        {content}
      </pre>
      <button onClick={handleOpenFolder}>Abrir pasta de logs</button>
    </div>
  );
}
