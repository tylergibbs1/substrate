import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Plug, X, AlertTriangle, Loader2, CheckCircle2, WifiOff, KeyRound } from "lucide-react";
import { api } from "../lib/api.js";
import { useEditor } from "../store.js";
import { Button, Chip, Eyebrow, IconButton } from "../ui.js";
import type { DeckDetail } from "@substrate/contracts";

/**
 * Deck bar (PRD §8): the active main design prompt lives here because it is
 * deck-wide, not per-slide. Editing it re-renders every slide — the most
 * expensive interaction — so we warn and show the cost before committing (§13).
 *
 * It also carries the live job + MCP status, so the editor has a single quiet
 * status rail at the bottom rather than two competing rules (§7.3).
 */
export function DeckBar({ detail }: { detail: DeckDetail }) {
  const qc = useQueryClient();
  const mcpClients = useEditor((s) => s.mcpClients);
  const wsConnected = useEditor((s) => s.wsConnected);
  const setConnectOpen = useEditor((s) => s.setConnectOpen);
  const setSettingsOpen = useEditor((s) => s.setSettingsOpen);
  const showEditor = useEditor((s) => s.showDesignEditor);
  const setShowEditor = useEditor((s) => s.setShowDesignEditor);
  const [draft, setDraft] = useState(detail.deck.mainDesignPrompt);

  // Adaptive polling: the WS channel is the live path, so only fall back to a
  // fast poll while jobs are actually in flight; otherwise stop (one adaptive
  // loop instead of two fixed ones racing).
  const status = useQuery({
    queryKey: ["status"],
    queryFn: api.status,
    refetchInterval: (q) => {
      const j = q.state.data?.jobs;
      const inFlight = j ? j.rendering + j.thinking + j.queued : 0;
      return inFlight > 0 ? 1500 : false;
    },
  });
  const jobs = status.data?.jobs ?? { rendering: 0, thinking: 0, queued: 0 };
  const active = jobs.rendering + jobs.thinking + jobs.queued;

  const save = useMutation({
    mutationFn: () => api.setDesignPrompt(detail.deck.id, draft, "direct"),
    onSuccess: () => {
      setShowEditor(false);
      qc.invalidateQueries({ queryKey: ["deck", detail.deck.id] });
    },
  });

  const dirty = draft !== detail.deck.mainDesignPrompt;

  return (
    <>
      {showEditor && (
        <div className="shrink-0 border-t border-line bg-ink-1 p-3">
          <div className="flex items-center justify-between mb-2">
            <Eyebrow>Main design prompt · injected ahead of every slide</Eyebrow>
            <IconButton label="Close design prompt editor" onClick={() => setShowEditor(false)} className="-m-1">
              <X size={14} />
            </IconButton>
          </div>
          <textarea
            value={draft}
            aria-label="Main design prompt"
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={5}
            className="w-full bg-ink-3 mono text-[12px] leading-relaxed text-fg px-3 py-2.5 outline-none resize-none rounded-lg border border-line focus:border-accent"
          />
          <div className="flex items-center gap-3 mt-2">
            <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Apply & re-render {detail.slides.length} slides
            </Button>
            <span className="text-[11px] text-warn flex items-center gap-1">
              <AlertTriangle size={12} /> This regenerates the whole deck and invalidates its cache.
            </span>
          </div>
        </div>
      )}

      <footer className="shrink-0 flex items-center justify-between gap-4 px-3 h-9 border-t border-line bg-ink-1">
        <button type="button"
          onClick={() => {
            setDraft(detail.deck.mainDesignPrompt);
            setShowEditor(!showEditor);
          }}
          className="group flex items-center gap-2 min-w-0 text-left"
          title="Edit the deck's main design prompt"
        >
          <Palette size={13} className="text-fg-faint group-hover:text-accent shrink-0" />
          <Chip className="capitalize shrink-0">
            {detail.deck.designPresetId}
          </Chip>
          <span className="truncate mono text-[10px] uppercase tracking-wider text-fg-faint/70 group-hover:text-fg-faint">
            design · injected ahead of every slide
          </span>
        </button>

        {/* Quiet status rail — one line, chrome that recedes (§7.3). */}
        <div className="flex items-center gap-3 shrink-0 mono text-[10px] text-fg-faint">
          {!wsConnected && (
            <>
              <span className="inline-flex items-center gap-1 text-warn" title="Lost the live connection — retrying">
                <WifiOff size={11} /> reconnecting…
              </span>
              <span className="text-line-2">·</span>
            </>
          )}
          {active === 0 ? (
            <span className="inline-flex items-center gap-1 text-ok">
              <CheckCircle2 size={11} /> idle
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-busy">
              <Loader2 size={11} className="animate-spin" />
              {jobs.rendering + jobs.thinking} rendering{jobs.queued > 0 ? ` · ${jobs.queued} queued` : ""}
            </span>
          )}
          <span className="text-line-2">·</span>
          <button type="button" onClick={() => setConnectOpen(true)} title="Connect an agent over MCP" className="transition-opacity hover:opacity-80">
            <Chip tone={mcpClients > 0 ? "ok" : "neutral"}>
              <Plug size={10} /> MCP {mcpClients} · connect
            </Chip>
          </button>
          <span className="text-line-2">·</span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings — set your OpenAI API key"
            className="transition-opacity hover:opacity-80"
          >
            <Chip tone={status.data && !status.data.usingMock ? "ok" : "warn"}>
              <KeyRound size={10} /> {status.data && !status.data.usingMock ? "GPT Image 2" : "preview"}
            </Chip>
          </button>
        </div>
      </footer>
    </>
  );
}
