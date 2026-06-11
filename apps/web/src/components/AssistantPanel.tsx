import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowUp, Check, AlertCircle } from "lucide-react";
import { api } from "../lib/api.js";
import { useEditor } from "../store.js";
import { Anthropic } from "./Anthropic.js";
import { OpenAI } from "./OpenAI.js";
import { Button } from "../ui.js";
import type { DeckDetail } from "@substrate/contracts";

/**
 * The Assistant — talk to the deck-building agent after the deck is made to fix or
 * tweak things. It edits slides through the same tools/review flow, so changes
 * stream into the editor live (and land as proposals in review mode). This panel is
 * the control surface: a composer plus a log of what the agent did.
 */
interface Run {
  id: string;
  instruction: string;
  status: "running" | "done" | "error";
  actions: ReadonlyArray<string>;
  text?: string;
  error?: string;
}

export function AssistantPanel({ detail }: { detail: DeckDetail }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);

  // Live narration of the in-app agent's run on THIS deck (build or revise).
  // "Working" is driven by the run bracket (agentRun), not the debounced activity
  // edge — so it holds through the agent's read-only exploration, not just writes.
  const agentStepsState = useEditor((s) => s.agentSteps);
  const agentRun = useEditor((s) => s.agentRun);
  const steps = agentStepsState?.deckId === detail.deck.id ? agentStepsState.steps : [];
  const agentLive = agentRun?.deckId === detail.deck.id;

  // Which model is actually driving the in-app agent (configured in Settings).
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const provider = settings.data?.agentProvider === "openai" ? "OpenAI" : "Anthropic";

  const revise = useMutation({
    mutationFn: (instruction: string) => api.reviseDeck(detail.deck.id, instruction),
    onMutate: (instruction) => {
      const id = crypto.randomUUID();
      setRuns((r) => [...r, { id, instruction, status: "running", actions: [] }]);
      return { id };
    },
    onSuccess: (out, _instruction, ctx) => {
      setRuns((r) =>
        r.map((run) => (run.id === ctx.id ? { ...run, status: "done", actions: out.actions, text: out.text } : run)),
      );
      qc.invalidateQueries({ queryKey: ["deck", detail.deck.id] });
    },
    onError: (e, _instruction, ctx) => {
      setRuns((r) =>
        r.map((run) => (run.id === ctx?.id ? { ...run, status: "error", error: (e as Error).message } : run)),
      );
    },
  });

  const send = () => {
    const v = input.trim();
    if (!v || revise.isPending) return;
    setInput("");
    revise.mutate(v);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Which model is at the controls — visible insight into the in-app agent. */}
      <div
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-line mono text-[10px] text-fg-faint"
        title={`The in-app agent runs on ${settings.data?.agentModel ?? "…"} via ${provider}. Change it in Settings.`}
      >
        {settings.data?.agentProvider === "openai" ? (
          <OpenAI className="w-3 h-3 shrink-0 text-fg-dim" />
        ) : (
          <Anthropic className="w-3 h-3 shrink-0 text-fg-dim" />
        )}
        <span className="text-fg-dim truncate">{settings.data?.agentModel ?? "—"}</span>
        <span className="text-fg-faint">· {provider}</span>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Live narration — what the agent is doing right now, streamed step by step. */}
        {(agentLive || steps.length > 0) && (
          <div className="rounded-lg border border-agent-soft bg-agent-wash p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 mono text-[10px] uppercase tracking-eyebrow text-agent">
              {agentLive ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {agentLive ? "Agent working" : "Agent finished"}
            </div>
            <ul className="space-y-1">
              {steps.map((s, i) => (
                <li key={s.id} className="flex items-center gap-1.5 text-[11px] text-fg-dim">
                  {agentLive && i === steps.length - 1 ? (
                    <Loader2 size={10} className="shrink-0 animate-spin text-agent" />
                  ) : (
                    <Check size={10} className="shrink-0 text-ok" />
                  )}
                  <span className="min-w-0 truncate leading-snug" title={s.detail ? `${s.label} — ${s.detail}` : s.label}>
                    <span className="text-fg">{s.label}</span>
                    {s.detail && <span className="text-fg-faint"> — {s.detail}</span>}
                  </span>
                </li>
              ))}
              {steps.length === 0 && agentLive && <li className="text-[11px] text-fg-faint">starting…</li>}
            </ul>
          </div>
        )}
        {runs.length === 0 && !agentLive && steps.length === 0 && (
          <p className="text-[12px] text-fg-faint leading-relaxed">
            Ask the agent to revise this deck — e.g. “make the title bolder”, “add a pricing slide before the close”,
            “tighten every headline to under 6 words”. It edits the slides directly; turn on Review to approve each change.
          </p>
        )}
        {runs.map((run) => (
          <div key={run.id} className="space-y-1.5">
            <div className="text-[12px] text-fg leading-snug">{run.instruction}</div>
            <div className="rounded-lg border border-line bg-ink-2 p-2 text-[11px]">
              {run.status === "running" && (
                <span className="inline-flex items-center gap-1.5 text-busy mono">
                  <Loader2 size={11} className="animate-spin" /> working…
                </span>
              )}
              {run.status === "error" && (
                <span className="inline-flex items-start gap-1.5 text-danger">
                  <AlertCircle size={11} className="mt-0.5 shrink-0" /> {run.error}
                </span>
              )}
              {run.status === "done" &&
                (run.actions.length > 0 ? (
                  <ul className="space-y-0.5 text-fg-dim">
                    {run.actions.map((a, j) => (
                      <li key={j} className="flex items-center gap-1.5">
                        <Check size={11} className="text-ok shrink-0" /> {a}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-fg-faint">{run.text || "No changes made."}</span>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-line p-2">
        <div className="rounded-lg border border-line-2 bg-ink-0 focus-within:border-accent transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            aria-label="Ask the agent to revise the deck"
            placeholder="Ask the agent to tweak the deck…"
            className="w-full bg-transparent px-2.5 py-2 text-[12px] leading-relaxed outline-none resize-none placeholder:text-fg-faint"
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <span className="mono text-[10px] text-fg-faint">⌘↵ to send</span>
            <Button variant="default" onClick={send} disabled={!input.trim() || revise.isPending}>
              {revise.isPending ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
