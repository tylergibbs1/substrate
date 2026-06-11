import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, CornerDownLeft } from "lucide-react";
import { api } from "../lib/api.js";
import { downloadDeckExport } from "../lib/downloadExport.js";
import { deriveSlideTitle } from "@substrate/shared/SlideTitle";
import { useSlideActions } from "../lib/slideActions.js";
import { useEditor } from "../store.js";
import { cx, Eyebrow } from "../ui.js";

/**
 * ⌘K command palette over the local object pool (the deck + slides already in
 * the query cache) — keyboard-primary input, the Linear pattern. No server
 * round-trip to populate it; everything resolves against cached state.
 */
interface Command {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly hint?: string;
  readonly run: () => void;
}

export function CommandPalette() {
  const qc = useQueryClient();
  const open = useEditor((s) => s.paletteOpen);
  const setOpen = useEditor((s) => s.setPaletteOpen);
  const activeDeckId = useEditor((s) => s.activeDeckId);
  const activeSlideId = useEditor((s) => s.activeSlideId);
  const setActiveDeck = useEditor((s) => s.setActiveDeck);
  const setActiveSlide = useEditor((s) => s.setActiveSlide);
  const setShowDesignEditor = useEditor((s) => s.setShowDesignEditor);
  const setConnectOpen = useEditor((s) => s.setConnectOpen);
  const setSettingsOpen = useEditor((s) => s.setSettingsOpen);
  const editorView = useEditor((s) => s.editorView);
  const setEditorView = useEditor((s) => s.setEditorView);
  const setPresenting = useEditor((s) => s.setPresenting);

  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const deck = useQuery({ queryKey: ["deck", activeDeckId], queryFn: () => api.deck(activeDeckId!), enabled: !!activeDeckId });
  const detail = deck.data;
  const slideId = activeSlideId ?? detail?.slides[0]?.id ?? null;
  const slide = detail?.slides.find((s) => s.id === slideId) ?? null;

  const invalidate = () => activeDeckId && qc.invalidateQueries({ queryKey: ["deck", activeDeckId] });
  // Same optimistic/deduped mutations as the canvas + keyboard shortcuts.
  const actions = useSlideActions(activeDeckId ?? "");
  const review = useMutation({
    mutationFn: () => api.setReviewMode(activeDeckId!, !detail?.deck.reviewMode),
    onSuccess: invalidate,
  });
  // Export asks where to download, then writes the bundle there (see downloadDeckExport).
  const doExport = useMutation({ mutationFn: () => downloadDeckExport(activeDeckId!, "png") });

  const commands = useMemo<Command[]>(() => {
    if (!detail) return [];
    const close = () => setOpen(false);
    const wrap = (fn: () => void) => () => {
      fn();
      close();
    };
    const actionList: Command[] = [
      slide ? { id: "regen", label: "Regenerate current slide", group: "Actions", hint: "R", run: wrap(() => actions.regenerateIfIdle(slide)) } : null,
      slideId ? { id: "variations", label: "Variations of current slide", group: "Actions", hint: "V", run: wrap(() => actions.variations.mutate({ slideId })) } : null,
      slideId ? { id: "reseed", label: "Reseed current slide", group: "Actions", run: wrap(() => actions.regenerate.mutate({ slideId, reseed: true })) } : null,
      { id: "new", label: "New slide", group: "Actions", hint: "N", run: wrap(() => actions.addSlide.mutate()) },
      detail.slides.length > 0 ? { id: "present", label: "Present deck (fullscreen)", group: "Actions", run: wrap(() => setPresenting(true)) } : null,
      { id: "overview", label: editorView === "grid" ? "Back to single slide" : "Overview — all slides at once", group: "Actions", run: wrap(() => setEditorView(editorView === "grid" ? "canvas" : "grid")) },
      { id: "review", label: `${detail.deck.reviewMode ? "Disable" : "Enable"} review mode`, group: "Actions", run: wrap(() => review.mutate()) },
      { id: "design", label: "Edit main design prompt", group: "Actions", run: wrap(() => setShowDesignEditor(true)) },
      { id: "export", label: "Export deck as PNG", group: "Actions", run: wrap(() => doExport.mutate()) },
      { id: "connect", label: "Connect an agent over MCP", group: "Actions", run: wrap(() => setConnectOpen(true)) },
      { id: "settings", label: "Settings — set OpenAI API key", group: "Actions", run: wrap(() => setSettingsOpen(true)) },
      { id: "decks", label: "Back to all decks", group: "Actions", run: wrap(() => setActiveDeck(null)) },
    ].filter(Boolean) as Command[];

    const slides: Command[] = detail.slides.map((s, i) => ({
      id: `slide-${s.id}`,
      label: `${String(i + 1).padStart(2, "0")}  ${s.title ?? deriveSlideTitle(s.prompt)}`,
      group: "Go to slide",
      run: wrap(() => setActiveSlide(s.id)),
    }));
    return [...actionList, ...slides];
  }, [detail, slideId, slide, editorView]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Reset state each time the palette opens; focus the input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-ink-0/60" onClick={() => setOpen(false)}>
      <div
        className="animate-enter w-full max-w-xl rounded-lg border border-line-2 bg-ink-1 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-line">
          <Search size={15} className="text-fg-faint shrink-0" />
          <input
            ref={inputRef}
            value={query}
            aria-label="Search slides and actions"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slides and actions…"
            className="flex-1 bg-transparent py-3 text-[13px] outline-none placeholder:text-fg-faint"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                filtered[sel]?.run();
              }
            }}
          />
        </div>
        <div className="max-h-[50vh] overflow-auto py-1">
          {filtered.length === 0 && <div className="px-3 py-6 text-center text-xs text-fg-faint">No matches.</div>}
          {filtered.map((c, i) => {
            const showGroup = i === 0 || filtered[i - 1]!.group !== c.group;
            return (
              <div key={c.id}>
                {showGroup && (
                  <Eyebrow className="block px-3 pt-2 pb-1">{c.group}</Eyebrow>
                )}
                <button type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => c.run()}
                  className={cx(
                    "w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-[12.5px]",
                    i === sel ? "bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)] text-fg" : "text-fg-dim",
                  )}
                >
                  <span className="truncate">{c.label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {c.hint && <kbd className="mono text-[10px] text-fg-faint border border-line-2 rounded px-1">{c.hint}</kbd>}
                    {i === sel && <CornerDownLeft size={12} className="text-fg-faint" />}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
