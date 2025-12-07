import { cn } from "../../utils/cn";

type BadgeVariant = "neutral" | "accent" | "accentSecondary" | "success" | "danger";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-[color-mix(in srgb,var(--surface) 65%,transparent)] text-[var(--muted)]",
  accent: "bg-[color-mix(in srgb,var(--primary) 25%,transparent)] text-[var(--primary)]",
  accentSecondary: "bg-[color-mix(in srgb,var(--primary) 18%,var(--surface) 82%)] text-[var(--text)]",
  success:
    "border border-[color-mix(in srgb,var(--primary) 45%,var(--border) 55%)] bg-[color-mix(in srgb,var(--primary) 32%,var(--surface-2) 68%)] text-[var(--text)] shadow-[0_10px_30px_-22px_var(--ring)]",
  danger: "bg-[color-mix(in srgb,var(--primary) 45%,var(--surface-2) 55%)] text-[var(--primary-foreground)]",
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
