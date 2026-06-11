// @effect-diagnostics nodeBuiltinImport:off
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as Effect from "effect/Effect";
import type { Author } from "@substrate/contracts";
import { Decks, type DecksShape } from "./Decks.ts";
import { blobExists, blobPath } from "./util.ts";
import { runtime } from "./runtime.ts";

/**
 * The app as an MCP server (PRD §5, §11). An agent connects and edits the exact
 * same two prompt surfaces a human sees — slide prompts and the deck's main
 * design prompt — through the same `Decks` domain service. Every call carries
 * the agent's identity, recorded as the author on the resulting edit. There is
 * no pixel-editing tool, because there are no editable pixels.
 *
 * The SDK boundary uses zod for tool input schemas; the app's own contracts use
 * effect/Schema. Tool handlers run Effects on the shared runtime.
 */

const withDecks = <A>(f: (d: DecksShape) => Effect.Effect<A>): Promise<A> =>
  runtime.runPromise(Effect.flatMap(Decks, f));

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true });

const guard = async (fn: () => Promise<unknown>) => {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
};

export function buildMcpServer(agentName?: string): McpServer {
  const server = new McpServer({ name: "substrate", version: "0.3.0" });
  const author: Author = { kind: "agent", id: agentName?.trim() || "agent" };

  server.registerTool(
    "list_decks",
    { title: "List decks", description: "List open decks with ids and titles.", inputSchema: {} },
    async () => ok(await withDecks((d) => d.listDecks)),
  );

  server.registerTool(
    "list_design_presets",
    { title: "List design presets", description: "List available design presets (Apple-style is default).", inputSchema: {} },
    async () => ok(await withDecks((d) => d.listPresets)),
  );

  server.registerTool(
    "create_deck",
    {
      title: "Create deck",
      description:
        "Create a new deck. Optionally pass a design preset and an outline (a topic string to expand, or an explicit array of slide intents).",
      inputSchema: {
        title: z.string(),
        aspect_ratio: z.enum(["16:9", "4:3", "1:1"]).default("16:9"),
        design_preset_id: z.string().optional(),
        design_prompt: z.string().optional(),
        outline: z.union([z.string(), z.array(z.string())]).optional(),
      },
    },
    async (a) =>
      guard(() =>
        withDecks((d) =>
          d.createDeck({
            title: a.title,
            aspectRatio: a.aspect_ratio,
            designPresetId: a.design_preset_id,
            designPrompt: a.design_prompt,
            outline: a.outline,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_deck",
    { title: "Get deck", description: "Get a deck with its main design prompt, slides, and each slide prompt.", inputSchema: { deck_id: z.string() } },
    async (a) => {
      const detail = await withDecks((d) => d.getDeckDetail(a.deck_id));
      return detail ? ok(detail) : fail(`deck not found: ${a.deck_id}`);
    },
  );

  server.registerTool(
    "set_design_prompt",
    {
      title: "Set design prompt",
      description:
        "Update the deck's main design prompt. mode 'direct' applies and re-renders the whole deck; 'propose' lands a pending suggestion. Review mode forces propose. Pass `note` to explain the change to the human reviewer.",
      inputSchema: {
        deck_id: z.string(),
        design_prompt: z.string(),
        mode: z.enum(["direct", "propose"]).default("direct"),
        note: z.string().optional(),
      },
    },
    async (a) => guard(() => withDecks((d) => d.setDesignPrompt(a.deck_id, a.design_prompt, a.mode, author, a.note))),
  );

  server.registerTool(
    "add_slide",
    {
      title: "Add slide",
      description:
        "Create a slide from a prompt. By default its render is queued immediately; pass render=false to add a blank slide and render later with regenerate_slide.",
      inputSchema: {
        deck_id: z.string(),
        prompt: z.string(),
        position: z.number().int().optional(),
        render: z.boolean().default(true),
      },
    },
    async (a) => guard(() => withDecks((d) => d.addSlide(a.deck_id, a.prompt, a.position, author, a.render))),
  );

  server.registerTool(
    "set_deck_title",
    {
      title: "Set deck title",
      description: "Rename the deck to a concise, specific title.",
      inputSchema: { deck_id: z.string(), title: z.string() },
    },
    async (a) => guard(() => withDecks((d) => d.setDeckTitle(a.deck_id, a.title).pipe(Effect.as({ ok: true })))),
  );

  server.registerTool(
    "delete_slide",
    {
      title: "Delete slide",
      description: "Delete a slide (and its render history) from its deck. Remaining slides are reindexed.",
      inputSchema: { slide_id: z.string() },
    },
    async (a) => guard(() => withDecks((d) => d.deleteSlide(a.slide_id))),
  );

  server.registerTool(
    "get_slide_render",
    {
      title: "Get slide render",
      description:
        "Fetch a slide's current rendered image so you can SEE it and critique it before editing the prompt. Returns the image inline, or a note if the slide hasn't been rendered yet.",
      inputSchema: { slide_id: z.string() },
    },
    async (a) => {
      const slide = await withDecks((d) => d.getSlide(a.slide_id));
      if (!slide) return fail(`slide not found: ${a.slide_id}`);
      if (!slide.imageBlobRef || !blobExists(slide.imageBlobRef)) {
        return ok({ slideId: a.slide_id, rendered: false, note: "not rendered yet — call regenerate_slide first" });
      }
      const ext = slide.imageBlobRef.split(".").pop() ?? "png";
      const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
      return {
        content: [{ type: "image" as const, data: fs.readFileSync(blobPath(slide.imageBlobRef)).toString("base64"), mimeType }],
      };
    },
  );

  server.registerTool(
    "edit_slide_prompt",
    {
      title: "Edit slide prompt",
      description:
        "Edit a slide's prompt. mode 'direct' applies and renders; 'propose' lands a pending suggestion a human approves. Review mode forces propose. Pass `note` to explain the change to the human reviewer.",
      inputSchema: {
        slide_id: z.string(),
        prompt: z.string(),
        mode: z.enum(["direct", "propose"]).default("direct"),
        note: z.string().optional(),
      },
    },
    async (a) => guard(() => withDecks((d) => d.editSlidePrompt(a.slide_id, a.prompt, a.mode, author, a.note))),
  );

  server.registerTool(
    "list_pending_edits",
    { title: "List pending edits", description: "List prompt proposals awaiting human review for a deck.", inputSchema: { deck_id: z.string() } },
    async (a) => ok(await withDecks((d) => d.listPendingEdits(a.deck_id))),
  );

  server.registerTool(
    "get_edit",
    {
      title: "Get edit",
      description:
        "Check the outcome of a proposed edit by id — status is 'pending', 'applied', or 'rejected'. Poll this after a 'propose' edit to learn whether the human approved it.",
      inputSchema: { edit_id: z.string() },
    },
    async (a) => {
      const edit = await withDecks((d) => d.getEdit(a.edit_id));
      return edit ? ok(edit) : fail(`edit not found: ${a.edit_id}`);
    },
  );

  server.registerTool(
    "regenerate_slide",
    {
      title: "Regenerate slide",
      description: "Re-render a slide from its current prompts. Optionally bump quality or reseed.",
      inputSchema: { slide_id: z.string(), quality: z.enum(["instant", "thinking"]).optional(), reseed: z.boolean().optional() },
    },
    async (a) => guard(() => withDecks((d) => d.regenerate(a.slide_id, { quality: a.quality, reseed: a.reseed }))),
  );

  server.registerTool(
    "get_history",
    { title: "Get history", description: "Get a slide's version and prompt-edit lineage with attribution.", inputSchema: { slide_id: z.string() } },
    async (a) => ok(await withDecks((d) => d.getHistory(a.slide_id))),
  );

  server.registerTool(
    "reorder_slides",
    {
      title: "Reorder slides",
      description: "Reorder a deck's slides to match the given id order.",
      inputSchema: { deck_id: z.string(), ordered_slide_ids: z.array(z.string()) },
    },
    async (a) => guard(() => withDecks((d) => d.reorder(a.deck_id, a.ordered_slide_ids).pipe(Effect.as({ ok: true })))),
  );

  server.registerTool(
    "export_deck",
    {
      title: "Export deck",
      description:
        "Export a deck to a folder bundle and return its file path. png is the supported format; pdf/pptx currently fall back to an image bundle + notes.md and the response carries a `note` saying so.",
      inputSchema: { deck_id: z.string(), format: z.enum(["pptx", "pdf", "png"]).default("png") },
    },
    async (a) => guard(() => withDecks((d) => d.exportDeck(a.deck_id, a.format))),
  );

  return server;
}
