import { cn } from "../../utils/cn";

type UrlDisplayProps = {
  url?: string | null;
  placeholder?: string;
  className?: string;
};

type UrlFieldProps = UrlDisplayProps & {
  valueClassName?: string;
};

function normalizeUrl(url?: string | null) {
  const value = typeof url === "string" ? url.trim() : "";
  return value.length > 0 ? value : null;
}

export function UrlText({ url, placeholder = "--", className }: UrlDisplayProps) {
  const normalizedUrl = normalizeUrl(url);

  return (
    <span
      className={cn("block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap", className)}
      title={normalizedUrl ?? undefined}
    >
      {normalizedUrl ?? placeholder}
    </span>
  );
}

export function UrlField({ url, placeholder = "--", className, valueClassName }: UrlFieldProps) {
  const normalizedUrl = normalizeUrl(url);

  return (
    <div
      className={cn("fs-input flex min-w-0 items-center overflow-hidden", className)}
      role="textbox"
      aria-readonly="true"
      title={normalizedUrl ?? undefined}
    >
      <span
        className={cn(
          "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
          normalizedUrl ? "text-[var(--text)]" : "text-[var(--muted)]",
          valueClassName,
        )}
      >
        {normalizedUrl ?? placeholder}
      </span>
    </div>
  );
}
