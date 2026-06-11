import { twMerge } from "tailwind-merge";

/**
 * `cn` — class merge with Tailwind conflict resolution. The t3code web stack
 * uses class-variance-authority + tailwind-merge for component variants.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
