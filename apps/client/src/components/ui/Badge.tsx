import { cn } from "../../utils/cn";

type BadgeVariant = "neutral" | "accent" | "accentSecondary" | "success" | "danger";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-white/10 text-[var(--muted)]",
  accent: "bg-[var(--primary)]/25 text-[var(--primary)]",
  accentSecondary: "bg-[var(--accent)]/25 text-[var(--accent)]",
  success: "bg-emerald-500/20 text-emerald-300",
  danger: "bg-red-500/20 text-red-300",
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
