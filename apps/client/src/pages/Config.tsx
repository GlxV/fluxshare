import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FluxShareMark, UploadGlyph } from "../components/branding/FluxShareMarks";
import { usePreferencesStore, type CustomTheme } from "../state/usePreferencesStore";
import { useI18n } from "../i18n/LanguageProvider";
import { isTauri } from "../lib/persist/tauri";
import { toast } from "../store/useToast";
import { TUNNEL_PROVIDERS, TUNNEL_PROVIDER_LABEL, type TunnelProvider } from "../types/tunnel";
import {
  THEME_PRESET_GROUP_ORDER,
  THEME_PRESET_ORDER,
  THEME_PRESETS,
  type ThemePanelStyle,
} from "../lib/theme/presets";

type ExplorerIntegrationStatus = {
  supported: boolean;
  enabled: boolean;
  desiredEnabled: boolean;
  menuLabel: string;
  command?: string | null;
  icon?: string | null;
  note?: string | null;
};

const PANEL_STYLE_OPTIONS: ThemePanelStyle[] = ["soft", "solid", "outline"];
const PANEL_STYLE_LABEL_KEYS: Record<
  ThemePanelStyle,
  "config.theme.panel.soft" | "config.theme.panel.solid" | "config.theme.panel.outline"
> = {
  soft: "config.theme.panel.soft",
  solid: "config.theme.panel.solid",
  outline: "config.theme.panel.outline",
};

function ThemePresetButton({
  active,
  label,
  activeLabel,
  description,
  swatches,
  onClick,
}: {
  active: boolean;
  label: string;
  activeLabel: string;
  description: string;
  swatches: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--radius-lg)] border p-4 text-left transition duration-150 ease-out ${
        active
          ? "border-[color-mix(in_srgb,var(--primary)_48%,var(--border)_52%)] bg-[color-mix(in_srgb,var(--panel-strong)_92%,transparent)] shadow-[var(--shadow-soft)]"
          : "border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] hover:border-[var(--border-strong)]"
      }`}
    >
      <div className="mb-3 flex gap-2">
        {swatches.map((swatch) => (
          <span
            key={swatch}
            className="h-7 flex-1 rounded-[calc(var(--radius-sm)-2px)] border border-white/10"
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[var(--text)]">{label}</span>
          {active ? <Badge variant="accent">{activeLabel}</Badge> : null}
        </div>
        <p className="text-xs leading-5 text-[var(--muted)]">{description}</p>
      </div>
    </button>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="fs-label">
        <span>{label}</span>
        <span>{value}</span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)]"
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="fs-label">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="fs-range"
      />
    </div>
  );
}

export default function ConfigPage() {
  const { t, language, setLanguage } = useI18n();
  const theme = usePreferencesStore((state) => state.theme);
  const applyThemePreset = usePreferencesStore((state) => state.applyThemePreset);
  const customTheme = usePreferencesStore((state) => state.customTheme);
  const setCustomTheme = usePreferencesStore((state) => state.setCustomTheme);
  const resetCustomTheme = usePreferencesStore((state) => state.resetCustomTheme);
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
  const [explorerStatus, setExplorerStatus] = useState<ExplorerIntegrationStatus | null>(null);
  const [loadingExplorerStatus, setLoadingExplorerStatus] = useState(false);
  const [updatingExplorerStatus, setUpdatingExplorerStatus] = useState(false);

  const themePreview = useMemo(() => ({ ...customTheme }), [customTheme]);

  function updateThemeToken<Key extends keyof CustomTheme>(key: Key, value: CustomTheme[Key]) {
    setCustomTheme({
      ...themePreview,
      [key]: value,
    });
  }

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    const loadStatus = async () => {
      try {
        setLoadingExplorerStatus(true);
        const status = (await invoke("get_explorer_integration_status")) as ExplorerIntegrationStatus;
        if (!cancelled) {
          setExplorerStatus(status);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          toast({ message: message || t("config.explorer.toast.failed"), variant: "error" });
        }
      } finally {
        if (!cancelled) {
          setLoadingExplorerStatus(false);
        }
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [language, t]);

  async function handleExplorerToggle(enabled: boolean) {
    try {
      setUpdatingExplorerStatus(true);
      const status = (await invoke("set_explorer_context_menu_enabled", {
        enabled,
      })) as ExplorerIntegrationStatus;
      setExplorerStatus(status);
      toast({
        message: enabled ? t("config.explorer.toast.enabled") : t("config.explorer.toast.disabled"),
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ message: message || t("config.explorer.toast.failed"), variant: "error" });
    } finally {
      setUpdatingExplorerStatus(false);
    }
  }

  const explorerStatusText = useMemo(() => {
    if (!isTauri()) return t("config.explorer.unsupported");
    if (loadingExplorerStatus) return t("config.explorer.loading");
    if (!explorerStatus?.supported) return t("config.explorer.unsupported");
    if (explorerStatus.enabled) return t("config.explorer.enabled");
    if (explorerStatus.desiredEnabled) return t("config.explorer.stale");
    return t("config.explorer.disabled");
  }, [explorerStatus, loadingExplorerStatus, t]);

  const groupedPresets = useMemo(
    () =>
      THEME_PRESET_GROUP_ORDER.map((category) => ({
        category,
        presets: THEME_PRESET_ORDER.filter((presetId) => THEME_PRESETS[presetId].category === category),
      })).filter((group) => group.presets.length > 0),
    [],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <span className="fs-kicker">{t("nav.config")}</span>
        <h1 className="fs-page-title">{t("config.title")}</h1>
        <p className="fs-page-subtitle">{t("config.subtitle")}</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_22rem]">
        <Card className="space-y-6 p-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              {t("config.appearance.title")}
            </p>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--text)]">{t("config.theme.title")}</p>
            <p className="text-sm leading-6 text-[var(--muted)]">{t("config.appearance.subtitle")}</p>
          </div>

          <div className="space-y-4">
            <p className="fs-label">
              <span>{t("config.appearance.presets")}</span>
              <span>{THEME_PRESET_ORDER.length}</span>
            </p>
            {groupedPresets.map((group) => (
              <div key={group.category} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--text)]">{group.category}</p>
                  <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                    {group.presets.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {group.presets.map((presetId) => {
                    const preset = THEME_PRESETS[presetId];
                    return (
                      <ThemePresetButton
                        key={presetId}
                        active={theme === presetId}
                        label={preset.label}
                        activeLabel={t("config.appearance.active")}
                        description={preset.description}
                        swatches={[
                          preset.editable.background,
                          preset.editable.surface,
                          preset.editable.primary,
                          preset.editable.secondary,
                        ]}
                        onClick={() => applyThemePreset(presetId)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="fs-divider" />

          <div className="space-y-3">
            <p className="fs-label">
              <span>{t("config.appearance.colors")}</span>
              <span>{t("config.theme.custom")}</span>
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ColorField
                label={t("config.theme.primary")}
                value={themePreview.primary}
                onChange={(value) => updateThemeToken("primary", value)}
              />
              <ColorField
                label={t("config.theme.secondary")}
                value={themePreview.secondary}
                onChange={(value) => updateThemeToken("secondary", value)}
              />
              <ColorField
                label={t("config.theme.background")}
                value={themePreview.background}
                onChange={(value) => updateThemeToken("background", value)}
              />
              <ColorField
                label={t("config.theme.surface")}
                value={themePreview.surface}
                onChange={(value) => updateThemeToken("surface", value)}
              />
              <ColorField
                label={t("config.theme.accent")}
                value={themePreview.accent}
                onChange={(value) => updateThemeToken("accent", value)}
              />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <RangeField
              label={t("config.theme.contrast")}
              value={themePreview.contrast}
              min={0.88}
              max={1.18}
              step={0.01}
              onChange={(value) => updateThemeToken("contrast", value)}
            />
            <RangeField
              label={t("config.theme.radius")}
              value={themePreview.radius}
              min={0.82}
              max={1.22}
              step={0.01}
              onChange={(value) => updateThemeToken("radius", value)}
            />
            <RangeField
              label={t("config.theme.spacing")}
              value={themePreview.spacing}
              min={0.88}
              max={1.18}
              step={0.01}
              onChange={(value) => updateThemeToken("spacing", value)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-2">
              <label className="fs-label">
                <span>{t("config.theme.panel")}</span>
                <span>{themePreview.panel}</span>
              </label>
              <select
                className="fs-select"
                value={themePreview.panel}
                onChange={(event) => updateThemeToken("panel", event.target.value as ThemePanelStyle)}
              >
                {PANEL_STYLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(PANEL_STYLE_LABEL_KEYS[option])}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" onClick={() => resetCustomTheme()}>
              {t("config.theme.reset")}
            </Button>
          </div>
        </Card>

        <Card tone="muted" className="space-y-5 p-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              {t("config.appearance.preview")}
            </p>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--text)]">{t("config.appearance.previewTitle")}</p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[var(--bg)] p-4">
            <div className="mb-4 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-bg)_78%,transparent)] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius-sm)-1px)] border border-[color-mix(in_srgb,var(--primary)_18%,var(--border)_82%)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--text)]">
                  <FluxShareMark className="h-[1.125rem] w-[1.125rem]" />
                </span>
                <div className="space-y-0.5">
                  <span className="block text-sm font-semibold text-[var(--text)]">{t("app.name")}</span>
                  <span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                    {THEME_PRESETS[theme].category}
                  </span>
                </div>
              </div>
              <Badge variant="accent">{THEME_PRESETS[theme].label}</Badge>
            </div>

            <div className="space-y-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{t("nav.send")}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">{t("send.start")}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{THEME_PRESETS[theme].description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button>{t("send.pickFile")}</Button>
                <Button variant="secondary">{t("send.pickFolder")}</Button>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--primary)_20%,var(--border)_80%)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--text)]">
                    <UploadGlyph className="h-5 w-5" />
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[var(--text)]">{t("send.pickFile")}</p>
                    <p className="text-xs leading-5 text-[var(--muted)]">{t("header.tagline")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="space-y-5 p-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              {t("config.behavior.title")}
            </p>
            <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--text)]">{t("config.tunnel.title")}</p>
          </div>

          <div className="space-y-3">
            <label className="fs-toggle-row">
              <span className="text-sm text-[var(--text)]">{t("config.tunnel.enableFallback")}</span>
              <input
                type="checkbox"
                checked={fallbackEnabled}
                onChange={(event) => setFallbackEnabled(event.target.checked)}
              />
            </label>
            <label className="fs-toggle-row">
              <span className="text-sm text-[var(--text)]">{t("config.tunnel.localOnly")}</span>
              <input type="checkbox" checked={localOnly} onChange={(event) => setLocalOnly(event.target.checked)} />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="fs-label">
                <span>{t("config.tunnel.primary")}</span>
                <span>{primaryProvider}</span>
              </label>
              <select
                className="fs-select"
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
              <label className="fs-label">
                <span>{t("config.tunnel.fallback")}</span>
                <span>{fallbackProvider}</span>
              </label>
              <select
                className="fs-select"
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

          <div className="space-y-2">
            <label className="fs-label">
              <span>{t("config.tunnel.autoStop")}</span>
              <span>{autoStopMinutes ?? "--"}</span>
            </label>
            <input
              type="number"
              min={0}
              className="fs-input"
              value={autoStopMinutes ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const num = value === "" ? null : Math.max(0, Number(value));
                setAutoStopMinutes(Number.isFinite(num as number) ? (num as number | null) : null);
              }}
              placeholder="10"
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card tone="muted" className="space-y-5 p-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                {t("config.language.title")}
              </p>
              <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--text)]">{t("config.language.description")}</p>
            </div>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as "en" | "pt")}
              className="fs-select"
            >
              <option value="en">{t("config.language.en")}</option>
              <option value="pt">{t("config.language.pt")}</option>
            </select>
          </Card>

          <Card tone="muted" className="space-y-5 p-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                {t("config.explorer.title")}
              </p>
              <p className="text-sm leading-6 text-[var(--muted)]">{t("config.explorer.description")}</p>
            </div>

            <label className="fs-toggle-row">
              <span className="text-sm text-[var(--text)]">{t("config.explorer.toggle")}</span>
              <input
                type="checkbox"
                checked={Boolean(explorerStatus?.desiredEnabled ?? explorerStatus?.enabled)}
                disabled={!isTauri() || loadingExplorerStatus || updatingExplorerStatus}
                onChange={(event) => void handleExplorerToggle(event.target.checked)}
              />
            </label>

            <div className="space-y-2 text-sm leading-6 text-[var(--muted)]">
              <p>{explorerStatusText}</p>
              {explorerStatus?.note ? <p>{explorerStatus.note}</p> : null}
              {isTauri() ? <p>{t("config.explorer.windows11Note")}</p> : null}
              {explorerStatus?.command ? (
                <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] px-3 py-2 font-mono text-xs text-[var(--muted-strong)]">
                  {explorerStatus.command}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
