import { cn } from "../../utils/cn";

type BadgeVariant = "neutral" | "accent" | "accentSecondary" | "success" | "danger";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-[color-mix(in srgb,var(--surface) 65%,transparent)] text-[var(--muted)]",
  accent: "bg-[color-mix(in srgb,var(--primary) 25%,transparent)] text-[var(--primary)]",
  accentSecondary: "bg-[color-mix(in srgb,var(--primary) 18%,var(--surface) 82%)] text-[var(--text)]",
  success: "bg-[color-mix(in srgb,var(--primary) 35%,var(--text) 65%)] text-[var(--primary-foreground)]",
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
