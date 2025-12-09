import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { type CustomTheme, usePreferencesStore } from "../state/usePreferencesStore";

interface ThemeContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("color-scheme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.replace("#", "");
  if (![3, 6].includes(normalized.length)) return null;
  const value = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const num = Number.parseInt(value, 16);
  if (Number.isNaN(num)) return null;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lighten(hex: string, amount: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const factor = amount / 100;
  const next = [r, g, b].map((value) => clamp(Math.round(value + (255 - value) * factor), 0, 255));
  return `rgb(${next[0]}, ${next[1]}, ${next[2]})`;
}

function addAlpha(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function applyCustomTheme(custom: CustomTheme, theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const surface = lighten(custom.background, 8);
  const surface2 = lighten(custom.background, 14);
  const border = lighten(custom.background, 28);
  const textColor = theme === "light" ? "#0f172a" : "#e8e8f0";
  const mutedColor = theme === "light" ? "#475569" : "#a3a3b2";
  const primaryForeground = theme === "light" ? "#0f172a" : "#0b0a16";
  root.style.setProperty("--primary", custom.primary);
  root.style.setProperty("--bg", custom.background);
  root.style.setProperty("--surface", surface);
  root.style.setProperty("--surface-2", custom.accent || surface2);
  root.style.setProperty("--border", border);
  root.style.setProperty("--ring", addAlpha(custom.primary, 0.35));
  root.style.setProperty("--text", textColor);
  root.style.setProperty("--muted", mutedColor);
  root.style.setProperty("--primary-foreground", primaryForeground);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = usePreferencesStore((state) => state.theme);
  const customTheme = usePreferencesStore((state) => state.customTheme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const manualOverrideRef = useRef(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyCustomTheme(customTheme, theme);
  }, [customTheme, theme]);

  useEffect(() => {
    const media = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
    if (!media) return;
    const listener = (event: MediaQueryListEvent) => {
      if (manualOverrideRef.current) return;
      setTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [setTheme]);

  const toggleTheme = useCallback(() => {
    manualOverrideRef.current = true;
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

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
