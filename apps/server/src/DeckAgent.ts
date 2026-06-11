import { Agent, run, setDefaultOpenAIKey } from "@openai/agents";
import { MCPServerStreamableHttp } from "@openai/agents";
import { config } from "./Config.ts";

/**
 * The in-app "describe your deck" agent. It is just another MCP client: it
 * connects to Substrate's own MCP server (the same tools Claude Code/Codex use)
 * and builds slides into a deck the caller already created. We don't await its
 * renders — the editor shows slides appear and render live over the WS bus as the
 * agent works, reusing all the existing job/event infrastructure.
 */
const INSTRUCTIONS = `You build slide decks in Substrate by calling its MCP tools.

Substrate's ONLY editable artifact is the PROMPT for each slide, plus one deck-wide
"main design prompt" injected ahead of every slide. There are no editable pixels —
each slide is rendered from its prompt by an image model.

You are given an existing deck_id and a description. Build a coherent deck:
1. Call set_deck_title(deck_id, title) with a concise, specific title for the deck.
2. Optionally call list_design_presets, then set_design_prompt(deck_id, ...) to tune
   the deck's visual system to the topic.
3. Add 8-12 slides by calling add_slide(deck_id, prompt) ONE AT A TIME, in final
   presentation order — the title slide first, then each following slide. Each prompt
   must be a vivid, self-contained instruction describing exactly what that ONE slide
   says and shows: the headline text (in quotes), layout, imagery, and tone. Build a
   clear arc — title → problem → insight → supporting points → close. Do NOT prefix a
   prompt with "Slide N" or any slide number; describe only the slide's content.
4. Do NOT call get_slide_render — renders happen asynchronously and you don't need to
   see them to build the deck.

When the deck is complete, stop.`;

export async function buildDeckInto(opts: { deckId: string; description: string; apiKey: string }): Promise<void> {
  setDefaultOpenAIKey(opts.apiKey);

  const mcp = new MCPServerStreamableHttp({
    url: `http://localhost:${config.httpPort}/mcp`,
    name: "substrate",
    requestInit: {
      headers: {
        Authorization: `Bearer ${config.mcpToken}`,
        "x-agent-name": "deck-builder",
      },
    },
  });

  await mcp.connect();
  try {
    const agent = new Agent({
      name: "Deck builder",
      model: config.textModel,
      instructions: INSTRUCTIONS,
      mcpServers: [mcp],
      // One tool call at a time so add_slide appends in narrative order (parallel
      // calls race the per-slide order_index and jumble the deck).
      modelSettings: { parallelToolCalls: false },
    });
    await run(agent, `deck_id: ${opts.deckId}\n\nDeck to build:\n${opts.description}`, { maxTurns: 40 });
  } finally {
    await mcp.close();
  }
}
