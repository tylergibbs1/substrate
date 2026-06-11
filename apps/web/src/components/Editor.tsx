import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useSlideActions } from "../lib/slideActions.js";
import { useEditor } from "../store.js";
import { SlideRail } from "./SlideRail.js";
import { Canvas } from "./Canvas.js";
import { RightRail } from "./RightRail.js";
import { DeckBar } from "./DeckBar.js";
import { TopBar } from "./TopBar.js";
import { Empty } from "../ui.js";

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

export function Editor({ deckId }: { deckId: string }) {
  const deck = useQuery({ queryKey: ["deck", deckId], queryFn: () => api.deck(deckId) });
  const activeSlideId = useEditor((s) => s.activeSlideId);
  const setActiveSlide = useEditor((s) => s.setActiveSlide);
  const paletteOpen = useEditor((s) => s.paletteOpen);
  const actions = useSlideActions(deckId);

  // Auto-select the first slide when none is active.
  useEffect(() => {
    if (!activeSlideId && deck.data?.slides.length) {
      setActiveSlide(deck.data.slides[0]!.id);
    }
  }, [activeSlideId, deck.data, setActiveSlide]);

  // Generate display titles for any untitled slides (once each). The server
  // derives them with the title model and emits a deck-changed event, which
  // refetches the deck so the rail swaps the derived fallback for the real title.
  const titlesRequested = useRef<Set<string>>(new Set());
  useEffect(() => {
    const slides = deck.data?.slides;
    if (!slides) return;
    const pending = slides.filter((s) => s.title == null && !titlesRequested.current.has(s.id));
    if (pending.length === 0) return;
    pending.forEach((s) => titlesRequested.current.add(s.id));
    // Fire and forget; on failure the derived fallback stays and we don't loop.
    void api.ensureTitles(deckId).catch(() => {});
  }, [deck.data, deckId]);

  // The keyboard listener binds once; read the latest slides/actions through a
  // ref so it always acts on current state without re-registering every render.
  const latest = useRef({ slides: deck.data?.slides ?? [], activeSlideId, paletteOpen, actions });
  latest.current = { slides: deck.data?.slides ?? [], activeSlideId, paletteOpen, actions };

  // Keyboard-primary navigation + actions (Linear pattern). Single-letter keys
  // only fire when not typing and the palette is closed. Actions route through
  // the shared mutations — optimistic, deduped, errors not swallowed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { slides, activeSlideId: cur, paletteOpen: open, actions: act } = latest.current;
      if (open || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (slides.length === 0 && e.key !== "n" && e.key !== "N") return;
      const ids = slides.map((s) => s.id);
      const curId = cur ?? ids[0] ?? null;
      const slide = slides.find((s) => s.id === curId) ?? null;
      const idx = Math.max(0, curId ? ids.indexOf(curId) : 0);
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setActiveSlide(ids[Math.min(idx + 1, ids.length - 1)]!);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setActiveSlide(ids[Math.max(idx - 1, 0)]!);
      } else if (e.key === "r" || e.key === "R") {
        act.regenerateIfIdle(slide);
      } else if (e.key === "v" || e.key === "V") {
        if (slide) act.variations.mutate({ slideId: slide.id });
      } else if (e.key === "n" || e.key === "N") {
        act.addSlide.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveSlide]);

  if (!deck.data) {
    return <Empty>Loading deck…</Empty>;
  }

  const detail = deck.data;
  const slide = detail.slides.find((s) => s.id === activeSlideId) ?? detail.slides[0] ?? null;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopBar detail={detail} />
      <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr_300px]">
        <div className="min-h-0 border-r border-line bg-ink-1">
          <SlideRail detail={detail} />
        </div>
        <div className="min-h-0 bg-ink-0">
          <Canvas detail={detail} slide={slide} />
        </div>
        <div className="min-h-0 border-l border-line bg-ink-1">
          <RightRail detail={detail} slide={slide} />
        </div>
      </div>
      <DeckBar detail={detail} />
    </div>
  );
}
