// MCP smoke test. Boot the server, then from the repo root:
//   pnpm --filter @substrate/server exec node scripts/smoke-mcp.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.env.SUBSTRATE_SERVER ?? "http://localhost:4321";
// The MCP server is bearer-gated; discover the per-launch token from status.
const { mcpToken } = await fetch(base + "/api/status").then((r) => r.json());
const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
  requestInit: { headers: { "x-agent-name": "claude-desktop", authorization: `Bearer ${mcpToken}` } },
});
const client = new Client({ name: "smoke-agent", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.length);

const created = JSON.parse(
  (await client.callTool({ name: "create_deck", arguments: { title: "Agent deck", outline: ["Hero", "How it works", "The ask"] } }))
    .content[0].text,
);
console.log("agent created deck:", created.deckId);

const deck = JSON.parse((await client.callTool({ name: "get_deck", arguments: { deck_id: created.deckId } })).content[0].text);
const edit = JSON.parse(
  (await client.callTool({ name: "edit_slide_prompt", arguments: { slide_id: deck.slides[0].id, prompt: "Rewritten by agent.", mode: "propose" } }))
    .content[0].text,
);
console.log("agent edit applied (propose -> false):", edit.applied);

const pending = JSON.parse((await client.callTool({ name: "list_pending_edits", arguments: { deck_id: created.deckId } })).content[0].text);
console.log("pending attributed to:", pending.map((p) => `${p.author.kind}:${p.author.id}`).join(","));

await client.close();
console.log("OK");
