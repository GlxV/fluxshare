import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRoom } from "../state/useRoomStore";

interface ThemeContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("theme-light", theme === "light");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useRoom();
  const manualOverrideRef = useRef(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
