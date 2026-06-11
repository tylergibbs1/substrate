import { useEffect, useState } from "react";
import { cx } from "../ui.js";
import { useEditor } from "../store.js";
import { Inspector } from "./Inspector.js";
import { AssistantPanel } from "./AssistantPanel.js";
import type { DeckDetail, Slide } from "@substrate/contracts";

/**
 * The right rail, tabbed: Inspector (per-slide settings) and Assistant (talk to the
 * agent to tweak the deck). One column, switchable — the work surface stays
 * dominant and chrome recedes, rather than adding a competing panel (PRD §7).
 */
export function RightRail({ detail, slide }: { detail: DeckDetail; slide: Slide | null }) {
  const [tab, setTab] = useState<"inspector" | "assistant">("assistant");
  const agentDeck = useEditor((s) => s.agentActivity?.deckId);

  // When an agent starts driving this deck, surface the Assistant tab so its live
  // narration is visible. Fires once per session — the user can switch back.
  useEffect(() => {
    if (agentDeck === detail.deck.id) setTab("assistant");
  }, [agentDeck, detail.deck.id]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex shrink-0 border-b border-line">
        {(["assistant", "inspector"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cx(
              "flex-1 h-9 mono text-[10px] uppercase tracking-wider transition-colors",
              tab === t ? "text-fg border-b-2 border-accent -mb-px" : "text-fg-faint hover:text-fg-dim",
            )}
          >
            {t === "inspector" ? "Inspector" : "Assistant"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "inspector" ? <Inspector detail={detail} slide={slide} /> : <AssistantPanel detail={detail} />}
      </div>
    </div>
  );
}
