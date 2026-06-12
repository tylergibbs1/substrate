import { ArrowUpCircle } from "lucide-react";
import { useUpdater } from "../lib/useUpdater.js";

/**
 * Update affordance for the starting screen's top-right utility cluster. Auto-update
 * downloads in the background; this stays invisible until an update has landed, then
 * shows a quiet accent button that installs-and-restarts on click. (Chrome recedes —
 * it only appears when there's something to act on; PRD §7.)
 */
export function UpdatePill() {
  const { state, restart } = useUpdater();
  if (state.status !== "downloaded") return null;
  return (
    <button
      type="button"
      onClick={() => restart()}
      title={state.version ? `Install ${state.version} and restart` : "Restart to install the update"}
      className="inline-flex items-center gap-1.5 rounded-full h-8 px-2.5 text-[12px] text-accent hover:bg-ink-2 transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowUpCircle size={14} />
      Update ready{state.version ? ` · ${state.version}` : ""}
    </button>
  );
}
