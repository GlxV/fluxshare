import { forwardRef } from "react";
import { cn } from "../../utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "lg" | "md" | "sm";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-accent)] hover:-translate-y-px hover:brightness-[1.03]",
  secondary:
    "border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[color-mix(in_srgb,var(--panel-muted)_78%,var(--surface-3)_22%)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--muted-strong)] hover:bg-[color-mix(in_srgb,var(--panel-muted)_58%,transparent)] hover:text-[var(--text)]",
  outline:
    "border border-[var(--border)] bg-transparent text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[color-mix(in_srgb,var(--panel-muted)_42%,transparent)]",
  danger:
    "border border-[color-mix(in_srgb,var(--danger)_48%,var(--border)_52%)] bg-[color-mix(in_srgb,var(--danger)_14%,var(--surface)_86%)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,var(--surface)_82%)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  lg: "h-12 px-5 text-sm",
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] font-medium tracking-[-0.01em] transition duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          "disabled:cursor-not-allowed disabled:opacity-55 disabled:transform-none disabled:shadow-none",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        disabled={disabled}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
