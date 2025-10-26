import { forwardRef } from "react";
import { cn } from "../../utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "md" | "sm";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_20px_45px_-20px_var(--ring)] hover:bg-[color-mix(in srgb,var(--primary) 88%,var(--surface) 12%)]",
  secondary:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[color-mix(in srgb,var(--surface) 85%,var(--bg) 15%)]",
  ghost:
    "bg-transparent text-[var(--text)] hover:bg-[color-mix(in srgb,var(--surface) 55%,transparent)]",
  outline:
    "border border-[var(--border)] text-[var(--text)] hover:border-[color-mix(in srgb,var(--primary) 65%,var(--border) 35%)]",
  danger:
    "bg-[color-mix(in srgb,var(--primary) 55%,var(--surface-2) 45%)] text-[var(--primary-foreground)] hover:bg-[color-mix(in srgb,var(--primary) 62%,var(--surface-2) 38%)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm",
  sm: "h-9 px-3 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
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
