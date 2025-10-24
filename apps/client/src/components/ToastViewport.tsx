import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "../store/useToast";
import { cn } from "../utils/cn";

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
            "pointer-events-auto rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card)]/95 px-4 py-3 text-sm text-[var(--text)] shadow-lg backdrop-blur",
            toast.variant === "info" && "border-[var(--accent-2)]/60",
            toast.variant === "success" && "border-green-500/60",
            toast.variant === "warning" && "border-amber-500/60",
            toast.variant === "error" && "border-red-500/60",
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="leading-snug text-[var(--text)]">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-full p-1 text-[var(--text-muted)] transition hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
              aria-label="Fechar notificação"
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
