import * as Schema from "effect/Schema";

/**
 * @substrate/contracts
 *
 * The shared vocabulary of Substrate, as `effect/Schema` schemas. There are
 * exactly two editable artifacts — the deck's `mainDesignPrompt` and each
 * slide's `prompt` (its substrate) — and every type here exists to make those
 * two prompts versioned, attributed, diffable, and co-editable by a human and
 * an agent. There is no overlay, layer, or object concept. By design (PRD §5).
 *
 * This package is schema-only (see AGENTS.md): no runtime logic. Constants and
 * helpers (aspect sizes, prompt assembly, design presets) live in
 * `@substrate/shared`.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const NonEmpty = Schema.String.check(Schema.isNonEmpty());
const Epoch = Schema.Number;

export const AspectRatio = Schema.Literals(["16:9", "4:3", "1:1"]);
export type AspectRatio = typeof AspectRatio.Type;

export const Quality = Schema.Literals(["instant", "thinking"]);
export type Quality = typeof Quality.Type;

export const AuthorKind = Schema.Literals(["human", "agent"]);
export type AuthorKind = typeof AuthorKind.Type;

export const Author = Schema.Struct({
  kind: AuthorKind,
  /** A username for humans, or a client name like "claude-desktop" for agents. */
  id: NonEmpty,
});
export type Author = typeof Author.Type;

export const JobStatus = Schema.Literals(["queued", "thinking", "rendering", "done", "error"]);
export type JobStatus = typeof JobStatus.Type;

export const EditMode = Schema.Literals(["direct", "propose"]);
export type EditMode = typeof EditMode.Type;

export const EditStatus = Schema.Literals(["applied", "pending", "rejected"]);
export type EditStatus = typeof EditStatus.Type;

export const EditTarget = Schema.Literals(["slide", "design"]);
export type EditTarget = typeof EditTarget.Type;

export const ExportFormat = Schema.Literals(["pptx", "pdf", "png"]);
export type ExportFormat = typeof ExportFormat.Type;

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export const DesignPreset = Schema.Struct({
  id: NonEmpty,
  name: NonEmpty,
  description: Schema.String,
  designPrompt: NonEmpty,
  styleRefBlobRef: Schema.NullOr(Schema.String),
  isDefault: Schema.Boolean,
});
export type DesignPreset = typeof DesignPreset.Type;

export const Version = Schema.Struct({
  id: NonEmpty,
  slideId: NonEmpty,
  substrateId: NonEmpty,
  assembledPromptHash: Schema.String,
  imageBlobRef: Schema.NullOr(Schema.String),
  seed: Schema.Int,
  model: Schema.String,
  quality: Quality,
  createdAt: Epoch,
});
export type Version = typeof Version.Type;

export const Substrate = Schema.Struct({
  id: NonEmpty,
  slideId: NonEmpty,
  prompt: Schema.String,
  hash: Schema.String,
  author: Author,
  createdAt: Epoch,
});
export type Substrate = typeof Substrate.Type;

export const Slide = Schema.Struct({
  id: NonEmpty,
  deckId: NonEmpty,
  orderIndex: Schema.Int,
  /** The current slide prompt — the substrate. The only thing you edit. */
  prompt: Schema.String,
  /** A short, AI-derived display title for the rail/palette. Read-only; null
   *  until generated, and cleared whenever the prompt changes. The prompt stays
   *  the text-of-record — this is only a label. */
  title: Schema.NullOr(Schema.String),
  currentVersionId: Schema.NullOr(Schema.String),
  imageBlobRef: Schema.NullOr(Schema.String),
  seed: Schema.Int,
  jobStatus: Schema.NullOr(JobStatus),
});
export type Slide = typeof Slide.Type;

export const Deck = Schema.Struct({
  id: NonEmpty,
  title: Schema.String,
  aspectRatio: AspectRatio,
  designPresetId: NonEmpty,
  mainDesignPrompt: Schema.String,
  reviewMode: Schema.Boolean,
  createdAt: Epoch,
});
export type Deck = typeof Deck.Type;

export const PromptEdit = Schema.Struct({
  id: NonEmpty,
  target: EditTarget,
  targetId: NonEmpty,
  oldValue: Schema.String,
  newValue: Schema.String,
  /** An optional author rationale shown to the reviewer above the diff. */
  note: Schema.NullOr(Schema.String),
  author: Author,
  status: EditStatus,
  mode: EditMode,
  createdAt: Epoch,
});
export type PromptEdit = typeof PromptEdit.Type;

export const Job = Schema.Struct({
  id: NonEmpty,
  slideId: NonEmpty,
  status: JobStatus,
  error: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Epoch),
  finishedAt: Schema.NullOr(Epoch),
});
export type Job = typeof Job.Type;

/** A deck with everything the editor needs to render in one shot. */
export const DeckDetail = Schema.Struct({
  deck: Deck,
  slides: Schema.Array(Slide),
  pendingEdits: Schema.Array(PromptEdit),
});
export type DeckDetail = typeof DeckDetail.Type;

export const DeckSummary = Schema.Struct({
  id: NonEmpty,
  title: Schema.String,
  slideCount: Schema.Int,
});
export type DeckSummary = typeof DeckSummary.Type;

// ---------------------------------------------------------------------------
// Wire protocol — REST request bodies
// ---------------------------------------------------------------------------

export const CreateDeckRequest = Schema.Struct({
  title: NonEmpty,
  aspectRatio: Schema.optional(AspectRatio),
  designPresetId: Schema.optional(Schema.String),
  /** A user-described visual style. When set, it becomes the deck's main design
   *  prompt directly (a "custom" design), instead of a preset. */
  designPrompt: Schema.optional(Schema.String),
  /** A topic to expand into an outline, or an explicit outline of slide intents. */
  outline: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
});
export type CreateDeckRequest = typeof CreateDeckRequest.Type;

export const EditSlidePromptRequest = Schema.Struct({
  prompt: Schema.String,
  mode: Schema.optional(EditMode),
  note: Schema.optional(Schema.String),
  author: Schema.optional(Author),
});
export type EditSlidePromptRequest = typeof EditSlidePromptRequest.Type;

export const SetDesignPromptRequest = Schema.Struct({
  designPrompt: Schema.String,
  mode: Schema.optional(EditMode),
  note: Schema.optional(Schema.String),
  author: Schema.optional(Author),
});
export type SetDesignPromptRequest = typeof SetDesignPromptRequest.Type;

export const AddSlideRequest = Schema.Struct({
  prompt: Schema.String,
  position: Schema.optional(Schema.Int),
  author: Schema.optional(Author),
});
export type AddSlideRequest = typeof AddSlideRequest.Type;

export const RegenerateRequest = Schema.Struct({
  quality: Schema.optional(Quality),
  reseed: Schema.optional(Schema.Boolean),
});
export type RegenerateRequest = typeof RegenerateRequest.Type;

export const VariationsRequest = Schema.Struct({
  count: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 6 }))),
});
export type VariationsRequest = typeof VariationsRequest.Type;

export const ReorderRequest = Schema.Struct({
  orderedSlideIds: Schema.Array(Schema.String),
});
export type ReorderRequest = typeof ReorderRequest.Type;

export const ResolveEditRequest = Schema.Struct({
  decision: Schema.Literals(["approve", "reject"]),
});
export type ResolveEditRequest = typeof ResolveEditRequest.Type;

export const PickVersionRequest = Schema.Struct({ versionId: NonEmpty });
export type PickVersionRequest = typeof PickVersionRequest.Type;

export const ReviewModeRequest = Schema.Struct({ on: Schema.Boolean });
export type ReviewModeRequest = typeof ReviewModeRequest.Type;

/** Set or clear the OpenAI API key. null/empty clears it (reverts to env/preview). */
export const SetApiKeyRequest = Schema.Struct({
  openaiApiKey: Schema.NullOr(Schema.String),
});
export type SetApiKeyRequest = typeof SetApiKeyRequest.Type;

// ---------------------------------------------------------------------------
// Wire protocol — WebSocket events (server -> client)
// ---------------------------------------------------------------------------

export const ServerEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("deck-changed"), deckId: NonEmpty }),
  Schema.Struct({ type: Schema.Literal("slide-changed"), deckId: NonEmpty, slideId: NonEmpty }),
  Schema.Struct({
    type: Schema.Literal("job-changed"),
    deckId: NonEmpty,
    slideId: NonEmpty,
    job: Job,
  }),
  Schema.Struct({ type: Schema.Literal("mcp-clients"), count: Schema.Int }),
  Schema.Struct({ type: Schema.Literal("pending-edits-changed"), deckId: NonEmpty }),
]);
export type ServerEvent = typeof ServerEvent.Type;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const ServerStatus = Schema.Struct({
  provider: Schema.String,
  model: Schema.String,
  usingMock: Schema.Boolean,
  mcpClients: Schema.Int,
  /** Cap on concurrent generation jobs — surfaced so the UI never hardcodes it. */
  concurrency: Schema.Int,
  jobs: Schema.Struct({
    rendering: Schema.Int,
    thinking: Schema.Int,
    queued: Schema.Int,
  }),
});
export type ServerStatus = typeof ServerStatus.Type;

/** Client-facing settings view — never the full key, only a masked tail. */
export const ServerSettings = Schema.Struct({
  hasKey: Schema.Boolean,
  keyMasked: Schema.NullOr(Schema.String),
  keyFromEnv: Schema.Boolean,
  usingMock: Schema.Boolean,
  forceMock: Schema.Boolean,
  imageModel: Schema.String,
});
export type ServerSettings = typeof ServerSettings.Type;
