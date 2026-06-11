import { Loader2, ImageOff } from "lucide-react";
import { blobUrl } from "../lib/api.js";
import { useEditor } from "../store.js";
import { cx } from "../ui.js";
import type { DeckDetail } from "@substrate/contracts";

const ASPECT: Record<string, string> = { "16:9": "16 / 9", "4:3": "4 / 3", "1:1": "1 / 1" };
const RENDERING = new Set(["queued", "thinking", "rendering"]);

/**
 * Deck overview: every slide as a thumbnail at once. This is the only place you
 * can police cross-slide visual consistency — the thing stochastic raster decks
 * need most — and it serves "the rendered slide dominates" at deck scale. Click a
 * thumbnail to focus it in the canvas.
 */
export function OverviewGrid({ detail }: { detail: DeckDetail }) {
  const setActiveSlide = useEditor((s) => s.setActiveSlide);
  const setEditorView = useEditor((s) => s.setEditorView);
  const activeSlideId = useEditor((s) => s.activeSlideId);
  const aspect = ASPECT[detail.deck.aspectRatio] ?? "16 / 9";

  return (
    <div className="h-full overflow-auto p-6">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {detail.slides.map((slide, i) => {
          const url = blobUrl(slide.imageBlobRef);
          const rendering = !url && slide.jobStatus != null && RENDERING.has(slide.jobStatus);
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => {
                setActiveSlide(slide.id);
                setEditorView("canvas");
              }}
              title={slide.title ?? `Slide ${i + 1}`}
              className={cx(
                "group text-left rounded-lg overflow-hidden border transition-colors",
                slide.id === activeSlideId ? "border-accent" : "border-line hover:border-fg-faint",
              )}
            >
              <div className="relative grid place-items-center bg-ink-2" style={{ aspectRatio: aspect }}>
                {url ? (
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
                  />
                ) : rendering ? (
                  <Loader2 size={18} className="animate-spin text-fg-faint" />
                ) : (
                  <ImageOff size={16} className="text-fg-faint" />
                )}
                <span className="absolute left-1.5 top-1.5 rounded-full bg-ink-0/70 px-1.5 py-0.5 mono text-[10px] tracking-eyebrow text-fg">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="truncate px-2.5 py-1.5 text-[12px] text-fg-dim">{slide.title ?? `Slide ${i + 1}`}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
