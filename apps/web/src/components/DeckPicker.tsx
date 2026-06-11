import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight, Loader2, Wand2, KeyRound, Sparkles } from "lucide-react";
import { api } from "../lib/api.js";
import { useEditor } from "../store.js";
import { Button, cx } from "../ui.js";
import { Wordmark } from "./Mark.js";
import type { AspectRatio } from "@substrate/contracts";

/**
 * Home / first run. A new deck starts by selecting a design (PRD §6.1), with
 * Apple-style pre-selected — one strong default, presets-as-onboarding (§7.5).
 */
export function DeckPicker() {
  const qc = useQueryClient();
  const setActiveDeck = useEditor((s) => s.setActiveDeck);
  const setSettingsOpen = useEditor((s) => s.setSettingsOpen);

  const presets = useQuery({ queryKey: ["presets"], queryFn: api.presets });
  const decks = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const status = useQuery({ queryKey: ["status"], queryFn: api.status });

  const [presetId, setPresetId] = useState("apple");
  const [customStyle, setCustomStyle] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [notice, setNotice] = useState<string | null>(null);
  const isCustom = presetId === "custom";

  const create = useMutation({
    mutationFn: () =>
      api.createDeck({
        title: title.trim() || topic.trim() || "Untitled deck",
        aspectRatio: aspect,
        designPresetId: isCustom ? undefined : presetId,
        designPrompt: isCustom ? customStyle.trim() || undefined : undefined,
        outline: topic.trim() || undefined,
      }),
    onSuccess: ({ deckId, outlineFailed }) => {
      qc.invalidateQueries({ queryKey: ["decks"] });
      // Distinguish a failed outline from a deliberately empty deck: stay here
      // and surface it, rather than dropping the user into a silently empty deck.
      if (outlineFailed) {
        setNotice(
          "Couldn't outline that topic — the model was unreachable. Created an empty deck; open it below to add slides, or try again.",
        );
        return;
      }
      setActiveDeck(deckId);
    },
  });

  // Agentic path: an OpenAI agent fills a new deck from the description, and the
  // editor shows the slides appear/render live (over the same MCP the 3rd-party
  // agents use). We get the deck id back at once and drop the user straight in.
  const build = useMutation({
    mutationFn: () =>
      api.buildDeck({
        description: topic.trim() + (isCustom && customStyle.trim() ? `\n\nVisual style: ${customStyle.trim()}` : ""),
        aspectRatio: aspect,
        ...(isCustom ? {} : { designPresetId: presetId }),
      }),
    onSuccess: ({ deckId }) => {
      qc.invalidateQueries({ queryKey: ["decks"] });
      setActiveDeck(deckId);
    },
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 pt-[10vh] pb-16 grid gap-10">
        {/* Brand mark — quiet, centered above the work surface (§7.3 chrome recedes). */}
        <Wordmark size={30} className="mx-auto" />

        {/* New deck — the prompt is the artifact, so the prompt is the hero (PRD §1).
            Centered empty-state: name, the prompt, and its controls as one surface. */}
        <section className="grid gap-4">
          <h1 className="text-center text-3xl tracking-tight [letter-spacing:-0.03em]">
            What should we make?
          </h1>

          {/* First-run nudge: without a key, renders use the offline preview. */}
          {status.data?.usingMock && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="mx-auto flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-warn)_8%,transparent)] px-3 py-1.5 text-[11px] text-warn hover:brightness-110 transition"
            >
              <KeyRound size={12} />
              Using the offline preview renderer — add your OpenAI API key to render with GPT Image 2
            </button>
          )}

          {/* One bordered object — title, prompt, control bar — like a single input. */}
          <div className="rounded-xl border border-line bg-ink-2 focus-within:border-fg-faint transition-colors">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name your deck (optional)"
              aria-label="Deck title"
              className="w-full bg-transparent px-4 pt-3.5 pb-1 text-[13px] text-fg-dim placeholder:text-fg-faint outline-none"
            />
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Describe your deck — a topic, an audience, a goal. We outline it into ~12 slides and render each one."
              rows={3}
              aria-label="Deck topic"
              className="w-full bg-transparent px-4 pb-3 text-[15px] leading-relaxed text-fg placeholder:text-fg-faint outline-none resize-none"
            />
            <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
              <div className="flex items-center gap-0.5" role="group" aria-label="Aspect ratio">
                {(["16:9", "4:3", "1:1"] as AspectRatio[]).map((a) => (
                  <button type="button"
                    key={a}
                    onClick={() => setAspect(a)}
                    aria-pressed={aspect === a}
                    className={cx(
                      "rounded-full px-2.5 py-1 text-[11px] mono transition-colors",
                      aspect === a ? "bg-ink-3 text-fg" : "text-fg-faint hover:text-fg-dim",
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => build.mutate()}
                  disabled={!topic.trim() || build.isPending || create.isPending}
                  title="Let an OpenAI agent design and write every slide from your description"
                >
                  {build.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {build.isPending ? "Building…" : "Build with agent"}
                </Button>
                <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending || build.isPending}>
                  {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {create.isPending ? "Generating…" : "Generate"}
                </Button>
              </div>
            </div>
          </div>

          {/* Design — a quiet row of pills under the prompt; Custom reveals a field. */}
          {/* No row-gap: the reveal must collapse to a true 0 when closed. */}
          <div className="grid">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mono text-[10px] uppercase tracking-wider text-fg-faint mr-1">Design</span>
              {presets.data?.map((p) => (
                <button type="button"
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  title={p.description}
                  aria-pressed={presetId === p.id}
                  className={cx(
                    "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                    presetId === p.id
                      ? "border-accent text-fg bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
                      : "border-line text-fg-dim hover:border-line-2 hover:text-fg",
                  )}
                >
                  {p.name}
                </button>
              ))}
              <button type="button"
                onClick={() => setPresetId("custom")}
                aria-pressed={isCustom}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  isCustom
                    ? "border-accent text-fg bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
                    : "border-dashed border-line-2 text-fg-dim hover:border-fg-faint hover:text-fg",
                )}
              >
                <Wand2 size={12} className="text-fg-faint" /> Custom
              </button>
            </div>

            {/* Reveal the custom-style field by animating max-height so content below
                slides instead of snapping (§5/§6). overflow-hidden + max-h-0 → true 0;
                the nested pt-2 carries open-state spacing so closed stays pixel-clean. */}
            <div
              className={cx(
                "overflow-hidden transition-[max-height,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                isCustom ? "max-h-40 opacity-100" : "max-h-0 opacity-0",
              )}
              aria-hidden={!isCustom}
            >
              <div className="pt-2">
                <textarea
                  value={customStyle}
                  aria-label="Custom design style"
                  onChange={(e) => setCustomStyle(e.target.value)}
                  rows={3}
                  tabIndex={isCustom ? 0 : -1}
                  placeholder="e.g. Bold Swiss design — huge Helvetica headlines, red and black on white, hard grid, lots of negative space, no gradients."
                  className="w-full bg-ink-3 border border-line-2 rounded-lg px-3 py-2 outline-none focus:border-accent resize-none leading-relaxed text-[12px]"
                />
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-fg-faint">
            Leave the prompt empty to start with a blank deck.
          </p>
          {create.isError && (
            <div className="text-center text-danger text-xs">{(create.error as Error).message}</div>
          )}
          {notice && <div className="text-center text-warn text-xs">{notice}</div>}
        </section>

        {/* Existing decks */}
        {decks.data && decks.data.length > 0 && (
          <section className="grid gap-2">
            <div className="mono text-[10px] uppercase tracking-wider text-fg-faint">Your decks</div>
            <div className="grid gap-1.5">
              {decks.data.map((d) => (
                <button type="button"
                  key={d.id}
                  onClick={() => setActiveDeck(d.id)}
                  className="group flex items-center justify-between rounded-lg border border-line bg-ink-2 px-3 py-2.5 hover:border-line-2 transition-colors text-left"
                >
                  <div>
                    <div>{d.title}</div>
                    <div className="text-[11px] text-fg-faint mono">{d.slideCount} slides</div>
                  </div>
                  <ArrowRight
                    size={15}
                    className="text-fg-faint group-hover:text-accent transition-colors"
                  />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
