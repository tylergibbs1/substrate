import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Sparkles, Check, X, ImageOff, AlertTriangle } from "lucide-react";
import { api, blobUrl, type Variation } from "../lib/api.js";
import { useSlideActions } from "../lib/slideActions.js";
import { Button, Chip, cx, Eyebrow, IconButton } from "../ui.js";
import { DiffView } from "./DiffView.js";
import type { DeckDetail, Slide } from "@substrate/contracts";

const ASPECT_CLASS: Record<string, string> = {
  "16:9": "aspect-[16/9]",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
};

export function Canvas({ detail, slide }: { detail: DeckDetail; slide: Slide | null }) {
  if (!slide) {
    return (
      <div className="h-full grid place-items-center text-fg-faint text-sm">
        Select or add a slide to begin.
      </div>
    );
  }
  return <SlideCanvas key={slide.id} detail={detail} slide={slide} />;
}

function SlideCanvas({ detail, slide }: { detail: DeckDetail; slide: Slide }) {
  const qc = useQueryClient();
  const actions = useSlideActions(detail.deck.id);
  const [draft, setDraft] = useState(slide.prompt);
  const [proposeMode, setProposeMode] = useState(false);
  const [variations, setVariations] = useState<Variation[] | null>(null);

  // Keep the editor in sync when the slide's prompt changes underneath us
  // (e.g. an agent edit applied over MCP) — but don't stomp unsaved local edits.
  useEffect(() => {
    setDraft(slide.prompt);
  }, [slide.id, slide.prompt]);

  // Track image load failure so a missing/expired blob shows a recoverable
  // state instead of the browser's broken-image glyph. Reset during render when
  // the blob changes (React's "adjust state on prop change" pattern — avoids the
  // extra-commit flash an effect would cause).
  const [imgBroken, setImgBroken] = useState(false);
  const [seenRef, setSeenRef] = useState(slide.imageBlobRef);
  if (seenRef !== slide.imageBlobRef) {
    setSeenRef(slide.imageBlobRef);
    setImgBroken(false);
  }

  const dirty = draft !== slide.prompt;
  // Queued and rendering are distinct states — queued is a calm "waiting", only
  // an active render gets the spinner + sweep (so the rail tracks real work).
  const rendering = slide.jobStatus === "rendering" || slide.jobStatus === "thinking";
  const queued = slide.jobStatus === "queued";
  const busy = rendering || queued;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["deck", detail.deck.id] });

  // Optimistic save: the rail text + status update instantly (no round-trip
  // flash); the only spinner the user sees is the render itself.
  const save = useMutation({
    mutationFn: () => api.editSlidePrompt(slide.id, draft, proposeMode ? "propose" : "direct"),
    onMutate: async () => {
      if (proposeMode || detail.deck.reviewMode) return undefined; // proposals don't change the slide
      await qc.cancelQueries({ queryKey: ["deck", detail.deck.id] });
      const prev = qc.getQueryData<DeckDetail>(["deck", detail.deck.id]);
      qc.setQueryData<DeckDetail>(["deck", detail.deck.id], (d) =>
        d
          ? {
              ...d,
              slides: d.slides.map((s) => (s.id === slide.id ? { ...s, prompt: draft, jobStatus: "queued" } : s)),
            }
          : d,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["deck", detail.deck.id], ctx.prev);
    },
    onSettled: invalidate,
  });
  const makeVariations = useMutation({
    mutationFn: () => api.variations(slide.id, 4),
    onSuccess: (v) => setVariations(v),
  });
  const pick = useMutation({
    mutationFn: (versionId: string) => api.pickVersion(slide.id, versionId),
    onSuccess: () => {
      setVariations(null);
      invalidate();
    },
  });

  const url = blobUrl(slide.imageBlobRef);
  const pending = detail.pendingEdits.filter((e) => e.target === "slide" && e.targetId === slide.id);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Pending proposals for this slide — review and approve (§7.1) */}
      {pending.length > 0 && (
        <div className="animate-enter shrink-0 border-b border-line bg-agent-wash p-3 space-y-2 max-h-48 overflow-auto">
          {pending.map((e) => (
            <ProposalCard key={e.id} edit={e} deckId={detail.deck.id} currentValue={slide.prompt} />
          ))}
        </div>
      )}

      {/* The rendered slide — primary visual weight. overflow-hidden + max-h-full
          keep the aspect box inside the (possibly squeezed) area so it never
          overlaps the proposal panel above or the editor below. */}
      <div className="flex-1 min-h-0 grid place-items-center p-6 overflow-hidden">
        <div
          className={cx(
            "relative w-full max-w-4xl max-h-full overflow-hidden rounded-lg bg-ink-2 ring-1 ring-line",
            ASPECT_CLASS[detail.deck.aspectRatio] ?? ASPECT_CLASS["16:9"],
          )}
        >
          {url && !imgBroken ? (
            <img
              src={url}
              alt={slide.prompt}
              onError={() => setImgBroken(true)}
              className="w-full h-full object-contain outline outline-1 -outline-offset-1 outline-white/10"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-fg-faint">
              {busy ? null : imgBroken ? (
                <span className="flex flex-col items-center gap-2 text-xs">
                  <ImageOff size={22} /> image unavailable
                  <button type="button"
                    onClick={() => actions.regenerate.mutate({ slideId: slide.id })}
                    className="rounded-full border border-line-2 px-3 py-1 text-fg hover:bg-ink-2 hover:border-fg-faint transition-colors"
                  >
                    regenerate
                  </button>
                </span>
              ) : (
                <span className="flex flex-col items-center gap-2 text-xs">
                  <ImageOff size={22} /> not rendered yet
                  <button type="button"
                    onClick={() => actions.regenerateIfIdle(slide)}
                    disabled={actions.regenerate.isPending}
                    className="rounded-full border border-line-2 px-3 py-1 text-fg hover:bg-ink-2 hover:border-fg-faint transition-colors disabled:opacity-40"
                  >
                    Generate
                  </button>
                </span>
              )}
            </div>
          )}
          {busy && (
            <>
              <div className="absolute inset-0 bg-ink-0/40 animate-pulse-soft" />
              {rendering && (
                <div className="absolute inset-x-0 top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--color-busy)_18%,transparent)] to-transparent animate-sweep" />
              )}
              <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-[11px] text-busy mono uppercase tracking-wider bg-ink-0/70 rounded-full px-2 py-1">
                {rendering ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-busy/60" />
                )}{" "}
                {slide.jobStatus}…
              </div>
            </>
          )}
        </div>
      </div>

      {/* Variations strip */}
      {variations && (
        <div className="animate-enter shrink-0 border-t border-line p-3">
          <div className="flex items-center justify-between mb-2">
            <Eyebrow>Variations — pick one</Eyebrow>
            <IconButton label="Close variations" onClick={() => setVariations(null)} className="-m-1">
              <X size={14} />
            </IconButton>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {variations.map((v) => (
              <button type="button"
                key={v.versionId}
                onClick={() => pick.mutate(v.versionId)}
                className="group relative rounded-lg overflow-hidden ring-1 ring-line-2 hover:ring-accent"
              >
                <img
                  src={blobUrl(v.imageBlobRef)!}
                  alt="variation"
                  className="w-full aspect-video object-cover outline outline-1 -outline-offset-1 outline-white/10"
                />
                <span className="absolute bottom-1 right-1 mono uppercase tracking-wider text-[9px] text-fg bg-ink-0/70 px-1 rounded-full">
                  seed {v.seed}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The slide prompt editor — the substrate, docked below the canvas */}
      <div className="shrink-0 border-t border-line bg-ink-1">
        <div className="flex items-center justify-between px-3 h-8">
          <Eyebrow>Slide prompt</Eyebrow>
          <span className="flex items-center gap-2">
            {dirty && <Chip tone="warn">unsaved</Chip>}
            {detail.deck.reviewMode && <Chip tone="agent">review mode → proposes</Chip>}
          </span>
        </div>
        <textarea
          value={draft}
          aria-label="Slide prompt"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter saves & renders without leaving the keyboard.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty) {
              e.preventDefault();
              save.mutate();
            }
          }}
          spellCheck={false}
          rows={4}
          className="w-full bg-ink-0 mono text-[12.5px] leading-relaxed text-fg px-3 py-2.5 outline-none resize-none border-y border-line focus:border-accent"
        />
        <div className="flex items-center gap-2 px-3 py-2">
          <Button
            variant="default"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
            title="Apply the prompt edit and re-render this slide"
          >
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {proposeMode || detail.deck.reviewMode ? "Propose edit" : "Save & render"}
          </Button>
          <Button
            onClick={() => actions.regenerateIfIdle(slide)}
            disabled={busy || actions.regenerate.isPending}
            title={busy ? "Already rendering" : "Re-render this slide from its current prompts"}
          >
            <RefreshCw size={13} /> Regenerate
          </Button>
          <Button
            onClick={() => actions.regenerate.mutate({ slideId: slide.id, reseed: true })}
            disabled={busy || actions.regenerate.isPending}
            title="New seed — a genuinely fresh take"
          >
            <Sparkles size={13} /> Reseed
          </Button>
          <Button onClick={() => makeVariations.mutate()} disabled={makeVariations.isPending}>
            {makeVariations.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Variations
          </Button>
          {!detail.deck.reviewMode && (
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-fg-faint cursor-pointer">
              <input
                type="checkbox"
                checked={proposeMode}
                onChange={(e) => setProposeMode(e.target.checked)}
                className="accent-agent"
              />
              propose instead of apply
            </label>
          )}
        </div>
        {save.isError && <div className="px-3 pb-2 text-danger text-xs">{(save.error as Error).message}</div>}
      </div>
    </div>
  );
}

function ProposalCard({
  edit,
  deckId,
  currentValue,
}: {
  edit: DeckDetail["pendingEdits"][number];
  deckId: string;
  currentValue: string;
}) {
  const qc = useQueryClient();
  const resolve = useMutation({
    mutationFn: (decision: "approve" | "reject") => api.resolveEdit(edit.id, decision),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deck", deckId] }),
  });
  // The prompt moved on since this was proposed (a human edited in between).
  // Approving would silently overwrite the newer text — block it and diff
  // against what's live, not the now-stale base the agent captured.
  const staleBase = edit.oldValue !== currentValue;
  return (
    <div className="rounded-lg border border-agent-soft bg-ink-1 p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-[11px]">
          <Chip tone={edit.author.kind === "agent" ? "agent" : "accent"}>
            {edit.author.kind === "agent" ? "agent" : "human"} · {edit.author.id}
          </Chip>
          <span className="text-fg-faint">proposes a prompt edit</span>
        </span>
        <span className="flex items-center gap-1">
          <Button
            variant="default"
            onClick={() => resolve.mutate("approve")}
            disabled={resolve.isPending || staleBase}
            title={staleBase ? "Base changed since proposed — reject and ask for a fresh proposal" : undefined}
          >
            <Check size={13} /> Approve
          </Button>
          <Button variant="danger" onClick={() => resolve.mutate("reject")} disabled={resolve.isPending}>
            <X size={13} /> Reject
          </Button>
        </span>
      </div>
      {edit.note && <p className="text-[11px] text-fg-dim mb-1.5 leading-snug">“{edit.note}”</p>}
      {staleBase && (
        <p className="flex items-center gap-1 text-[10px] text-warn mb-1.5">
          <AlertTriangle size={11} /> The slide prompt changed since this was proposed — approving is disabled.
        </p>
      )}
      <DiffView oldText={currentValue} newText={edit.newValue} />
    </div>
  );
}
