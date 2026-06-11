// @effect-diagnostics nodeBuiltinImport:off
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DB_PATH } from "./Config.ts";

/**
 * Sqlite — a thin Effect service over Node's built-in `node:sqlite`. The same
 * choice t3code makes (its `NodeSqliteClient` ports `@effect/sql-sqlite-node`
 * onto `node:sqlite`), so there is no native build step. Owns the schema
 * migration. Image blobs live on disk; rows hold references, not bytes (PRD §10).
 */

export type SqlParam = SQLInputValue;

export class SqliteError extends Data.TaggedError("SqliteError")<{
  readonly sql: string;
  readonly cause: unknown;
}> {}

export interface SqliteShape {
  readonly run: (sql: string, params?: ReadonlyArray<SqlParam>) => Effect.Effect<void>;
  readonly get: <A>(sql: string, params?: ReadonlyArray<SqlParam>) => Effect.Effect<A | undefined>;
  readonly all: <A>(sql: string, params?: ReadonlyArray<SqlParam>) => Effect.Effect<ReadonlyArray<A>>;
  /** Run a synchronous block (used for multi-statement transactions). */
  readonly sync: <A>(f: (db: DatabaseSync) => A) => Effect.Effect<A>;
}

export class Sqlite extends Context.Service<Sqlite, SqliteShape>()("substrate/Sqlite") {}

const MIGRATION = `
CREATE TABLE IF NOT EXISTS design_presets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  design_prompt TEXT NOT NULL, style_ref_blob TEXT, is_default INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, aspect_ratio TEXT NOT NULL,
  design_preset_id TEXT NOT NULL, main_design_prompt TEXT NOT NULL,
  review_mode INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS slides (
  id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL, prompt TEXT NOT NULL, title TEXT, current_version_id TEXT, seed INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slides_deck ON slides(deck_id, order_index);
CREATE TABLE IF NOT EXISTS substrates (
  id TEXT PRIMARY KEY, slide_id TEXT NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL, hash TEXT NOT NULL, author_kind TEXT NOT NULL, author_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_substrates_slide ON substrates(slide_id, created_at);
CREATE TABLE IF NOT EXISTS prompt_edits (
  id TEXT PRIMARY KEY, target TEXT NOT NULL, target_id TEXT NOT NULL,
  old_value TEXT NOT NULL, new_value TEXT NOT NULL, note TEXT, author_kind TEXT NOT NULL, author_id TEXT NOT NULL,
  status TEXT NOT NULL, mode TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edits_target ON prompt_edits(target_id, created_at);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY, slide_id TEXT NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
  substrate_id TEXT NOT NULL, assembled_prompt_hash TEXT NOT NULL, image_blob_ref TEXT,
  seed INTEGER NOT NULL, model TEXT NOT NULL, quality TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_slide ON versions(slide_id, created_at);
CREATE INDEX IF NOT EXISTS idx_versions_cache ON versions(assembled_prompt_hash, model, quality, seed);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, slide_id TEXT NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
  status TEXT NOT NULL, error TEXT, started_at INTEGER, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_slide ON jobs(slide_id);
`;

const make = Effect.gen(function* () {
  const db = yield* Effect.acquireRelease(
    Effect.try({
      try: () => {
        const handle = new DatabaseSync(DB_PATH);
        handle.exec("PRAGMA journal_mode = WAL;");
        handle.exec("PRAGMA foreign_keys = ON;");
        handle.exec(MIGRATION);
        // Additive migrations for existing DBs (SQLite has no ADD COLUMN IF NOT
        // EXISTS) — guard on the live schema so re-running is a no-op.
        const editCols = handle.prepare("PRAGMA table_info(prompt_edits)").all() as Array<{ name: string }>;
        if (!editCols.some((c) => c.name === "note")) {
          handle.exec("ALTER TABLE prompt_edits ADD COLUMN note TEXT");
        }
        const slideCols = handle.prepare("PRAGMA table_info(slides)").all() as Array<{ name: string }>;
        if (!slideCols.some((c) => c.name === "title")) {
          handle.exec("ALTER TABLE slides ADD COLUMN title TEXT");
        }
        return handle;
      },
      catch: (cause) => new SqliteError({ sql: "open", cause }),
    }),
    (handle) => Effect.sync(() => handle.close()),
  );

  const params = (p?: ReadonlyArray<SqlParam>): Array<SqlParam> => (p ? [...p] : []);

  // A SQL failure in a local-first app is a defect (a bug or corrupt DB), not a
  // recoverable domain error — so methods orDie and present a clean E=never API.
  const shape: SqliteShape = {
    run: (sql, p) =>
      Effect.try({
        try: () => {
          db.prepare(sql).run(...params(p));
        },
        catch: (cause) => new SqliteError({ sql, cause }),
      }).pipe(Effect.orDie),
    get: <A>(sql: string, p?: ReadonlyArray<SqlParam>) =>
      Effect.try({
        try: () => db.prepare(sql).get(...params(p)) as unknown as A | undefined,
        catch: (cause) => new SqliteError({ sql, cause }),
      }).pipe(Effect.orDie),
    all: <A>(sql: string, p?: ReadonlyArray<SqlParam>) =>
      Effect.try({
        try: () => db.prepare(sql).all(...params(p)) as unknown as ReadonlyArray<A>,
        catch: (cause) => new SqliteError({ sql, cause }),
      }).pipe(Effect.orDie),
    sync: <A>(f: (db: DatabaseSync) => A) =>
      Effect.try({ try: () => f(db), catch: (cause) => new SqliteError({ sql: "sync", cause }) }).pipe(Effect.orDie),
  };

  return shape;
});

export const SqliteLayer = Layer.effect(Sqlite, make);
