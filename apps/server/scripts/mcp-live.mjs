// Live MCP test: an agent edits a slide prompt over MCP. Watch it appear in the
// running app with no refresh (shared live state via WebSocket).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = "http://localhost:4321";
const { mcpToken } = await fetch(base + "/api/status").then((r) => r.json());
const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
  requestInit: { headers: { "x-agent-name": "claude-desktop", authorization: `Bearer ${mcpToken}` } },
});
const client = new Client({ name: "live-agent", version: "1.0.0" });
await client.connect(transport);

// The agent discovers the deck the human is viewing — shared state.
const decks = JSON.parse((await client.callTool({ name: "list_decks", arguments: {} })).content[0].text);
const deckId = decks[0].id;
const deck = JSON.parse((await client.callTool({ name: "get_deck", arguments: { deck_id: deckId } })).content[0].text);
const slide = deck.slides[0];
console.log("agent sees deck:", decks[0].title, "| editing slide 1:", slide.id);

// Direct edit — applies and re-renders. The app reflects it live.
const res = JSON.parse(
  (await client.callTool({
    name: "edit_slide_prompt",
    arguments: { slide_id: slide.id, prompt: "Edited by an agent over MCP — live, shared state.", mode: "direct" },
  })).content[0].text,
);
console.log("agent edit applied:", res.applied);
await client.close();
console.log("OK");
