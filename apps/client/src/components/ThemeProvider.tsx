import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { getThemePreset } from "../lib/theme/presets";
import { type AppTheme, type CustomTheme, usePreferencesStore } from "../state/usePreferencesStore";

interface ThemeContextValue {
  theme: AppTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.replace("#", "");
  if (![3, 6].includes(normalized.length)) return null;
  const value =
    normalized.length === 3 ? normalized.split("").map((chunk) => `${chunk}${chunk}`).join("") : normalized;
  const parsed = Number.parseInt(value, 16);
  if (Number.isNaN(parsed)) return null;
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function rgbToString([r, g, b]: [number, number, number]) {
  return `rgb(${r}, ${g}, ${b})`;
}

function mixColors(base: string, target: string, weight: number) {
  const sourceRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);
  if (!sourceRgb || !targetRgb) return base;
  const amount = clamp(weight, 0, 1);
  const mixed = sourceRgb.map((channel, index) =>
    Math.round(channel + (targetRgb[index] - channel) * amount),
  ) as [number, number, number];
  return rgbToString(mixed);
}

function addAlpha(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function applyTheme(theme: AppTheme, customTheme: CustomTheme) {
  if (typeof document === "undefined") return;

  const preset = getThemePreset(theme);
  const root = document.documentElement;
  const mode = preset.mode;
  const contrast = clamp(customTheme.contrast, 0.88, 1.18);
  const radius = clamp(customTheme.radius, 0.82, 1.22);
  const spacing = clamp(customTheme.spacing, 0.88, 1.18);
  const primary = customTheme.primary;
  const secondary = customTheme.secondary;
  const background = customTheme.background;
  const surface = customTheme.surface;
  const accent = customTheme.accent;

  const surface2 = mixColors(surface, accent, 0.54);
  const surface3 = mixColors(accent, primary, 0.16);
  const panelBase = customTheme.panel === "solid" ? mixColors(surface, background, 0.12) : surface;
  const panelMuted = customTheme.panel === "outline" ? mixColors(background, surface, 0.4) : mixColors(surface2, background, 0.18);
  const panelStrong = mixColors(surface3, background, mode === "dark" ? 0.05 : 0.08);
  const border = mode === "dark"
    ? mixColors(surface, "#ffffff", 0.12 * contrast)
    : mixColors(surface, "#132033", 0.14 * contrast);
  const borderStrong = mode === "dark"
    ? mixColors(surface3, "#ffffff", 0.22 * contrast)
    : mixColors(surface2, "#132033", 0.24 * contrast);
  const muted = mixColors(preset.muted, preset.text, mode === "dark" ? 0.04 : 0.08);
  const mutedStrong = mixColors(preset.muted, preset.text, mode === "dark" ? 0.28 : 0.35);
  const ring = addAlpha(primary, mode === "dark" ? 0.34 : 0.22);
  const primarySoft = addAlpha(primary, mode === "dark" ? 0.18 : 0.12);
  const secondarySoft = addAlpha(secondary, mode === "dark" ? 0.18 : 0.11);
  const canvasEdge = mode === "dark"
    ? mixColors(background, "#05070c", 0.42)
    : mixColors(background, "#c7d1dc", 0.08);
  const gridLine = mode === "dark"
    ? addAlpha("#ffffff", 0.035 * contrast)
    : addAlpha("#132033", 0.045 * contrast);
  const shadowColor = mode === "dark" ? "#05070c" : "#1f2a37";

  root.style.setProperty("color-scheme", mode);
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = theme;
  root.dataset.themeMode = mode;
  root.dataset.panelStyle = customTheme.panel;

  root.style.setProperty("--primary", primary);
  root.style.setProperty("--secondary", secondary);
  root.style.setProperty("--primary-soft", primarySoft);
  root.style.setProperty("--secondary-soft", secondarySoft);
  root.style.setProperty("--bg", background);
  root.style.setProperty("--surface", surface);
  root.style.setProperty("--surface-2", surface2);
  root.style.setProperty("--surface-3", surface3);
  root.style.setProperty("--panel-bg", panelBase);
  root.style.setProperty("--panel-muted", panelMuted);
  root.style.setProperty("--panel-strong", panelStrong);
  root.style.setProperty("--border", border);
  root.style.setProperty("--border-strong", borderStrong);
  root.style.setProperty("--ring", ring);
  root.style.setProperty("--text", preset.text);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--muted-strong", mutedStrong);
  root.style.setProperty("--primary-foreground", preset.primaryForeground);
  root.style.setProperty("--success", preset.success);
  root.style.setProperty("--danger", preset.danger);
  root.style.setProperty("--ambient-a", preset.ambientA);
  root.style.setProperty("--ambient-b", preset.ambientB);
  root.style.setProperty("--canvas-edge", canvasEdge);
  root.style.setProperty("--grid-line", gridLine);
  root.style.setProperty("--space-scale", String(spacing));
  root.style.setProperty("--radius-scale", String(radius));
  root.style.setProperty("--shadow-soft", `0 26px 60px -40px ${addAlpha(shadowColor, mode === "dark" ? 0.72 : 0.18)}`);
  root.style.setProperty("--shadow-panel", `0 24px 54px -36px ${addAlpha(shadowColor, mode === "dark" ? 0.7 : 0.16)}`);
  root.style.setProperty("--shadow-strong", `0 30px 70px -34px ${addAlpha(shadowColor, mode === "dark" ? 0.82 : 0.22)}`);
  root.style.setProperty("--shadow-accent", `0 18px 40px -24px ${addAlpha(primary, mode === "dark" ? 0.4 : 0.22)}`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = usePreferencesStore((state) => state.theme);
  const customTheme = usePreferencesStore((state) => state.customTheme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const presetMode = getThemePreset(theme).mode;

  useEffect(() => {
    applyTheme(theme, customTheme);
  }, [customTheme, theme]);

  const toggleTheme = useCallback(() => {
    setTheme(presetMode === "light" ? "dark" : "light");
  }, [presetMode, setTheme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
