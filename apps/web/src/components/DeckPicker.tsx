import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight, Loader2, Wand2, KeyRound, Sparkles, FileCode2, Settings, Plug, FolderOpen, X } from "lucide-react";
import { api } from "../lib/api.js";
import { useEditor } from "../store.js";
import { Button, cx } from "../ui.js";
import { Wordmark } from "./Mark.js";
import type { AspectRatio } from "@substrate/contracts";

// In the desktop shell, the preload bridge exposes a native folder/file picker.
// In the dev browser it's absent, and we fall back to a typed path.
declare global {
  interface Window {
    substrate?: {
      pickPath?: (opts?: { directory?: boolean }) => Promise<string[] | string | null>;
      saveExport?: (payload: {
        suggestedName: string;
        files: Array<{ name: string; data: Uint8Array }>;
      }) => Promise<string | null>;
    };
  }
}

/**
 * Home / first run. A new deck starts by selecting a design (PRD §6.1), with
 * Apple-style pre-selected — one strong default, presets-as-onboarding (§7.5).
 */
export function DeckPicker() {
  const qc = useQueryClient();
  const setActiveDeck = useEditor((s) => s.setActiveDeck);
  const setSettingsOpen = useEditor((s) => s.setSettingsOpen);
  const setConnectOpen = useEditor((s) => s.setConnectOpen);
  const setKeyPrompt = useEditor((s) => s.setKeyPrompt);

  const presets = useQuery({ queryKey: ["presets"], queryFn: api.presets });
  const decks = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const status = useQuery({ queryKey: ["status"], queryFn: api.status });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });

  const [presetId, setPresetId] = useState("apple");
  const [customStyle, setCustomStyle] = useState("");
  const [mdSlug, setMdSlug] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [useAgent, setUseAgent] = useState(false);
  const [contextPaths, setContextPaths] = useState<string[]>([]);
  const [manualContext, setManualContext] = useState(false);
  const [manualDraft, setManualDraft] = useState("");

  const addPaths = (paths: string[]) =>
    setContextPaths((prev) => [...prev, ...paths.map((p) => p.trim()).filter((p) => p && !prev.includes(p))]);
  const removePath = (p: string) => setContextPaths((prev) => prev.filter((x) => x !== p));

  // Native folder/file picker in the desktop shell (multi-select); typed-path in the browser.
  const pickContext = async () => {
    const picker = window.substrate?.pickPath;
    if (picker) {
      const picked = await picker({ directory: true });
      if (picked) addPaths(Array.isArray(picked) ? picked : [picked]);
    } else {
      setManualContext(true);
    }
  };
  const isCustom = presetId === "custom";
  const isDesignMd = presetId === "designmd";
  const registry = useQuery({ queryKey: ["designRegistry"], queryFn: api.designRegistry, enabled: isDesignMd, staleTime: Infinity });

  // The chosen design as a main design prompt: a preset is referenced by id, a
  // Custom style is its raw text, and a DESIGN.md is compiled by the server.
  const resolveDesignPrompt = async (): Promise<string | undefined> => {
    if (isCustom) return customStyle.trim() || undefined;
    if (isDesignMd && mdSlug) return (await api.compileDesign(mdSlug)).designPrompt;
    return undefined;
  };

  // No-agent path: create a BLANK deck (no auto-outline) and drop the user in to
  // build it slide by slide themselves. The agent toggle is the whole line:
  // off = you build it, on = the agent builds it.
  const create = useMutation({
    mutationFn: async () =>
      api.createDeck({
        title: title.trim() || "Untitled deck",
        aspectRatio: aspect,
        designPresetId: isCustom || isDesignMd ? undefined : presetId,
        designPrompt: await resolveDesignPrompt(),
      }),
    onSuccess: ({ deckId }) => {
      qc.invalidateQueries({ queryKey: ["decks"] });
      setActiveDeck(deckId);
    },
  });

  // Agentic path: the agent (Claude by default) fills a new deck from the
  // description, and the editor shows slides appear/render live (over the same MCP the 3rd-party
  // agents use). We get the deck id back at once and drop the user straight in.
  const build = useMutation({
    mutationFn: async () => {
      const designPrompt = await resolveDesignPrompt();
      return api.buildDeck({
        description: topic.trim(),
        aspectRatio: aspect,
        ...(isCustom || isDesignMd ? {} : { designPresetId: presetId }),
        ...(designPrompt ? { designPrompt } : {}),
        ...(contextPaths.length ? { contextPaths } : {}),
      });
    },
    onSuccess: ({ deckId }) => {
      qc.invalidateQueries({ queryKey: ["decks"] });
      setActiveDeck(deckId);
    },
  });

  return (
    <div className="relative flex-1 overflow-auto">
      {/* Top-right utilities, reachable before opening a deck. "Use your own agent"
          surfaces the BYO-agent path (connect a tool you already pay for over MCP),
          and the gear opens Settings (keys + agent provider/model). Quiet (§7.3). */}
      <div className="absolute top-3 right-4 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          title="Already have Claude Code, Codex, or another MCP agent you pay for? Connect it to build decks over MCP."
          className="inline-flex items-center gap-1.5 rounded-full h-8 px-2.5 text-[12px] text-fg-faint hover:text-fg hover:bg-ink-2 transition-colors"
        >
          <Plug size={14} /> Use your own agent
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
          className="grid place-items-center w-8 h-8 rounded-full text-fg-faint hover:text-fg hover:bg-ink-2 transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>
      <div className="max-w-2xl mx-auto px-6 pt-[10vh] pb-16 grid gap-12">
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
              className="mx-auto flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-warn)_8%,transparent)] px-3 py-1.5 text-[11px] text-warn hover:brightness-110 transition-[filter]"
            >
              <KeyRound size={12} />
              Using the offline preview renderer — add your OpenAI API key to render with GPT Image 2
            </button>
          )}

          {/* One bordered object — title, prompt, control bar — like a single input. */}
          <div className="rounded-lg border border-line bg-ink-2 focus-within:border-fg-faint transition-colors">
            {/* Title + body keep a constant height across modes so toggling the
                agent doesn't shift the footer and everything below it. */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={useAgent ? "Name your deck (optional)" : "Name your deck"}
              aria-label="Deck title"
              className="w-full bg-transparent px-4 pt-3.5 pb-1 text-[14px] text-fg placeholder:text-fg-faint outline-none"
            />
            <div className="min-h-[90px]">
              {useAgent ? (
                <>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Describe your deck — a topic, an audience, a goal. An agent designs the look and writes every slide."
                    rows={3}
                    aria-label="Deck topic"
                    className="w-full bg-transparent px-4 pb-1 text-[15px] leading-relaxed text-fg placeholder:text-fg-faint outline-none resize-none"
                  />
                  {/* Optional file context — point the agent at a folder or file so it
                      grounds the deck in your real material (read-only, sandboxed). */}
                  <div className="px-4 pb-2.5 space-y-1.5">
                    {/* One chip per attached folder/file; the agent reads them all. */}
                    {contextPaths.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {contextPaths.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center gap-1.5 max-w-full rounded-full bg-ink-3 border border-line px-2 py-0.5 text-[11px] text-fg-dim"
                          >
                            <FolderOpen size={11} className="text-accent shrink-0" />
                            <span className="mono truncate" title={p}>{p.split("/").pop() || p}</span>
                            <button type="button" onClick={() => removePath(p)} className="text-fg-faint hover:text-fg shrink-0" aria-label={`Remove ${p}`}>
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {manualContext ? (
                      <div className="flex items-center gap-1.5">
                        <FolderOpen size={12} className="text-fg-faint shrink-0" />
                        <input
                          autoFocus
                          value={manualDraft}
                          onChange={(e) => setManualDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && manualDraft.trim()) {
                              addPaths([manualDraft]);
                              setManualDraft("");
                            }
                            if (e.key === "Escape") {
                              setManualContext(false);
                              setManualDraft("");
                            }
                          }}
                          placeholder="/path/to/a/folder or file, then Enter"
                          aria-label="Context path"
                          className="flex-1 bg-ink-3 border border-line rounded-lg px-2 py-1 text-[11px] mono outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setManualContext(false);
                            setManualDraft("");
                          }}
                          className="text-fg-faint hover:text-fg shrink-0"
                          aria-label="Done adding paths"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={pickContext} className="inline-flex items-center gap-1.5 text-[11px] text-fg-faint hover:text-fg transition-colors">
                        <FolderOpen size={12} />{" "}
                        {contextPaths.length ? "Add another folder or file" : "Add context — point the agent at folders or files"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="px-4 pt-1.5 pb-3 text-[12.5px] leading-relaxed text-fg-faint">
                  You'll start with a blank deck — add and write each slide yourself. Turn on the agent to have one built for you.
                </p>
              )}
            </div>
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
                {/* Opt into the agent: off = a blank deck you build yourself,
                    on = the agent designs and writes every slide. */}
                <button
                  type="button"
                  onClick={() => setUseAgent((v) => !v)}
                  aria-pressed={useAgent}
                  title="Have the agent design and write every slide for you (instead of building it yourself)"
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                    useAgent
                      ? "border-accent text-fg bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
                      : "border-line text-fg-faint hover:text-fg-dim hover:border-line-2",
                  )}
                >
                  <Sparkles size={12} className={useAgent ? "text-accent" : "text-fg-faint"} /> agent
                </button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const go = () => (useAgent ? build : create).mutate();
                    // No key yet → ask in context, then resume this exact action.
                    if (settings.data && !settings.data.hasKey) {
                      setKeyPrompt({
                        reason: useAgent
                          ? "Substrate renders every slide with GPT Image 2. Add your OpenAI key and the agent starts building this deck."
                          : "Substrate renders every slide with GPT Image 2. Add your OpenAI key to create this deck.",
                        onSaved: go,
                      });
                    } else {
                      go();
                    }
                  }}
                  disabled={!settings.data || create.isPending || build.isPending || (useAgent && !topic.trim()) || (isDesignMd && !mdSlug)}
                  title={useAgent ? "An agent designs and writes every slide from your description" : "Create a blank deck and build the slides yourself"}
                  className="min-w-[148px] justify-center"
                >
                  {create.isPending || build.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : useAgent ? (
                    <Sparkles size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                  {build.isPending
                    ? "Building…"
                    : create.isPending
                      ? "Creating…"
                      : useAgent
                        ? "Build with agent"
                        : "Create deck"}
                </Button>
              </div>
            </div>
          </div>

          {/* Design — two labeled groups: curated presets, and bring-your-own. */}
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mono text-[10px] uppercase tracking-wider text-fg-faint w-[66px] shrink-0">Presets</span>
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
            </div>

            {/* Bring your own — Custom or a DESIGN.md; each reveals a field below.
                No row-gap in this subgroup so those reveals collapse to a true 0. */}
            <div className="grid">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mono text-[10px] uppercase tracking-wider text-fg-faint w-[66px] shrink-0">Your own</span>
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
                <button type="button"
                  onClick={() => setPresetId("designmd")}
                  aria-pressed={isDesignMd}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                    isDesignMd
                      ? "border-accent text-fg bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)]"
                      : "border-dashed border-line-2 text-fg-dim hover:border-fg-faint hover:text-fg",
                  )}
                >
                  <FileCode2 size={12} className="text-fg-faint" /> DESIGN.md
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

            {/* Import a DESIGN.md (paste, or a getdesign.md link) — compiled server-side. */}
            <div
              className={cx(
                "overflow-hidden transition-[max-height,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                isDesignMd ? "max-h-52 opacity-100" : "max-h-0 opacity-0",
              )}
              aria-hidden={!isDesignMd}
            >
              <div className="pt-2 grid gap-1.5">
                <select
                  value={mdSlug}
                  onChange={(e) => setMdSlug(e.target.value)}
                  aria-label="Choose a design from getdesign.md"
                  tabIndex={isDesignMd ? 0 : -1}
                  className="w-full bg-ink-3 border border-line-2 rounded-lg px-3 py-2 outline-none focus:border-accent text-[12px] text-fg"
                >
                  <option value="">
                    {registry.isLoading ? "Loading designs…" : `Choose from getdesign.md (${registry.data?.length ?? 0})…`}
                  </option>
                  {registry.data?.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-fg-faint">
                  Compiled into this deck's design — the image model approximates the look (palette, type, mood), not exact tokens.
                </span>
              </div>
            </div>
            </div>
          </div>

          {(create.isError || build.isError) && (
            <div className="text-center text-danger text-xs">
              {((create.error ?? build.error) as Error | null)?.message}
            </div>
          )}
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
