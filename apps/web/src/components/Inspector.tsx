import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, History, RotateCcw, Zap, Brain } from "lucide-react";
import { api, blobUrl } from "../lib/api.js";
import { useEditor } from "../store.js";
import { Chip, cx, Eyebrow } from "../ui.js";
import type { DeckDetail, Slide } from "@substrate/contracts";

export function Inspector({ detail, slide }: { detail: DeckDetail; slide: Slide | null }) {
  const status = useQuery({ queryKey: ["status"], queryFn: api.status });
  const quality = useEditor((s) => s.quality);
  const setThinking = useEditor((s) => s.setThinking);
  const [advanced, setAdvanced] = useState(false);

  const preset = detail.deck.designPresetId;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-auto p-3 space-y-5">
        {/* Quality — machinery on demand (§7.4): a quiet segmented control, not
            two cards competing with the slide. */}
        <Section label="Quality">
          <div className="flex rounded-full border border-line-2 p-0.5 text-[11px]">
            <button type="button"
              onClick={() => setThinking(false)}
              className={cx(
                "flex-1 inline-flex items-center justify-center gap-1 rounded-full px-2 py-1 font-normal transition-colors",
                quality === "instant" ? "bg-fg text-on-primary" : "text-fg-dim hover:text-fg",
              )}
            >
              <Zap size={12} /> Instant
            </button>
            <button type="button"
              onClick={() => setThinking(true)}
              className={cx(
                "flex-1 inline-flex items-center justify-center gap-1 rounded-full px-2 py-1 font-normal transition-colors",
                quality === "thinking" ? "bg-fg text-on-primary" : "text-fg-dim hover:text-fg",
              )}
            >
              <Brain size={12} /> Thinking
            </button>
          </div>
          <p className="text-[10px] text-fg-faint">
            {quality === "instant" ? "Fast drafting, high-volume regeneration." : "Heavy text and multi-column layouts."}
          </p>
        </Section>

        {/* Design — the deck's visual system, edited at deck level (in the deck bar) */}
        <Section label="Design">
          <div className="rounded-lg border border-line bg-ink-2 p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-normal capitalize">{preset}</span>
              <Chip>deck-wide</Chip>
            </div>
            <p className="text-[10px] text-fg-faint">
              The main design prompt is injected ahead of every slide. Edit it in the deck bar below.
            </p>
          </div>
        </Section>

        {/* Slide meta */}
        {slide && (
          <Section label="Slide">
            <dl className="mono text-[11px] space-y-1 text-fg-dim">
              <Row k="id" v={slide.id} />
              <Row k="seed" v={String(slide.seed)} />
              <Row k="status" v={slide.jobStatus ?? "—"} />
            </dl>
          </Section>
        )}

        {/* Advanced — machinery on demand (§7.4) */}
        <div>
          <button type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="mono flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-faint hover:text-fg"
          >
            <ChevronRight size={12} className={cx("transition-transform duration-150", advanced && "rotate-90")} /> Advanced
          </button>
          {advanced && status.data && (
            <dl className="mono text-[11px] space-y-1 text-fg-dim mt-2 pl-1">
              <Row k="provider" v={status.data.provider} />
              <Row k="model" v={status.data.model} />
              <Row k="aspect" v={detail.deck.aspectRatio} />
              <Row k="concurrency" v={String(status.data.concurrency)} />
            </dl>
          )}
        </div>

        {/* History */}
        {slide && <HistorySection slide={slide} deckId={detail.deck.id} />}
      </div>
    </div>
  );
}

function HistorySection({ slide, deckId }: { slide: Slide; deckId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ["history", slide.id],
    queryFn: () => api.history(slide.id),
    enabled: open,
  });
  const pick = useMutation({
    mutationFn: (versionId: string) => api.pickVersion(slide.id, versionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deck", deckId] }),
  });

  return (
    <div>
      <button type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-faint hover:text-fg"
      >
        <ChevronRight size={12} className={cx("transition-transform duration-150", open && "rotate-90")} />
        <History size={11} /> History
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {history.data?.versions.length === 0 && (
            <p className="text-[10px] text-fg-faint">No renders yet.</p>
          )}
          {history.data?.versions.map((v) => (
            <div
              key={v.id}
              className="group flex items-center gap-2 rounded-lg border border-line bg-ink-2 p-1.5 hover:border-fg-faint"
            >
              {v.imageBlobRef ? (
                <img src={blobUrl(v.imageBlobRef)!} alt="" className="w-14 h-9 object-cover rounded-sm shrink-0" />
              ) : (
                <div className="w-14 h-9 bg-ink-3 rounded-sm shrink-0" />
              )}
              <div className="flex-1 min-w-0 mono text-[10px] text-fg-faint">
                <div className="flex gap-1.5">
                  <Chip tone={v.quality === "thinking" ? "agent" : "neutral"}>{v.quality}</Chip>
                  <span>seed {v.seed}</span>
                </div>
                {v.id === slide.currentVersionId ? (
                  <span className="text-ok">current</span>
                ) : (
                  <button type="button"
                    onClick={() => pick.mutate(v.id)}
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    <RotateCcw size={10} /> roll back
                  </button>
                )}
              </div>
            </div>
          ))}
          {history.data && history.data.substrates.length > 0 && (
            <div className="pt-2">
              <Eyebrow className="block mb-1">Prompt lineage</Eyebrow>
              {history.data.substrates.map((s) => (
                <div key={s.id} className="border-l border-line-2 pl-2 py-1 ml-1">
                  <Chip tone={s.author.kind === "agent" ? "agent" : "accent"}>
                    {s.author.kind} · {s.author.id}
                  </Chip>
                  <p className="text-[10px] text-fg-dim line-clamp-2 mt-0.5 mono">{s.prompt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Eyebrow className="block">{label}</Eyebrow>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-fg-faint">{k}</dt>
      <dd className="truncate max-w-[170px]" title={v}>
        {v}
      </dd>
    </div>
  );
}
