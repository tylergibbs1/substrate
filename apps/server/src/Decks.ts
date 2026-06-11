// @effect-diagnostics nodeBuiltinImport:off
import fs from "node:fs";
import path from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type {
  AspectRatio,
  Author,
  Deck,
  DeckDetail,
  DeckSummary,
  DesignPreset,
  EditMode,
  ExportFormat,
  PromptEdit,
  Quality,
  Slide,
  Substrate,
  Version,
} from "@substrate/contracts";
import { assemblePrompt } from "@substrate/shared/PromptAssembly";
import { DEFAULT_PRESET_ID, DESIGN_PRESETS } from "@substrate/shared/Presets";
import { DATA_DIR } from "./Config.ts";
import { Sqlite } from "./Sqlite.ts";
import { Provider } from "./Provider.ts";
import { Generation } from "./Generation.ts";
import { Events } from "./Events.ts";
import { blobPath, hash, id, newSeed, now, writeBlob } from "./util.ts";

/**
 * The built-in demo deck (PRD-style onboarding). Seeded on first launch with the
 * real GPT Image 2 renders bundled under assets/demo, so every user opens the
 * app to a finished Apple-style example — no API key required to see how it works.
 */
const DEMO_DIR = path.resolve(import.meta.dirname, "../assets/demo");
const DEMO_SLIDES: ReadonlyArray<string> = [
  'Title slide. Enormous bold centered wordmark "Substrate" in crisp black on a near-white background. Small subtitle below in muted grey: "The prompt is the only editable artifact." Vast whitespace.',
  'A single bold statement, left-aligned, large type: "An image model returns pixels." Below in smaller muted text: "Pixels can\'t be diffed, reviewed, or co-authored." Minimal, one idea.',
  'Headline "Two editable surfaces". Two clean labeled cards side by side: "Slide prompt — what this slide says and shows" and "Main design prompt — the deck\'s visual system". Restrained accent color.',
  'Headline "Human and agent, one source of truth". A simple diagram: a person and an AI agent both pointing to a single shared "prompt" document in the center. Calm, lots of negative space.',
  'Headline "Every edit is versioned, attributed, reversible." A subtle vertical timeline of small prompt-edit entries with author tags. Quiet, precise.',
  'Closing slide. Centered: "Collaborate on the prompt, not the pixels." Tiny "Substrate" wordmark beneath. Confident, minimal, generous whitespace.',
];

/**
 * Decks — the domain service that mutates the two editable artifacts. Both the
 * HTTP server and the MCP server call through here, so a human edit and an agent
 * edit travel the exact same path with attribution (PRD §6.8). Never a silent
 * clobber: in review mode every edit becomes a proposal.
 */

const HUMAN: Author = { kind: "human", id: "you" };

interface DeckR {
  id: string;
  title: string;
  aspect_ratio: string;
  design_preset_id: string;
  main_design_prompt: string;
  review_mode: number;
  created_at: number;
}
interface SlideR {
  id: string;
  deck_id: string;
  order_index: number;
  prompt: string;
  title: string | null;
  current_version_id: string | null;
  seed: number;
  image_blob_ref: string | null;
  job_status: string | null;
}
interface EditR {
  id: string;
  target: string;
  target_id: string;
  old_value: string;
  new_value: string;
  note: string | null;
  author_kind: string;
  author_id: string;
  status: string;
  mode: string;
  created_at: number;
}

const mapDeck = (r: DeckR): Deck => ({
  id: r.id,
  title: r.title,
  aspectRatio: r.aspect_ratio as AspectRatio,
  designPresetId: r.design_preset_id,
  mainDesignPrompt: r.main_design_prompt,
  reviewMode: !!r.review_mode,
  createdAt: r.created_at,
});

const mapSlide = (r: SlideR): Slide => ({
  id: r.id,
  deckId: r.deck_id,
  orderIndex: r.order_index,
  prompt: r.prompt,
  title: r.title,
  currentVersionId: r.current_version_id,
  imageBlobRef: r.image_blob_ref,
  seed: r.seed,
  jobStatus: (r.job_status as Slide["jobStatus"]) ?? null,
});

const mapEdit = (r: EditR): PromptEdit => ({
  id: r.id,
  target: r.target as PromptEdit["target"],
  targetId: r.target_id,
  oldValue: r.old_value,
  newValue: r.new_value,
  note: r.note ?? null,
  author: { kind: r.author_kind as Author["kind"], id: r.author_id },
  status: r.status as PromptEdit["status"],
  mode: r.mode as EditMode,
  createdAt: r.created_at,
});

export interface DecksShape {
  readonly listPresets: Effect.Effect<ReadonlyArray<DesignPreset>>;
  readonly listDecks: Effect.Effect<ReadonlyArray<DeckSummary>>;
  readonly getDeck: (deckId: string) => Effect.Effect<Deck | null>;
  readonly getDeckDetail: (deckId: string) => Effect.Effect<DeckDetail | null>;
  readonly getEdit: (editId: string) => Effect.Effect<PromptEdit | null>;
  readonly listPendingEdits: (deckId: string) => Effect.Effect<ReadonlyArray<PromptEdit>>;
  readonly getHistory: (
    slideId: string,
  ) => Effect.Effect<{ versions: ReadonlyArray<Version>; edits: ReadonlyArray<PromptEdit>; substrates: ReadonlyArray<Substrate> }>;
  readonly createDeck: (input: {
    title: string;
    aspectRatio: AspectRatio;
    designPresetId?: string | undefined;
    designPrompt?: string | undefined;
    outline?: string | ReadonlyArray<string> | undefined;
  }) => Effect.Effect<{ deckId: string; outlineFailed: boolean }>;
  readonly addSlide: (
    deckId: string,
    prompt: string,
    position: number | undefined,
    author?: Author,
  ) => Effect.Effect<{ slideId: string }>;
  readonly editSlidePrompt: (
    slideId: string,
    newPrompt: string,
    mode: EditMode,
    author?: Author,
    note?: string,
  ) => Effect.Effect<{ applied: boolean; editId: string }>;
  readonly setDesignPrompt: (
    deckId: string,
    newPrompt: string,
    mode: EditMode,
    author?: Author,
    note?: string,
  ) => Effect.Effect<{ applied: boolean; editId: string; affectedSlides: number }>;
  readonly resolveEdit: (
    editId: string,
    decision: "approve" | "reject",
  ) => Effect.Effect<{ applied: boolean; stale?: boolean }>;
  readonly regenerate: (
    slideId: string,
    opts: { quality?: Quality | undefined; reseed?: boolean | undefined },
  ) => Effect.Effect<{ jobId: string }>;
  readonly variations: (
    slideId: string,
    count: number,
  ) => Effect.Effect<ReadonlyArray<{ versionId: string; imageBlobRef: string; seed: number }>>;
  readonly pickVersion: (slideId: string, versionId: string) => Effect.Effect<void>;
  readonly reorder: (deckId: string, orderedSlideIds: ReadonlyArray<string>) => Effect.Effect<void>;
  readonly setReviewMode: (deckId: string, on: boolean) => Effect.Effect<void>;
  readonly exportDeck: (deckId: string, format: ExportFormat) => Effect.Effect<{ path: string; note?: string }>;
  readonly exportManifest: (deckId: string, format: ExportFormat) => Effect.Effect<ExportBundle>;
  /** Generate + persist display titles for any slides that lack one (batched into
   *  one model call). No-op when every slide already has a title. */
  readonly ensureTitles: (deckId: string) => Effect.Effect<{ generated: number }>;
}

export class Decks extends Context.Service<Decks, DecksShape>()("substrate/Decks") {}

/** A file in an export bundle: either an existing image blob or inline text. */
export type ExportFile = { name: string; blobRef: string } | { name: string; text: string };

export interface ExportBundle {
  readonly files: ReadonlyArray<ExportFile>;
  readonly note?: string;
  /** Sanitized base name for the destination folder/file the user picks. */
  readonly suggestedName: string;
}

/** Build the export file list + notes.md once; both the MCP disk export and the
 *  UI manifest consume this so naming/notes never diverge. Reads blob existence
 *  but writes nothing. */
function buildExportFiles(detail: DeckDetail, format: ExportFormat): ExportBundle {
  const safe = detail.deck.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "deck";
  const files: ExportFile[] = [];
  const notes: Array<string> = [`# ${detail.deck.title}`, "", `_Design prompt:_ ${detail.deck.mainDesignPrompt}`, ""];
  detail.slides.forEach((slide, i) => {
    const n = String(i + 1).padStart(2, "0");
    if (slide.imageBlobRef && fs.existsSync(blobPath(slide.imageBlobRef))) {
      const ext = slide.imageBlobRef.split(".").pop() ?? "png";
      files.push({ name: `${n}.${ext}`, blobRef: slide.imageBlobRef });
    }
    notes.push(`## Slide ${n}`, slide.prompt, "");
  });
  files.push({ name: "notes.md", text: notes.join("\n") });
  const note =
    format === "png"
      ? undefined
      : `${format.toUpperCase()} is emitted as an image bundle + notes.md in this slice; single-file ${format} packaging is a follow-up.`;
  const suggestedName = `${safe}-${format}`;
  return note === undefined ? { files, suggestedName } : { files, note, suggestedName };
}

const make = Effect.gen(function* () {
  const sql = yield* Sqlite;
  const provider = yield* Provider;
  const generation = yield* Generation;
  const events = yield* Events;

  // Not-found / invalid-state are defects here: callers pass ids that must exist.
  const die = (message: string) => Effect.die(new Error(message));

  // Seed built-in presets once (PRD §6.1).
  for (const p of DESIGN_PRESETS) {
    yield* sql.run(
      "INSERT OR IGNORE INTO design_presets (id, name, description, design_prompt, style_ref_blob, is_default) VALUES (?, ?, ?, ?, NULL, ?)",
      [p.id, p.name, p.description, p.designPrompt, p.isDefault ? 1 : 0],
    );
  }

  // Seed the demo deck on a fresh install so first-run shows a finished example.
  const deckCount = yield* sql.get<{ c: number }>("SELECT COUNT(*) c FROM decks");
  if ((deckCount?.c ?? 0) === 0 && fs.existsSync(path.join(DEMO_DIR, "01.png"))) {
    yield* sql.sync((db) => {
      const applePrompt = DESIGN_PRESETS.find((p) => p.id === "apple")!.designPrompt;
      const deckId = id("deck");
      db.prepare(
        "INSERT INTO decks (id, title, aspect_ratio, design_preset_id, main_design_prompt, review_mode, created_at) VALUES (?, ?, '16:9', 'apple', ?, 0, ?)",
      ).run(deckId, "Welcome to Substrate", applePrompt, now());
      DEMO_SLIDES.forEach((prompt, i) => {
        const slideId = id("slide");
        const seed = newSeed();
        const bytes = fs.readFileSync(path.join(DEMO_DIR, `${String(i + 1).padStart(2, "0")}.png`));
        const blobRef = writeBlob(bytes, "png");
        const substrateId = id("sub");
        const versionId = id("ver");
        db.prepare("INSERT INTO slides (id, deck_id, order_index, prompt, current_version_id, seed) VALUES (?, ?, ?, ?, ?, ?)").run(
          slideId,
          deckId,
          i,
          prompt,
          versionId,
          seed,
        );
        db.prepare(
          "INSERT INTO substrates (id, slide_id, prompt, hash, author_kind, author_id, created_at) VALUES (?, ?, ?, ?, 'human', 'substrate', ?)",
        ).run(substrateId, slideId, prompt, hash(prompt), now());
        db.prepare(
          "INSERT INTO versions (id, slide_id, substrate_id, assembled_prompt_hash, image_blob_ref, seed, model, quality, created_at) VALUES (?, ?, ?, ?, ?, ?, 'gpt-image-2-2026-04-21', 'instant', ?)",
        ).run(versionId, slideId, substrateId, hash(`${assemblePrompt(applePrompt, prompt)}|instant`), blobRef, seed, now());
      });
    });
  }

  const slideDeckId = (slideId: string) =>
    sql
      .get<{ deck_id: string }>("SELECT deck_id FROM slides WHERE id = ?", [slideId])
      .pipe(Effect.map((r) => r?.deck_id ?? null));

  const recordSubstrate = (slideId: string, prompt: string, author: Author) =>
    sql.run(
      "INSERT INTO substrates (id, slide_id, prompt, hash, author_kind, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id("sub"), slideId, prompt, hash(prompt), author.kind, author.id, now()],
    );

  const recordEdit = (
    target: "slide" | "design",
    targetId: string,
    oldValue: string,
    newValue: string,
    author: Author,
    mode: EditMode,
    status: "applied" | "pending",
    note?: string,
  ) =>
    Effect.gen(function* () {
      const editId = id("edit");
      yield* sql.run(
        "INSERT INTO prompt_edits (id, target, target_id, old_value, new_value, note, author_kind, author_id, status, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [editId, target, targetId, oldValue, newValue, note?.trim() || null, author.kind, author.id, status, mode, now()],
      );
      return editId;
    });

  const getDeck: DecksShape["getDeck"] = (deckId) =>
    sql.get<DeckR>("SELECT * FROM decks WHERE id = ?", [deckId]).pipe(Effect.map((r) => (r ? mapDeck(r) : null)));

  const slidesFor = (deckId: string) =>
    sql
      .all<SlideR>(
        `SELECT s.*, v.image_blob_ref AS image_blob_ref,
          (SELECT status FROM jobs j WHERE j.slide_id = s.id ORDER BY COALESCE(j.finished_at, j.started_at, 0) DESC, rowid DESC LIMIT 1) AS job_status
        FROM slides s LEFT JOIN versions v ON v.id = s.current_version_id
        WHERE s.deck_id = ? ORDER BY s.order_index`,
        [deckId],
      )
      .pipe(Effect.map((rows) => rows.map(mapSlide)));

  const listPendingEdits: DecksShape["listPendingEdits"] = (deckId) =>
    sql
      .all<EditR>(
        `SELECT pe.* FROM prompt_edits pe WHERE pe.status = 'pending' AND (
          (pe.target = 'design' AND pe.target_id = ?) OR
          (pe.target = 'slide' AND pe.target_id IN (SELECT id FROM slides WHERE deck_id = ?))
        ) ORDER BY pe.created_at DESC`,
        [deckId, deckId],
      )
      .pipe(Effect.map((rows) => rows.map(mapEdit)));

  const getDeckDetail: DecksShape["getDeckDetail"] = (deckId) =>
    Effect.gen(function* () {
      const deck = yield* getDeck(deckId);
      if (!deck) return null;
      const slides = yield* slidesFor(deckId);
      const pendingEdits = yield* listPendingEdits(deckId);
      return { deck, slides, pendingEdits };
    });

  // Lets an agent poll the outcome of a proposal it made (pending/applied/rejected)
  // instead of being blind after `edit_slide_prompt` returns `{applied:false}`.
  const getEdit: DecksShape["getEdit"] = (editId) =>
    sql.get<EditR>("SELECT * FROM prompt_edits WHERE id = ?", [editId]).pipe(Effect.map((r) => (r ? mapEdit(r) : null)));

  const listPresets: DecksShape["listPresets"] = sql
    .all<{
      id: string;
      name: string;
      description: string;
      design_prompt: string;
      style_ref_blob: string | null;
      is_default: number;
    }>("SELECT * FROM design_presets ORDER BY is_default DESC, name")
    .pipe(
      Effect.map((rows) =>
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          designPrompt: r.design_prompt,
          styleRefBlobRef: r.style_ref_blob,
          isDefault: !!r.is_default,
        })),
      ),
    );

  const listDecks: DecksShape["listDecks"] = sql
    .all<{ id: string; title: string; slide_count: number }>(
      "SELECT d.id, d.title, (SELECT COUNT(*) FROM slides s WHERE s.deck_id = d.id) AS slide_count FROM decks d ORDER BY d.created_at DESC",
    )
    .pipe(Effect.map((rows) => rows.map((r) => ({ id: r.id, title: r.title, slideCount: r.slide_count }))));

  const getHistory: DecksShape["getHistory"] = (slideId) =>
    Effect.gen(function* () {
      const versions = yield* sql
        .all<{
          id: string;
          slide_id: string;
          substrate_id: string;
          assembled_prompt_hash: string;
          image_blob_ref: string | null;
          seed: number;
          model: string;
          quality: string;
          created_at: number;
        }>("SELECT * FROM versions WHERE slide_id = ? ORDER BY created_at DESC", [slideId])
        .pipe(
          Effect.map((rows): ReadonlyArray<Version> =>
            rows.map((r) => ({
              id: r.id,
              slideId: r.slide_id,
              substrateId: r.substrate_id,
              assembledPromptHash: r.assembled_prompt_hash,
              imageBlobRef: r.image_blob_ref,
              seed: r.seed,
              model: r.model,
              quality: r.quality as Quality,
              createdAt: r.created_at,
            })),
          ),
        );
      const edits = yield* sql
        .all<EditR>("SELECT * FROM prompt_edits WHERE target = 'slide' AND target_id = ? ORDER BY created_at DESC", [slideId])
        .pipe(Effect.map((rows) => rows.map(mapEdit)));
      const substrates = yield* sql
        .all<{
          id: string;
          slide_id: string;
          prompt: string;
          hash: string;
          author_kind: string;
          author_id: string;
          created_at: number;
        }>("SELECT * FROM substrates WHERE slide_id = ? ORDER BY created_at DESC", [slideId])
        .pipe(
          Effect.map((rows): ReadonlyArray<Substrate> =>
            rows.map((r) => ({
              id: r.id,
              slideId: r.slide_id,
              prompt: r.prompt,
              hash: r.hash,
              author: { kind: r.author_kind as Author["kind"], id: r.author_id },
              createdAt: r.created_at,
            })),
          ),
        );
      return { versions, edits, substrates };
    });

  const createDeck: DecksShape["createDeck"] = (input) =>
    Effect.gen(function* () {
      // A user-described style becomes the main design prompt directly (a
      // "custom" design); otherwise resolve the chosen preset.
      const custom = input.designPrompt?.trim();
      let presetId: string;
      let mainDesignPrompt: string;
      if (custom) {
        presetId = "custom";
        mainDesignPrompt = custom;
      } else {
        presetId = input.designPresetId ?? DEFAULT_PRESET_ID;
        const preset = yield* sql.get<{ design_prompt: string }>("SELECT design_prompt FROM design_presets WHERE id = ?", [presetId]);
        if (!preset) return yield* die(`design preset not found: ${presetId}`);
        mainDesignPrompt = preset.design_prompt;
      }

      const deckId = id("deck");
      yield* sql.run(
        "INSERT INTO decks (id, title, aspect_ratio, design_preset_id, main_design_prompt, review_mode, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
        [deckId, input.title, input.aspectRatio, presetId, mainDesignPrompt, now()],
      );

      let prompts: ReadonlyArray<string> = [];
      let outlineFailed = false;
      if (Array.isArray(input.outline)) prompts = input.outline;
      else if (typeof input.outline === "string" && input.outline.trim()) {
        // Distinguish "the model failed" from "empty topic" instead of silently
        // returning an empty deck — the caller surfaces it (AGENTS.md reliability).
        const outlined = yield* provider.outline(input.outline.trim(), 12).pipe(
          Effect.map((value) => ({ ok: true as const, value })),
          Effect.catch(() => Effect.succeed({ ok: false as const })),
        );
        if (outlined.ok) prompts = outlined.value;
        else outlineFailed = true;
      }

      yield* Effect.forEach(prompts, (prompt, i) =>
        Effect.gen(function* () {
          const slideId = id("slide");
          yield* sql.run("INSERT INTO slides (id, deck_id, order_index, prompt, current_version_id, seed) VALUES (?, ?, ?, ?, NULL, ?)", [
            slideId,
            deckId,
            i,
            prompt,
            newSeed(),
          ]);
          yield* recordSubstrate(slideId, prompt, HUMAN);
          yield* generation.enqueueRender(slideId, { quality: "instant" });
        }),
      );

      yield* events.publish({ type: "deck-changed", deckId });
      return { deckId, outlineFailed };
    });

  const addSlide: DecksShape["addSlide"] = (deckId, prompt, position, author = HUMAN) =>
    Effect.gen(function* () {
      const countRow = yield* sql.get<{ c: number }>("SELECT COUNT(*) c FROM slides WHERE deck_id = ?", [deckId]);
      const at = position ?? countRow?.c ?? 0;
      yield* sql.run("UPDATE slides SET order_index = order_index + 1 WHERE deck_id = ? AND order_index >= ?", [deckId, at]);
      const slideId = id("slide");
      yield* sql.run("INSERT INTO slides (id, deck_id, order_index, prompt, current_version_id, seed) VALUES (?, ?, ?, ?, NULL, ?)", [
        slideId,
        deckId,
        at,
        prompt,
        newSeed(),
      ]);
      yield* recordSubstrate(slideId, prompt, author);
      yield* generation.enqueueRender(slideId, { quality: "instant" });
      yield* events.publish({ type: "deck-changed", deckId });
      return { slideId };
    });

  const editSlidePrompt: DecksShape["editSlidePrompt"] = (slideId, newPrompt, mode, author = HUMAN, note) =>
    Effect.gen(function* () {
      const slide = yield* sql.get<{ deck_id: string; prompt: string }>("SELECT deck_id, prompt FROM slides WHERE id = ?", [slideId]);
      if (!slide) return yield* die(`slide not found: ${slideId}`);
      const deck = yield* getDeck(slide.deck_id);
      const effectiveMode: EditMode = deck?.reviewMode ? "propose" : mode;

      if (effectiveMode === "propose") {
        const editId = yield* recordEdit("slide", slideId, slide.prompt, newPrompt, author, "propose", "pending", note);
        yield* events.publish({ type: "pending-edits-changed", deckId: slide.deck_id });
        return { applied: false, editId };
      }
      const editId = yield* recordEdit("slide", slideId, slide.prompt, newPrompt, author, "direct", "applied", note);
      yield* sql.run("UPDATE slides SET prompt = ?, title = NULL WHERE id = ?", [newPrompt, slideId]);
      yield* recordSubstrate(slideId, newPrompt, author);
      yield* generation.enqueueRender(slideId, { quality: "instant" });
      yield* events.publish({ type: "slide-changed", deckId: slide.deck_id, slideId });
      return { applied: true, editId };
    });

  const setDesignPrompt: DecksShape["setDesignPrompt"] = (deckId, newPrompt, mode, author = HUMAN, note) =>
    Effect.gen(function* () {
      const deck = yield* getDeck(deckId);
      if (!deck) return yield* die(`deck not found: ${deckId}`);
      const effectiveMode: EditMode = deck.reviewMode ? "propose" : mode;

      if (effectiveMode === "propose") {
        const editId = yield* recordEdit("design", deckId, deck.mainDesignPrompt, newPrompt, author, "propose", "pending", note);
        yield* events.publish({ type: "pending-edits-changed", deckId });
        return { applied: false, editId, affectedSlides: 0 };
      }
      const editId = yield* recordEdit("design", deckId, deck.mainDesignPrompt, newPrompt, author, "direct", "applied", note);
      yield* sql.run("UPDATE decks SET main_design_prompt = ? WHERE id = ?", [newPrompt, deckId]);
      // Editing the design prompt invalidates the whole deck's cache; re-render all.
      const slides = yield* sql.all<{ id: string }>("SELECT id FROM slides WHERE deck_id = ?", [deckId]);
      yield* Effect.forEach(slides, (s) => generation.enqueueRender(s.id, { quality: "instant" }));
      yield* events.publish({ type: "deck-changed", deckId });
      return { applied: true, editId, affectedSlides: slides.length };
    });

  const resolveEdit: DecksShape["resolveEdit"] = (editId, decision) =>
    Effect.gen(function* () {
      const edit = yield* sql.get<EditR>("SELECT * FROM prompt_edits WHERE id = ?", [editId]);
      if (!edit) return yield* die(`edit not found: ${editId}`);
      if (edit.status !== "pending") return yield* die(`edit already ${edit.status}`);

      if (decision === "reject") {
        yield* sql.run("UPDATE prompt_edits SET status = 'rejected' WHERE id = ?", [editId]);
        const deckId = edit.target === "design" ? edit.target_id : yield* slideDeckId(edit.target_id);
        if (deckId) yield* events.publish({ type: "pending-edits-changed", deckId });
        return { applied: false };
      }

      // Stale-base guard: refuse to clobber a prompt that changed since the
      // proposal was recorded (a human edited in between). Correctness over
      // convenience (AGENTS.md) — never a silent overwrite. Reject it so the
      // author can re-propose against the current text.
      const liveValue =
        edit.target === "slide"
          ? (yield* sql.get<{ prompt: string }>("SELECT prompt FROM slides WHERE id = ?", [edit.target_id]))?.prompt
          : (yield* getDeck(edit.target_id))?.mainDesignPrompt;
      if (liveValue !== undefined && liveValue !== edit.old_value) {
        yield* sql.run("UPDATE prompt_edits SET status = 'rejected' WHERE id = ?", [editId]);
        const deckId = edit.target === "design" ? edit.target_id : yield* slideDeckId(edit.target_id);
        if (deckId) yield* events.publish({ type: "pending-edits-changed", deckId });
        return { applied: false, stale: true };
      }

      const author: Author = { kind: edit.author_kind as Author["kind"], id: edit.author_id };
      yield* sql.run("UPDATE prompt_edits SET status = 'applied' WHERE id = ?", [editId]);

      if (edit.target === "slide") {
        yield* sql.run("UPDATE slides SET prompt = ?, title = NULL WHERE id = ?", [edit.new_value, edit.target_id]);
        yield* recordSubstrate(edit.target_id, edit.new_value, author);
        yield* generation.enqueueRender(edit.target_id, { quality: "instant" });
        const deckId = yield* slideDeckId(edit.target_id);
        if (deckId) {
          yield* events.publish({ type: "slide-changed", deckId, slideId: edit.target_id });
          yield* events.publish({ type: "pending-edits-changed", deckId });
        }
      } else {
        yield* sql.run("UPDATE decks SET main_design_prompt = ? WHERE id = ?", [edit.new_value, edit.target_id]);
        const slides = yield* sql.all<{ id: string }>("SELECT id FROM slides WHERE deck_id = ?", [edit.target_id]);
        yield* Effect.forEach(slides, (s) => generation.enqueueRender(s.id, { quality: "instant" }));
        yield* events.publish({ type: "deck-changed", deckId: edit.target_id });
        yield* events.publish({ type: "pending-edits-changed", deckId: edit.target_id });
      }
      return { applied: true };
    });

  const regenerate: DecksShape["regenerate"] = (slideId, opts) =>
    generation.enqueueRender(slideId, opts).pipe(Effect.map((jobId) => ({ jobId })));

  const variations: DecksShape["variations"] = (slideId, count) => generation.generateVariations(slideId, count);

  const pickVersion: DecksShape["pickVersion"] = (slideId, versionId) =>
    Effect.gen(function* () {
      const ver = yield* sql.get<{ id: string; seed: number }>("SELECT id, seed FROM versions WHERE id = ? AND slide_id = ?", [
        versionId,
        slideId,
      ]);
      if (!ver) return yield* die("version not found for slide");
      yield* sql.run("UPDATE slides SET current_version_id = ?, seed = ? WHERE id = ?", [ver.id, ver.seed, slideId]);
      const deckId = yield* slideDeckId(slideId);
      if (deckId) yield* events.publish({ type: "slide-changed", deckId, slideId });
    });

  const reorder: DecksShape["reorder"] = (deckId, orderedSlideIds) =>
    Effect.gen(function* () {
      yield* Effect.forEach(orderedSlideIds, (sid, i) =>
        sql.run("UPDATE slides SET order_index = ? WHERE id = ? AND deck_id = ?", [i, sid, deckId]),
      );
      yield* events.publish({ type: "deck-changed", deckId });
    });

  const setReviewMode: DecksShape["setReviewMode"] = (deckId, on) =>
    Effect.gen(function* () {
      yield* sql.run("UPDATE decks SET review_mode = ? WHERE id = ?", [on ? 1 : 0, deckId]);
      yield* events.publish({ type: "deck-changed", deckId });
    });

  // exportDeck (writes a directory bundle, for the MCP `export_deck` tool — agents
  // have no save dialog) and exportManifest (lists the same files for the UI to
  // write wherever the user chooses) share one bundle definition so the file naming
  // and notes.md content can never drift between the two paths.
  const exportDeck: DecksShape["exportDeck"] = (deckId, format) =>
    Effect.gen(function* () {
      const detail = yield* getDeckDetail(deckId);
      if (!detail) return yield* die(`deck not found: ${deckId}`);
      return yield* sql.sync(() => {
        const { files, note, suggestedName } = buildExportFiles(detail, format);
        const dir = path.join(DATA_DIR, "exports", `${suggestedName}-${now()}`);
        fs.mkdirSync(dir, { recursive: true });
        for (const f of files) {
          if ("blobRef" in f) fs.copyFileSync(blobPath(f.blobRef), path.join(dir, f.name));
          else fs.writeFileSync(path.join(dir, f.name), f.text, "utf8");
        }
        return note === undefined ? { path: dir } : { path: dir, note };
      });
    });

  const exportManifest: DecksShape["exportManifest"] = (deckId, format) =>
    Effect.gen(function* () {
      const detail = yield* getDeckDetail(deckId);
      if (!detail) return yield* die(`deck not found: ${deckId}`);
      return buildExportFiles(detail, format);
    });

  const ensureTitles: DecksShape["ensureTitles"] = (deckId) =>
    Effect.gen(function* () {
      const rows = yield* sql.all<{ id: string; prompt: string }>(
        "SELECT id, prompt FROM slides WHERE deck_id = ? AND title IS NULL ORDER BY order_index",
        [deckId],
      );
      if (rows.length === 0) return { generated: 0 };
      // One batched model call for every untitled slide, order preserved.
      const titles = yield* provider.titles(rows.map((r) => r.prompt));
      yield* sql.sync((db) => {
        const set = db.prepare("UPDATE slides SET title = ? WHERE id = ?");
        rows.forEach((r, i) => {
          const t = titles[i]?.trim();
          if (t) set.run(t, r.id);
        });
      });
      yield* events.publish({ type: "deck-changed", deckId });
      return { generated: rows.length };
    }).pipe(
      // Title generation is best-effort: on a provider error keep the derived
      // fallback rather than failing the request.
      Effect.orElseSucceed(() => ({ generated: 0 })),
    );

  return {
    listPresets,
    listDecks,
    getDeck,
    getDeckDetail,
    getEdit,
    listPendingEdits,
    getHistory,
    createDeck,
    addSlide,
    editSlidePrompt,
    setDesignPrompt,
    resolveEdit,
    regenerate,
    variations,
    pickVersion,
    reorder,
    setReviewMode,
    exportDeck,
    exportManifest,
    ensureTitles,
  };
});

export const DecksLayer = Layer.effect(Decks, make);
