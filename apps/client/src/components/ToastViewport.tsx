import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "../store/useToast";
import { cn } from "../utils/cn";
import { useI18n } from "../i18n/LanguageProvider";

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 4.5 7 7m0-7-7 7" />
    </svg>
  );
}

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const [mounted, setMounted] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-3 sm:bottom-6 sm:right-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text)] shadow-lg backdrop-blur",
            toast.variant === "info" && "border-[color-mix(in srgb,var(--primary) 60%,var(--border) 40%)]",
            toast.variant === "success" && "border-[color-mix(in srgb,var(--primary) 45%,var(--text) 55%)]",
            toast.variant === "warning" && "border-[color-mix(in srgb,var(--primary) 35%,var(--muted) 65%)]",
            toast.variant === "error" && "border-[color-mix(in srgb,var(--primary) 50%,var(--surface-2) 50%)]",
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="leading-snug text-[var(--text)]">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-full p-1 text-[var(--muted)] transition hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              aria-label={t("toast.close")}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export default ToastViewport;
