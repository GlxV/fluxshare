import { cn } from "../../utils/cn";

type CardTone = "default" | "muted" | "solid";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  noShadow?: boolean;
  tone?: CardTone;
}

const toneClasses: Record<CardTone, string> = {
  default: "fs-panel",
  muted: "fs-panel-muted",
  solid: "fs-panel-solid",
};

export function Card({
  className,
  interactive = false,
  noShadow = false,
  tone = "default",
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        toneClasses[tone],
        interactive &&
          "transition duration-150 ease-out hover:-translate-y-px hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-strong)]",
        noShadow ? "shadow-none" : undefined,
        className,
      )}
      {...props}
    />
  );
}
