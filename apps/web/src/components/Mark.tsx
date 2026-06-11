import { cn } from "../lib/cn.js";

/**
 * The Substrate logo, inline so it inherits `currentColor` and stays crisp at
 * any size. An aperture ring split by a compass needle — the negative space
 * reads as an "S". Geometry matches brand/substrate-mark.svg (the source of truth).
 */
function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M 159.56 192.71 A 72 72 0 0 1 63.29 96.44 L 86.66 107.83 A 46 46 0 0 0 148.17 169.34 Z" />
      <path d="M 96.44 63.29 A 72 72 0 0 1 192.71 159.56 L 169.34 148.17 A 46 46 0 0 0 107.83 86.66 Z" />
      <path d="M 199.42 199.42 L 117.75 138.25 L 56.58 56.58 L 138.25 117.75 Z" />
    </svg>
  );
}

/** Mark + wordmark lockup, in the app's own type (Inter). */
export function Wordmark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-fg select-none", className)}>
      <Mark size={size} />
      <span className="text-[19px] font-medium lowercase tracking-[-0.04em]">substrate</span>
    </span>
  );
}
