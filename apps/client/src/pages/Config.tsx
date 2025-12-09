import { useMemo } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { usePreferencesStore, type CustomTheme } from "../state/usePreferencesStore";
import { useI18n } from "../i18n/LanguageProvider";
import { TUNNEL_PROVIDERS, TUNNEL_PROVIDER_LABEL, type TunnelProvider } from "../types/tunnel";

const DEFAULT_CUSTOM_THEME: CustomTheme = {
  primary: "#8b5cf6",
  background: "#0e0a1f",
  accent: "#1c1842",
};

export default function ConfigPage() {
  const { t, language, setLanguage } = useI18n();
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const customTheme = usePreferencesStore((state) => state.customTheme);
  const setCustomTheme = usePreferencesStore((state) => state.setCustomTheme);
  const fallbackEnabled = usePreferencesStore((state) => state.tunnelFallbackEnabled);
  const setFallbackEnabled = usePreferencesStore((state) => state.setTunnelFallbackEnabled);
  const primaryProvider = usePreferencesStore((state) => state.primaryTunnelProvider);
  const fallbackProvider = usePreferencesStore((state) => state.fallbackTunnelProvider);
  const setPrimaryProvider = usePreferencesStore((state) => state.setPrimaryTunnelProvider);
  const setFallbackProvider = usePreferencesStore((state) => state.setFallbackTunnelProvider);
  const autoStopMinutes = usePreferencesStore((state) => state.autoStopMinutes);
  const setAutoStopMinutes = usePreferencesStore((state) => state.setAutoStopMinutes);
  const localOnly = usePreferencesStore((state) => state.localOnly);
  const setLocalOnly = usePreferencesStore((state) => state.setLocalOnly);

  const themePreview = useMemo(
    () => ({
      ...DEFAULT_CUSTOM_THEME,
      ...customTheme,
    }),
    [customTheme],
  );

  function handleColorChange(key: keyof CustomTheme, value: string) {
    setCustomTheme({
      ...themePreview,
      [key]: value,
    });
  }

  function handleResetColors() {
    setCustomTheme(DEFAULT_CUSTOM_THEME);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-[var(--text)]">{t("config.title")}</h1>
        <p className="text-sm text-[var(--muted)]">{t("config.subtitle")}</p>
      </div>

      <Card className="space-y-4 p-6">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-[var(--text)]">{t("config.tunnel.title")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[color-mix(in srgb,var(--surface) 85%,transparent)] px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={fallbackEnabled}
              onChange={(event) => setFallbackEnabled(event.target.checked)}
            />
            {t("config.tunnel.enableFallback")}
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={localOnly}
              onChange={(event) => setLocalOnly(event.target.checked)}
            />
            {t("config.tunnel.localOnly")}
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("config.tunnel.primary")}
            </p>
            <select
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              value={primaryProvider}
              onChange={(event) => setPrimaryProvider(event.target.value as TunnelProvider)}
            >
              {TUNNEL_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {TUNNEL_PROVIDER_LABEL[provider]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("config.tunnel.fallback")}
            </p>
            <select
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              value={fallbackProvider}
              onChange={(event) => setFallbackProvider(event.target.value as TunnelProvider)}
              disabled={!fallbackEnabled}
            >
              {TUNNEL_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {TUNNEL_PROVIDER_LABEL[provider]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("config.tunnel.autoStop")}
            </p>
            <input
              type="number"
              min={0}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
              value={autoStopMinutes ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const num = value === "" ? null : Math.max(0, Number(value));
                setAutoStopMinutes(Number.isFinite(num as number) ? (num as number | null) : null);
              }}
              placeholder="10"
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-[var(--text)]">{t("config.theme.title")}</p>
          <p className="text-xs text-[var(--muted)]">{t("config.theme.mode")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant={theme === "light" ? "primary" : "outline"} onClick={() => setTheme("light")}>
            {t("config.theme.light")}
          </Button>
          <Button variant={theme === "dark" ? "primary" : "outline"} onClick={() => setTheme("dark")}>
            {t("config.theme.dark")}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("config.theme.primary")}
            </p>
            <input
              type="color"
              value={themePreview.primary}
              onChange={(event) => handleColorChange("primary", event.target.value)}
              className="h-12 w-full cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("config.theme.background")}
            </p>
            <input
              type="color"
              value={themePreview.background}
              onChange={(event) => handleColorChange("background", event.target.value)}
              className="h-12 w-full cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("config.theme.accent")}
            </p>
            <input
              type="color"
              value={themePreview.accent}
              onChange={(event) => handleColorChange("accent", event.target.value)}
              className="h-12 w-full cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            />
          </div>
        </div>
        <Button variant="secondary" onClick={handleResetColors}>
          {t("config.theme.reset")}
        </Button>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-[var(--text)]">{t("config.language.title")}</p>
          <p className="text-sm text-[var(--muted)]">{t("config.language.description")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as "en" | "pt")}
            className="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          >
            <option value="en">{t("config.language.en")}</option>
            <option value="pt">{t("config.language.pt")}</option>
          </select>
        </div>
      </Card>
    </div>
  );
}
