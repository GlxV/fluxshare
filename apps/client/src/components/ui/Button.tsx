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
    "bg-[var(--primary)] text-white shadow-[0_20px_45px_-20px_rgba(124,58,237,0.75)] hover:brightness-110",
  secondary:
    "bg-[var(--card)]/70 text-[var(--text)] border border-[var(--border)]/80 hover:border-[var(--primary)]/70",
  ghost: "bg-transparent text-[var(--text)] hover:bg-white/10",
  outline:
    "border border-[var(--border)]/80 text-[var(--text)] hover:border-[var(--primary)]/70",
  danger: "bg-red-500/80 text-white hover:bg-red-400/90",
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
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2",
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
