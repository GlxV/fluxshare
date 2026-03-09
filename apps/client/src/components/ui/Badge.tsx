import { cn } from "../../utils/cn";

type BadgeVariant = "neutral" | "accent" | "accentSecondary" | "success" | "danger";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral:
    "border border-[color-mix(in_srgb,var(--panel-muted)_35%,var(--border)_65%)] bg-[color-mix(in_srgb,var(--panel-muted)_86%,transparent)] text-[var(--muted-strong)]",
  accent:
    "border border-[color-mix(in_srgb,var(--primary)_28%,var(--border)_72%)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--text)]",
  accentSecondary:
    "border border-[color-mix(in_srgb,var(--secondary)_24%,var(--border)_76%)] bg-[color-mix(in_srgb,var(--secondary)_14%,transparent)] text-[var(--text)]",
  success:
    "border border-[color-mix(in_srgb,var(--success)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--text)]",
  danger:
    "border border-[color-mix(in_srgb,var(--danger)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--text)]",
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-semibold tracking-[0.08em] uppercase",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
