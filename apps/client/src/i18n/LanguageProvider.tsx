import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import en from "../locales/en.json";
import pt from "../locales/pt.json";
import { type AppLanguage, usePreferencesStore } from "../state/usePreferencesStore";

const translations = {
  en,
  pt,
} as const;

type TranslationKey = keyof typeof en;

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = usePreferencesStore((state) => state.language ?? "en");
  const setLanguage = usePreferencesStore((state) => state.setLanguage);

  useEffect(() => {
    if (!language) {
      setLanguage("en");
    }
  }, [language, setLanguage]);

  const translate = useCallback<LanguageContextValue["t"]>(
    (key, params, fallback) => {
      const table = translations[language] ?? translations.en;
      const base = (table?.[key] ?? translations.en[key] ?? fallback ?? key) as string;
      return interpolate(base, params);
    },
    [language],
  );

  const value = useMemo(
    () => ({
      language: language ?? "en",
      setLanguage,
      t: translate,
    }),
    [language, setLanguage, translate],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return context;
}
