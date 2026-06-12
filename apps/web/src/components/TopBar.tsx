import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Download, Eye, Check, Command, AlertTriangle, LayoutGrid, Play } from "lucide-react";
import { api } from "../lib/api.js";
import { downloadDeckExport } from "../lib/downloadExport.js";
import { useEditor } from "../store.js";
import { Button, Chip, Switch, Tooltip, cx } from "../ui.js";
import type { DeckDetail, ExportFormat } from "@substrate/contracts";

// pptx is a real single file (prompts in speaker notes); pdf still bundles images.
const EXPORT_TITLE: Record<ExportFormat, string> = {
  png: "Export each slide as a PNG + notes.md",
  pdf: "Image bundle + notes.md (single-file PDF is a follow-up)",
  pptx: "Real .pptx — each slide image, with its prompt in the speaker notes",
};

export function TopBar({ detail }: { detail: DeckDetail }) {
  const qc = useQueryClient();
  const setActiveDeck = useEditor((s) => s.setActiveDeck);
  const togglePalette = useEditor((s) => s.togglePalette);
  const editorView = useEditor((s) => s.editorView);
  const setEditorView = useEditor((s) => s.setEditorView);
  const setPresenting = useEditor((s) => s.setPresenting);
  const setNotice = useEditor((s) => s.setNotice);
  const [exported, setExported] = useState<{ destination: string; note?: string } | null>(null);

  const review = useMutation({
    mutationFn: (on: boolean) => api.setReviewMode(detail.deck.id, on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deck", detail.deck.id] }),
  });

  // Export asks where to download (File System Access picker), then writes the
  // bundle there. Keep the server's caveat (the fallback note) instead of an
  // unconditional success — honest states (AGENTS.md reliability).
  const doExport = useMutation({
    mutationFn: (format: ExportFormat) => downloadDeckExport(detail.deck.id, format),
    onSuccess: (r) => setExported({ destination: r.destination, ...(r.note !== undefined ? { note: r.note } : {}) }),
    onError: (err) => {
      // Dismissing the destination picker is a normal cancel, not a failure —
      // stay silent. Anything else (server error, blob read, write fault) is a
      // real failure the user must see, not a no-op click.
      if (err instanceof Error && err.name === "ExportCancelled") return;
      setNotice(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
    },
  });

  return (
    <header className="titlebar shrink-0 flex items-center justify-between px-3 h-12 border-b border-line bg-ink-1">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" onClick={() => setActiveDeck(null)}>
          <ChevronLeft size={15} /> Decks
        </Button>
        <div className="w-px h-5 bg-line" />
        <span className="font-normal tracking-tight truncate">{detail.deck.title}</span>
        <Chip>{detail.deck.aspectRatio}</Chip>
        <Chip>{detail.slides.length} slides</Chip>
      </div>

      <div className="flex items-center gap-2">
        {exported && (
          <span
            className={`text-[10px] mono truncate max-w-[320px] ${exported.note ? "text-warn" : "text-ok"}`}
            title={exported.note ? `${exported.destination}\n${exported.note}` : exported.destination}
          >
            {exported.note ? (
              <AlertTriangle size={11} className="inline mr-1" />
            ) : (
              <Check size={11} className="inline mr-1" />
            )}
            saved → {exported.destination}
          </span>
        )}
        <Tooltip label={editorView === "grid" ? "Back to the single slide" : "Overview — every slide at once"}>
          <button
            type="button"
            onClick={() => setEditorView(editorView === "grid" ? "canvas" : "grid")}
            aria-pressed={editorView === "grid"}
            className={cx(
              "grid h-[30px] w-[30px] place-items-center rounded-full border transition-colors",
              editorView === "grid"
                ? "border-fg-faint bg-ink-2 text-fg"
                : "border-line-2 text-fg-faint hover:border-fg-faint hover:bg-ink-2 hover:text-fg",
            )}
          >
            <LayoutGrid size={13} />
          </button>
        </Tooltip>
        <Tooltip label="Present — fullscreen slideshow (Esc to exit)">
          <button
            type="button"
            onClick={() => setPresenting(true)}
            disabled={detail.slides.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-line-2 px-2.5 py-1 text-fg-faint transition-colors hover:border-fg-faint hover:bg-ink-2 hover:text-fg disabled:opacity-40"
          >
            <Play size={12} />
            <span className="text-[11px]">Present</span>
          </button>
        </Tooltip>
        <Tooltip label="Command palette — jump to a slide or run an action">
          <button type="button"
            onClick={() => togglePalette()}
            className="flex items-center gap-1.5 rounded-full border border-line-2 bg-transparent px-2.5 py-1 text-fg-faint hover:text-fg hover:bg-ink-2 hover:border-fg-faint transition-colors"
          >
            <Command size={12} />
            <kbd className="mono text-[10px]">⌘K</kbd>
          </button>
        </Tooltip>
        <Tooltip label="In review mode, all edits (human and agent) land as proposals to approve.">
          <span className="flex items-center gap-1.5 rounded-full border border-line-2 bg-transparent px-2.5 py-1">
            <Eye size={13} className="text-fg-faint" />
            <span className="text-[11px] text-fg-dim">Review</span>
            <Switch checked={detail.deck.reviewMode} onChange={(on) => review.mutate(on)} label="Toggle review mode" />
          </span>
        </Tooltip>
        <div className="flex items-center rounded-full border border-line-2 overflow-hidden">
          <span className="mono px-2.5 text-[10px] text-fg-faint uppercase tracking-wider">
            <Download size={12} className="inline mr-1" />export
          </span>
          {(["png", "pdf", "pptx"] as ExportFormat[]).map((f) => (
            <button type="button"
              key={f}
              onClick={() => doExport.mutate(f)}
              disabled={doExport.isPending}
              title={EXPORT_TITLE[f]}
              className="px-2.5 py-1.5 text-[11px] uppercase mono tracking-wider text-fg-dim hover:bg-ink-2 hover:text-fg border-l border-line-2 disabled:opacity-40"
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
