import { cn } from "../../utils/cn";

interface IconProps {
  className?: string;
}

export function FluxShareMark({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-5 w-5", className)}
    >
      <path d="M10 9.5h8.25a3.25 3.25 0 1 1 0 6.5H9.75" />
      <path d="M18 18.5H9.75a3.25 3.25 0 1 1 0-6.5H18.5" />
      <path d="m16.25 7 3 2.5-3 2.5" />
      <path d="m11.75 15.5-3 2.5 3 2.5" />
    </svg>
  );
}

export function UploadGlyph({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      <path d="M14 18V7.5" />
      <path d="m10.5 11 3.5-3.5 3.5 3.5" />
      <path d="M7 18.5v2a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5v-2" />
      <path d="M8.5 18.5h11" />
    </svg>
  );
}

export function FileGlyph({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      <path d="M10 4.75h6l4.25 4.25v11.25A2.75 2.75 0 0 1 17.5 23H10a2.75 2.75 0 0 1-2.75-2.75V7.5A2.75 2.75 0 0 1 10 4.75Z" />
      <path d="M16 4.75V9h4.25" />
      <path d="M10.75 14.5h6.5" />
      <path d="M10.75 18h4.75" />
    </svg>
  );
}

export function FolderGlyph({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      <path d="M4.75 9.5A2.75 2.75 0 0 1 7.5 6.75h4.25l2 2H20.5A2.75 2.75 0 0 1 23.25 11.5v8.75A2.75 2.75 0 0 1 20.5 23H7.5a2.75 2.75 0 0 1-2.75-2.75Z" />
      <path d="M4.75 11.5h18.5" />
    </svg>
  );
}
