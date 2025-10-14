import { cn } from "../../utils/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  noShadow?: boolean;
}

export function Card({ className, noShadow = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--card-border)]/80 bg-[var(--card)]/85 backdrop-blur-2xl",
        "transition-shadow duration-200",
        noShadow ? undefined : "card-shadow",
        className,
      )}
      {...props}
    />
  );
}
