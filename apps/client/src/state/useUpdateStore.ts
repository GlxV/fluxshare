import { create } from "zustand";
import { checkForUpdates as runUpdateCheck, type UpdateInfo } from "../lib/update";

interface UpdateStoreState {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  error: string | null;
  checkForUpdates(): Promise<void>;
}

export const useUpdateStore = create<UpdateStoreState>((set) => ({
  updateInfo: null,
  isChecking: false,
  error: null,
  async checkForUpdates() {
    set({ isChecking: true, error: null });
    try {
      const info = await runUpdateCheck();
      set({ updateInfo: info, isChecking: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao verificar atualização";
      console.error("fluxshare:update", error);
      set({ error: message, isChecking: false });
    }
  },
}));
