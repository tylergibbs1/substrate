import { create } from "zustand";
import type { Quality } from "@substrate/contracts";

/** One narrated step of an in-app agent run, streamed live to the Assistant feed. */
export interface AgentStep {
  id: string;
  label: string;
  detail: string | null;
}

/** Editor-local UI state (PRD §9 — Zustand for editor state). */
interface EditorState {
  activeDeckId: string | null;
  activeSlideId: string | null;
  mcpClients: number;
  /** The deck an MCP agent is actively driving right now (+ its name), or null
   *  when no agent is working. Drives the "an agent is at the controls" UI. */
  agentActivity: { deckId: string; agent: string } | null;
  /** Live narration of the in-app agent's steps for one deck — what it's doing as
   *  it builds/revises (set the title, added a slide "…", read a file, …). */
  agentSteps: { deckId: string; steps: AgentStep[] } | null;
  /** The deck an in-app agent run (build/revise) is in flight on — brackets the
   *  whole run, so "working" state + the feed don't ride the debounced edge. */
  agentRun: { deckId: string } | null;
  /** Live WS link health — false while the socket is down/reconnecting. */
  wsConnected: boolean;
  /** Editor center view: the single focused slide, or an overview grid of every
   *  slide (to see the whole deck at once and police cross-slide consistency). */
  editorView: "canvas" | "grid";
  /** Fullscreen present/slideshow mode for the active deck. */
  presenting: boolean;
  quality: Quality;
  showHistory: boolean;
  showDesignEditor: boolean;
  paletteOpen: boolean;
  connectOpen: boolean;
  settingsOpen: boolean;
  /** A transient banner message (e.g. an agent build that failed) — dismissible. */
  notice: string | null;
  /** Contextual key prompt: opened at the moment an action needs the OpenAI key
   *  (Create/Build/render), with a reason and an optional action to run once a
   *  key is saved (so the create the user attempted just proceeds). null = closed. */
  keyPrompt: { reason: string; onSaved?: () => void } | null;

  setActiveDeck: (id: string | null) => void;
  setActiveSlide: (id: string | null) => void;
  setEditorView: (v: "canvas" | "grid") => void;
  setPresenting: (on: boolean) => void;
  setMcpClients: (n: number) => void;
  setAgentActivity: (a: { deckId: string; agent: string } | null) => void;
  setAgentRun: (run: { deckId: string } | null) => void;
  /** Reset the live step feed for a fresh agent session on a deck. */
  startAgentSteps: (deckId: string) => void;
  /** Append one narrated step (capped) to the live feed for a deck. */
  pushAgentStep: (deckId: string, label: string, detail: string | null) => void;
  setWsConnected: (on: boolean) => void;
  setQuality: (q: Quality) => void;
  setThinking: (on: boolean) => void;
  toggleHistory: () => void;
  setShowDesignEditor: (on: boolean) => void;
  setPaletteOpen: (on: boolean) => void;
  togglePalette: () => void;
  setConnectOpen: (on: boolean) => void;
  setSettingsOpen: (on: boolean) => void;
  setNotice: (message: string | null) => void;
  setKeyPrompt: (p: { reason: string; onSaved?: () => void } | null) => void;
}

export const useEditor = create<EditorState>((set) => ({
  activeDeckId: null,
  activeSlideId: null,
  mcpClients: 0,
  agentActivity: null,
  agentSteps: null,
  agentRun: null,
  wsConnected: true,
  editorView: "canvas",
  presenting: false,
  quality: "instant",
  showHistory: false,
  showDesignEditor: false,
  paletteOpen: false,
  connectOpen: false,
  settingsOpen: false,
  notice: null,
  keyPrompt: null,

  setActiveDeck: (id) => set({ activeDeckId: id, activeSlideId: null, editorView: "canvas", presenting: false }),
  setActiveSlide: (id) => set({ activeSlideId: id, showHistory: false }),
  setEditorView: (v) => set({ editorView: v }),
  setPresenting: (on) => set({ presenting: on }),
  setMcpClients: (n) => set({ mcpClients: n }),
  setAgentActivity: (a) => set({ agentActivity: a }),
  setAgentRun: (run) => set({ agentRun: run }),
  startAgentSteps: (deckId) => set({ agentSteps: { deckId, steps: [] } }),
  pushAgentStep: (deckId, label, detail) =>
    set((s) => {
      const prior = s.agentSteps && s.agentSteps.deckId === deckId ? s.agentSteps.steps : [];
      const step: AgentStep = { id: crypto.randomUUID(), label, detail };
      return { agentSteps: { deckId, steps: [...prior, step].slice(-60) } };
    }),
  setWsConnected: (on) => set({ wsConnected: on }),
  setQuality: (q) => set({ quality: q }),
  // `thinking` is derived from quality, never stored — one source of truth.
  setThinking: (on) => set({ quality: on ? "thinking" : "instant" }),
  toggleHistory: () => set((s) => ({ showHistory: !s.showHistory })),
  setShowDesignEditor: (on) => set({ showDesignEditor: on }),
  setPaletteOpen: (on) => set({ paletteOpen: on }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setConnectOpen: (on) => set({ connectOpen: on }),
  setSettingsOpen: (on) => set({ settingsOpen: on }),
  setNotice: (message) => set({ notice: message }),
  setKeyPrompt: (p) => set({ keyPrompt: p }),
}));
