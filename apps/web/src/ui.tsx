import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "./lib/cn.js";

/**
 * Small, quiet primitives. Chrome recedes; the slide and prompt own the screen.
 * Variants via class-variance-authority; interactive bits on Base UI — the same
 * design stack as t3code's web app.
 */

export { cn as cx };

const button = cva(
  // Every interactive button is a pill (DESIGN.md). Weight 400 — emphasis comes
  // from size, never weight. Specific transition (never `all`) covering colors +
  // scale; scale-on-press gives tactile feedback (§12). Active state is disabled
  // via the `static` prop.
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-normal transition-[color,background-color,border-color,filter,transform] duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none",
  {
    variants: {
      variant: {
        // Outline pill — transparent fill, hairline border, white text.
        default: "bg-transparent border border-line-2 text-fg hover:bg-ink-2 hover:border-fg-faint",
        // The rare white-filled pill (on-primary near-black text).
        primary: "bg-fg border border-fg text-on-primary hover:brightness-95",
        ghost: "text-fg-dim hover:text-fg hover:bg-ink-2",
        danger:
          "bg-transparent border border-line-2 text-danger hover:bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)]",
      },
      press: {
        true: "active:scale-[0.96]",
        false: "",
      },
    },
    defaultVariants: { variant: "default", press: true },
  },
);

export function Button({
  variant,
  className,
  children,
  static: isStatic = false,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { static?: boolean }) {
  return (
    <button type="button" {...rest} className={cn(button({ variant, press: !isStatic }), className)}>
      {children}
    </button>
  );
}

/**
 * Ghost icon button — a circular, quiet hit target for close/add/dismiss
 * affordances. One primitive so the 7×7 / -m-1 / hover treatment never drifts
 * between the canvas, deck bar, rail, and modals. `tone="accent"` is for the
 * add-affordance that should light up on hover; default recedes to fg.
 */
export function IconButton({
  label,
  tone = "default",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "default" | "accent" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        "grid place-items-center w-7 h-7 rounded-full text-fg-faint transition-colors hover:bg-ink-2",
        tone === "accent" ? "hover:text-accent" : "hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Eyebrow / micro-label — the uppercase mono caption used for section headers,
 * panel titles, and group labels. One primitive fixes the tracking drift
 * (tracking-wider vs [1.2px] vs [0.12em]) the audit flagged across ~20 sites.
 */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("mono text-[10px] uppercase tracking-eyebrow text-fg-faint", className)}>{children}</span>
  );
}

/** Tooltip on a Base UI primitive — machinery on demand, accessible by default. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={<span className="inline-flex" />}>{children}</BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6}>
          <BaseTooltip.Popup className="rounded bg-ink-3 border border-line-2 px-2 py-1 text-[11px] text-fg shadow-lg">
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
        checked ? "bg-accent border-accent" : "bg-ink-3 border-line-2",
      )}
    >
      <BaseSwitch.Thumb className="block h-3 w-3 translate-x-0.5 rounded-full bg-white transition-transform data-[checked]:translate-x-[14px]" />
    </BaseSwitch.Root>
  );
}

const CHIP_TONES: Record<string, string> = {
  neutral: "text-fg-faint border-line-2",
  accent: "text-accent border-[color-mix(in_oklab,var(--color-accent)_40%,transparent)]",
  agent: "text-agent border-agent-soft",
  busy: "text-busy border-[color-mix(in_oklab,var(--color-busy)_40%,transparent)]",
  warn: "text-warn border-[color-mix(in_oklab,var(--color-warn)_40%,transparent)]",
  ok: "text-ok border-[color-mix(in_oklab,var(--color-ok)_40%,transparent)]",
};

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "agent" | "busy" | "warn" | "ok";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-eyebrow",
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="h-full grid place-items-center p-6 text-center text-fg-faint text-xs">{children}</div>
  );
}
