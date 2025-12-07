import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type TunnelProvider } from "../types/tunnel";

export type AppTheme = "light" | "dark";

export interface PreferencesState {
  theme: AppTheme;
  lastTab: string | null;
  windowSize: { width: number; height: number } | null;
  compactMode: boolean;
  tunnelFallbackEnabled: boolean;
  primaryTunnelProvider: TunnelProvider;
  fallbackTunnelProvider: TunnelProvider;
  autoStopMinutes: number | null;
  localOnly: boolean;
  setTheme(theme: AppTheme): void;
  setLastTab(tab: string): void;
  setWindowSize(size: { width: number; height: number }): void;
  setCompactMode(enabled: boolean): void;
  setTunnelFallbackEnabled(enabled: boolean): void;
  setPrimaryTunnelProvider(provider: TunnelProvider): void;
  setFallbackTunnelProvider(provider: TunnelProvider): void;
  setAutoStopMinutes(minutes: number | null): void;
  setLocalOnly(enabled: boolean): void;
}

type PreferencesPersisted = Pick<
  PreferencesState,
  | "theme"
  | "lastTab"
  | "windowSize"
  | "compactMode"
  | "tunnelFallbackEnabled"
  | "primaryTunnelProvider"
  | "fallbackTunnelProvider"
  | "autoStopMinutes"
  | "localOnly"
>;

const fallbackStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const storage = createJSONStorage<PreferencesPersisted>(() => {
  if (typeof window === "undefined") return fallbackStorage;
  try {
    return window.localStorage;
  } catch {
    return fallbackStorage;
  }
});

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "dark",
      lastTab: null,
      windowSize: null,
      compactMode: false,
      tunnelFallbackEnabled: false,
      primaryTunnelProvider: "cloudflare",
      fallbackTunnelProvider: "mock",
      autoStopMinutes: null,
      localOnly: false,
      setTheme: (theme) => set({ theme }),
      setLastTab: (tab) => set({ lastTab: tab }),
      setWindowSize: (size) => set({ windowSize: size }),
      setCompactMode: (enabled) => set({ compactMode: enabled }),
      setTunnelFallbackEnabled: (enabled) => set({ tunnelFallbackEnabled: enabled }),
      setPrimaryTunnelProvider: (provider) => set({ primaryTunnelProvider: provider }),
      setFallbackTunnelProvider: (provider) => set({ fallbackTunnelProvider: provider }),
      setAutoStopMinutes: (minutes) => set({ autoStopMinutes: minutes }),
      setLocalOnly: (enabled) => set({ localOnly: enabled }),
    }),
    {
      name: "fluxshare-preferences",
      storage,
      partialize: (state) => ({
        theme: state.theme,
        lastTab: state.lastTab,
        windowSize: state.windowSize,
        compactMode: state.compactMode,
        tunnelFallbackEnabled: state.tunnelFallbackEnabled,
        primaryTunnelProvider: state.primaryTunnelProvider,
        fallbackTunnelProvider: state.fallbackTunnelProvider,
        autoStopMinutes: state.autoStopMinutes,
        localOnly: state.localOnly,
      }),
    },
  ),
);

export function usePreferences() {
  return usePreferencesStore();
}
