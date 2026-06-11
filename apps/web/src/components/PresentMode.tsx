import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { blobUrl } from "../lib/api.js";
import { useEditor } from "../store.js";
import type { DeckDetail } from "@substrate/contracts";

/**
 * Fullscreen present mode — the first-party way to show a finished deck. The
 * rendered slide is everything; all chrome recedes to faint, edge-anchored
 * controls. Arrow keys / space / click advance, Esc exits.
 */
export function PresentMode({ detail }: { detail: DeckDetail }) {
  const slides = detail.slides;
  const setPresenting = useEditor((s) => s.setPresenting);
  const setActiveSlide = useEditor((s) => s.setActiveSlide);
  const activeSlideId = useEditor((s) => s.activeSlideId);

  const start = slides.findIndex((s) => s.id === activeSlideId);
  const [idx, setIdx] = useState(start < 0 ? 0 : start);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const clamp = (n: number) => Math.max(0, Math.min(slides.length - 1, n));
  const exit = () => {
    const cur = slides[idxRef.current];
    if (cur) setActiveSlide(cur.id); // leave the editor focused on where you ended
    setPresenting(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setIdx((c) => clamp(c + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setIdx((c) => clamp(c - 1));
      } else if (e.key === "Home") {
        setIdx(0);
      } else if (e.key === "End") {
        setIdx(slides.length - 1);
      } else if (e.key === "Escape") {
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const slide = slides[idx];
  const url = slide ? blobUrl(slide.imageBlobRef) : null;

  return (
    <div className="fixed inset-0 z-[60] flex select-none items-center justify-center bg-black">
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="mono text-[12px] uppercase tracking-eyebrow text-fg-faint">Slide not rendered yet</span>
      )}

      {/* Click zones: left third = previous, right third = next. */}
      <button
        type="button"
        aria-label="Previous slide"
        onClick={() => setIdx((c) => clamp(c - 1))}
        className="absolute left-0 top-0 h-full w-1/3 cursor-w-resize"
      />
      <button
        type="button"
        aria-label="Next slide"
        onClick={() => setIdx((c) => clamp(c + 1))}
        className="absolute right-0 top-0 h-full w-1/3 cursor-e-resize"
      />

      {/* Faint chrome, above the click zones. */}
      <button
        type="button"
        onClick={exit}
        title="Exit (Esc)"
        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-fg-faint hover:bg-white/10 hover:text-fg"
      >
        <X size={16} />
      </button>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 mono text-[11px] tracking-eyebrow text-fg-faint">
        {idx + 1} / {slides.length}
      </div>
      <div className="absolute bottom-4 right-4 flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous"
          disabled={idx === 0}
          onClick={() => setIdx((c) => clamp(c - 1))}
          className="grid h-8 w-8 place-items-center rounded-full text-fg-faint hover:bg-white/10 hover:text-fg disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Next"
          disabled={idx === slides.length - 1}
          onClick={() => setIdx((c) => clamp(c + 1))}
          className="grid h-8 w-8 place-items-center rounded-full text-fg-faint hover:bg-white/10 hover:text-fg disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
