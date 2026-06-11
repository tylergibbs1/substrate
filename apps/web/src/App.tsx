import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api.js";
import { useServerEvents } from "./lib/ws.js";
import { useEditor } from "./store.js";
import { DeckPicker } from "./components/DeckPicker.js";
import { Editor } from "./components/Editor.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { ConnectAgent } from "./components/ConnectAgent.js";
import { Settings } from "./components/Settings.js";

export default function App() {
  const activeDeckId = useEditor((s) => s.activeDeckId);
  const setMcpClients = useEditor((s) => s.setMcpClients);
  const togglePalette = useEditor((s) => s.togglePalette);
  useServerEvents(activeDeckId, setMcpClients);

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

  return (
    <div className="h-screen w-screen flex flex-col bg-ink-0 text-fg overflow-hidden">
      {status.isError && (
        <div className="shrink-0 bg-[color-mix(in_oklab,var(--color-danger)_14%,transparent)] text-danger text-xs px-4 py-1.5 border-b border-line">
          Can't reach the Substrate server on :4321. Run <span className="mono">pnpm dev:server</span> in another terminal.
        </div>
      )}
      {activeDeckId ? <Editor deckId={activeDeckId} /> : <DeckPicker />}
      <CommandPalette />
      <ConnectAgent />
      <Settings />
    </div>
  );
}
