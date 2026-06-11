import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api.js";
import { useServerEvents } from "./lib/ws.js";
import { useEditor } from "./store.js";
import { DeckPicker } from "./components/DeckPicker.js";
import { Editor } from "./components/Editor.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { ConnectAgent } from "./components/ConnectAgent.js";
import { Settings } from "./components/Settings.js";
import { KeyPrompt } from "./components/KeyPrompt.js";

export default function App() {
  const activeDeckId = useEditor((s) => s.activeDeckId);
  const setActiveDeck = useEditor((s) => s.setActiveDeck);
  const setMcpClients = useEditor((s) => s.setMcpClients);
  const togglePalette = useEditor((s) => s.togglePalette);
  const notice = useEditor((s) => s.notice);
  const setNotice = useEditor((s) => s.setNotice);
  const agentActivity = useEditor((s) => s.agentActivity);
  useServerEvents(activeDeckId, setMcpClients);

  // Follow a 3rd-party agent: when one starts driving a deck you're not viewing
  // (e.g. Claude Code over MCP just created one), jump to its canvas so you watch
  // the build live. Fires once per agent session — it won't yank you back if you
  // navigate away afterward.
  // Auto-open each deck an agent drives the FIRST time we ever see it — tracked in
  // a persistent Set so an idle gap (presence cycles active→idle→active mid-run)
  // never re-fires the navigation and yanks the user back somewhere they left.
  const followedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const id = agentActivity?.deckId;
    if (!id || followedRef.current.has(id)) return;
    followedRef.current.add(id);
    if (id !== activeDeckId) setActiveDeck(id);
  }, [agentActivity?.deckId, activeDeckId, setActiveDeck]);

  // ⌘K / Ctrl+K opens the command palette anywhere (keyboard-primary input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePalette]);

  // Surface a connection error gently rather than a blank screen.
  const status = useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 5000 });

  // Demo-first onboarding: a brand-new user (no key set) lands on the seeded demo
  // deck — a finished, real example — BEFORE being asked for anything. The key is
  // requested contextually (KeyPrompt) only when they act. Fires once, and never
  // for a returning user who has a key (they land on the picker as before).
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const decks = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const demoOpenedRef = useRef(false);
  useEffect(() => {
    if (demoOpenedRef.current || settings.data === undefined || decks.data === undefined) return;
    demoOpenedRef.current = true;
    if (!settings.data.hasKey && !activeDeckId) {
      const demo = decks.data.find((d) => d.id === "deck-demo");
      if (demo) setActiveDeck(demo.id);
    }
  }, [settings.data, decks.data, activeDeckId, setActiveDeck]);

  return (
    <div className="h-screen w-screen flex flex-col bg-ink-0 text-fg overflow-hidden">
      {status.isError && (
        <div className="shrink-0 bg-[color-mix(in_oklab,var(--color-danger)_14%,transparent)] text-danger text-xs px-4 py-1.5 border-b border-line">
          Can't reach the Substrate server on :4321. Run <span className="mono">pnpm dev:server</span> in another terminal.
        </div>
      )}
      {notice && (
        <div className="shrink-0 flex items-center gap-3 bg-[color-mix(in_oklab,var(--color-warn)_12%,transparent)] text-warn text-xs px-4 py-1.5 border-b border-line">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-warn/80 hover:text-warn" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {/* No hard gate: the app is browsable immediately (the demo deck opens for
          new users); the OpenAI key is asked for in context, when an action needs it. */}
      {activeDeckId ? <Editor deckId={activeDeckId} /> : <DeckPicker />}
      <CommandPalette />
      <ConnectAgent />
      <Settings />
      <KeyPrompt />
    </div>
  );
}
