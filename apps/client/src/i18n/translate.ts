import en from "../locales/en.json";
import pt from "../locales/pt.json";
import { usePreferencesStore, type AppLanguage } from "../state/usePreferencesStore";

export type TranslationKey = keyof typeof en;

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

export function translateInstant(key: TranslationKey, params?: Record<string, string | number>, language?: AppLanguage) {
  const lang = language ?? usePreferencesStore.getState().language ?? "en";
  const table = lang === "pt" ? pt : en;
  const base = (table?.[key] ?? en[key] ?? key) as string;
  return interpolate(base, params);
}
