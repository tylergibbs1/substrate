import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Copy, Check, Plug } from "lucide-react";
import { api } from "../lib/api.js";
import { useEditor } from "../store.js";
import { cx, Eyebrow, IconButton } from "../ui.js";

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

  if (!open) return null;

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

  // Codex is stdio-only for MCP, so bridge the HTTP endpoint with mcp-remote.
  const codex = `# ~/.codex/config.toml\n[mcp_servers.substrate]\ncommand = "npx"\nargs = ["-y", "mcp-remote", "${url}", "--header", "Authorization: Bearer ${token}"]`;

  // Generic HTTP MCP config (Claude Desktop, Cursor, and other MCP clients).
  const mcpJson = `{\n  "mcpServers": {\n    "substrate": {\n      "type": "http",\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${token}" }\n    }\n  }\n}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-ink-0/60" onClick={() => setOpen(false)}>
      <div
        className="animate-enter w-full max-w-xl rounded-lg border border-line-2 bg-ink-1 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-line">
          <span className="flex items-center gap-2 text-[13px] font-medium">
            <Plug size={14} className="text-accent" /> Connect an agent
          </span>
          <IconButton label="Close" onClick={() => setOpen(false)} className="-mr-1">
            <X size={14} />
          </IconButton>
        </header>

        <div className="p-4 space-y-4">
          <p className="text-[12px] text-fg-dim">
            Copy this prompt into your AI client of choice (Claude Code, Claude Desktop, Cursor, Codex…) to connect your
            agent and let it co-edit this deck over MCP.
          </p>
          <CopyBox label="Prompt — paste into your agent" value={prompt} multiline />
          <CopyBox label="Register the server — Claude Code" value={cli} />
          <CopyBox label="Codex — ~/.codex/config.toml" value={codex} multiline />
          <CopyBox label="Other MCP clients (Claude Desktop, Cursor…)" value={mcpJson} multiline />
          <p className="text-[10px] text-fg-faint">
            Loopback only · the token persists across restarts · set <span className="mono">SUBSTRATE_MCP_TOKEN</span> to
            pin your own. Agents edit prompts only — there are no editable pixels.
          </p>
        </div>
      </div>
    </div>
  );
}
