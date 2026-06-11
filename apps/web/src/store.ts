import { create } from "zustand";
import type { Quality } from "@substrate/contracts";

/** Editor-local UI state (PRD §9 — Zustand for editor state). */
interface EditorState {
  activeDeckId: string | null;
  activeSlideId: string | null;
  mcpClients: number;
  /** Live WS link health — false while the socket is down/reconnecting. */
  wsConnected: boolean;
  quality: Quality;
  showHistory: boolean;
  showDesignEditor: boolean;
  paletteOpen: boolean;
  connectOpen: boolean;
  settingsOpen: boolean;
  /** A transient banner message (e.g. an agent build that failed) — dismissible. */
  notice: string | null;

  setActiveDeck: (id: string | null) => void;
  setActiveSlide: (id: string | null) => void;
  setMcpClients: (n: number) => void;
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
}

export const useEditor = create<EditorState>((set) => ({
  activeDeckId: null,
  activeSlideId: null,
  mcpClients: 0,
  wsConnected: true,
  quality: "instant",
  showHistory: false,
  showDesignEditor: false,
  paletteOpen: false,
  connectOpen: false,
  settingsOpen: false,
  notice: null,

  setActiveDeck: (id) => set({ activeDeckId: id, activeSlideId: null }),
  setActiveSlide: (id) => set({ activeSlideId: id, showHistory: false }),
  setMcpClients: (n) => set({ mcpClients: n }),
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
}));
