import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowUp, Check, AlertCircle } from "lucide-react";
import { api } from "../lib/api.js";
import { Button } from "../ui.js";
import type { DeckDetail } from "@substrate/contracts";

/**
 * The Assistant — talk to the deck-building agent after the deck is made to fix or
 * tweak things. It edits slides through the same tools/review flow, so changes
 * stream into the editor live (and land as proposals in review mode). This panel is
 * the control surface: a composer plus a log of what the agent did.
 */
interface Run {
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

  const revise = useMutation({
    mutationFn: (instruction: string) => api.reviseDeck(detail.deck.id, instruction),
    onMutate: (instruction) => {
      setRuns((r) => [...r, { instruction, status: "running", actions: [] }]);
    },
    onSuccess: (out) => {
      setRuns((r) =>
        r.map((run, i) => (i === r.length - 1 ? { ...run, status: "done", actions: out.actions, text: out.text } : run)),
      );
      qc.invalidateQueries({ queryKey: ["deck", detail.deck.id] });
    },
    onError: (e) => {
      setRuns((r) =>
        r.map((run, i) => (i === r.length - 1 ? { ...run, status: "error", error: (e as Error).message } : run)),
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
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {runs.length === 0 && (
          <p className="text-[12px] text-fg-faint leading-relaxed">
            Ask the agent to revise this deck — e.g. “make the title bolder”, “add a pricing slide before the close”,
            “tighten every headline to under 6 words”. It edits the slides directly; turn on Review to approve each change.
          </p>
        )}
        {runs.map((run, i) => (
          <div key={i} className="space-y-1.5">
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
            <Button variant="primary" onClick={send} disabled={!input.trim() || revise.isPending}>
              {revise.isPending ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
