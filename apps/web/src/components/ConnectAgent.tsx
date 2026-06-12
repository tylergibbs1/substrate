import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, Plug } from "lucide-react";
import { api } from "../lib/api.js";
import { useEditor } from "../store.js";
import { cx, Eyebrow, Modal } from "../ui.js";

/**
 * "Connect an agent" — surfaces the local MCP endpoint + bearer token and a
 * ready-to-paste prompt so a human can drop it into any MCP client (Claude
 * Code/Desktop, Cursor, Codex) and have their agent co-edit this deck. Mirrors
 * mandrel's ConnectModal.
 */
function CopyBox({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for webview/Electron contexts where the async Clipboard API is blocked.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing else to try */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        <button
          type="button"
          onClick={copy}
          className={cx(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors",
            copied ? "text-ok" : "text-fg-faint hover:text-fg hover:bg-ink-3",
          )}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={cx(
          "mono text-[11px] leading-relaxed text-fg-dim bg-ink-0 border border-line rounded p-2.5 overflow-auto whitespace-pre-wrap break-words",
          multiline ? "max-h-48" : "",
        )}
      >
        {value}
      </pre>
    </div>
  );
}

export function ConnectAgent() {
  const open = useEditor((s) => s.connectOpen);
  const setOpen = useEditor((s) => s.setConnectOpen);
  const activeDeckId = useEditor((s) => s.activeDeckId);

  const status = useQuery({ queryKey: ["status"], queryFn: api.status, enabled: open });
  const deck = useQuery({ queryKey: ["deck", activeDeckId], queryFn: () => api.deck(activeDeckId!), enabled: open && !!activeDeckId });
  const [client, setClient] = useState<"claude-code" | "codex" | "other">("claude-code");

  const url = status.data?.mcpUrl ?? "http://localhost:4321/mcp";
  const token = status.data?.mcpToken ?? "<token>";
  const deckLine = deck.data ? ` Work on the deck titled "${deck.data.deck.title}" (deck_id ${deck.data.deck.id}).` : "";

  const prompt = `Connect to my Substrate MCP server and help me edit my slide deck.

- Endpoint (Streamable HTTP): ${url}
- Auth header: Authorization: Bearer ${token}

Substrate is a deck of AI-generated slides where the ONLY editable things are prompts — never pixels. Each slide has a prompt (its "substrate"); the deck has one main design prompt injected ahead of every slide.

Tools available: list_decks, list_design_presets, create_deck, get_deck, set_deck_title, set_design_prompt, set_design_from_md, add_slide, edit_slide_prompt, delete_slide, list_pending_edits, regenerate_slide, get_slide_render, get_history, reorder_slides, export_deck. Use mode "propose" to suggest edits for human approval, or "direct" to apply and re-render. Call get_slide_render to SEE a slide's rendered image and critique it before editing its prompt.${deckLine}

Start by calling get_deck to read the current slides and their prompts.`;

  const cli = `claude mcp add --transport http substrate ${url} \\\n  --header "Authorization: Bearer ${token}"`;

  // Codex supports Streamable HTTP MCP servers natively (no mcp-remote bridge) —
  // a `url` + a static Authorization header via `http_headers`.
  const codex = `# ~/.codex/config.toml\n[mcp_servers.substrate]\nurl = "${url}"\nhttp_headers = { "Authorization" = "Bearer ${token}" }`;

  // Generic HTTP MCP config (Claude Desktop, Cursor, and other MCP clients).
  const mcpJson = `{\n  "mcpServers": {\n    "substrate": {\n      "type": "http",\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${token}" }\n    }\n  }\n}`;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      icon={<Plug size={14} className="text-accent" />}
      title="Connect an agent"
    >
      <div className="p-4 space-y-4">
          <p className="text-[12px] text-fg-dim">
            Paste this prompt into your AI client — Claude Code, Codex, Cursor, Claude Desktop — to connect it and let it
            co-edit this deck over MCP.
          </p>
          <CopyBox label="Prompt — paste into your agent" value={prompt} multiline />

          {/* Pick your client and show only its setup — one config, not a wall. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Or register the server</Eyebrow>
              <div className="flex rounded-full border border-line p-0.5 text-[11px] shrink-0">
                {(
                  [
                    ["claude-code", "Claude Code"],
                    ["codex", "Codex"],
                    ["other", "Other"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setClient(id)}
                    aria-pressed={client === id}
                    className={cx(
                      "rounded-full px-2.5 py-0.5 transition-colors",
                      client === id ? "bg-fg text-on-primary" : "text-fg-dim hover:text-fg",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {client === "claude-code" && <CopyBox label="Terminal" value={cli} />}
            {client === "codex" && <CopyBox label="~/.codex/config.toml" value={codex} multiline />}
            {client === "other" && <CopyBox label="MCP config (Claude Desktop, Cursor, …)" value={mcpJson} multiline />}
          </div>

          <p className="text-[10px] text-fg-faint">
            Loopback only · token persists across restarts (<span className="mono">SUBSTRATE_MCP_TOKEN</span> to pin) ·
            agents edit prompts only, never pixels.
          </p>
        </div>
    </Modal>
  );
}
