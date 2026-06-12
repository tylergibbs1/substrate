import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import type { AspectRatio, Job, JobStatus, Quality } from "@substrate/contracts";
import { assemblePrompt } from "@substrate/shared/PromptAssembly";
import { config } from "./Config.ts";
import { Sqlite } from "./Sqlite.ts";
import { Provider } from "./Provider.ts";
import { Events } from "./Events.ts";
import { blobExists, hash, id, newSeed, now, writeBlob } from "./util.ts";

/**
 * Generation (PRD §6.2, §12). Queues and runs one async job per slide against
 * the provider, assembling (main design prompt + slide prompt) server-side, with
 * a concurrency cap (a Semaphore) and a cache keyed on assembled-prompt-hash +
 * model + quality + seed so unchanged slides are never re-billed.
 */

interface SlideRow {
  readonly id: string;
  readonly deck_id: string;
  readonly prompt: string;
  readonly seed: number;
}
interface DeckRow {
  readonly id: string;
  readonly aspect_ratio: string;
  readonly main_design_prompt: string;
  readonly design_preset_id: string;
}
interface JobRow {
  readonly id: string;
  readonly slide_id: string;
  readonly status: string;
  readonly error: string | null;
  readonly started_at: number | null;
  readonly finished_at: number | null;
}

export interface GenerationShape {
  readonly enqueueRender: (
    slideId: string,
    opts?: { quality?: Quality | undefined; reseed?: boolean | undefined },
  ) => Effect.Effect<string>;
  readonly generateVariations: (
    slideId: string,
    count: number,
  ) => Effect.Effect<ReadonlyArray<{ versionId: string; imageBlobRef: string; seed: number }>>;
  readonly jobStats: Effect.Effect<{ rendering: number; thinking: number; queued: number }>;
}

export class Generation extends Context.Service<Generation, GenerationShape>()("substrate/Generation") {}

const mapJob = (r: JobRow): Job => ({
  id: r.id,
  slideId: r.slide_id,
  status: r.status as JobStatus,
  error: r.error,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

const make = Effect.gen(function* () {
  const sql = yield* Sqlite;
  const provider = yield* Provider;
  const events = yield* Events;
  const semaphore = yield* Semaphore.make(config.concurrency);

  const emitJob = (deckId: string, slideId: string, jobId: string) =>
    Effect.gen(function* () {
      const row = yield* sql.get<JobRow>("SELECT * FROM jobs WHERE id = ?", [jobId]);
      if (row) yield* events.publish({ type: "job-changed", deckId, slideId, job: mapJob(row) });
    });

  const setJobStatus = (jobId: string, status: JobStatus, error?: string) =>
    status === "done" || status === "error"
      ? sql.run("UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?", [
          status,
          error ?? null,
          now(),
          jobId,
        ])
      : sql.run("UPDATE jobs SET status = ?, error = ? WHERE id = ?", [status, error ?? null, jobId]);

  const runJob = (jobId: string, slideId: string, quality: Quality) =>
    Effect.gen(function* () {
      const slide = yield* sql.get<SlideRow>("SELECT id, deck_id, prompt, seed FROM slides WHERE id = ?", [slideId]);
      if (!slide) {
        yield* setJobStatus(jobId, "error", "slide deleted");
        return;
      }
      const deck = yield* sql.get<DeckRow>(
        "SELECT id, aspect_ratio, main_design_prompt, design_preset_id FROM decks WHERE id = ?",
        [slide.deck_id],
      );
      if (!deck) {
        yield* setJobStatus(jobId, "error", "deck deleted");
        return;
      }

      const assembled = assemblePrompt(deck.main_design_prompt, slide.prompt);
      const assembledHash = hash(`${assembled}|${quality}`);
      // The active model is part of the cache key, so switching providers (e.g.
      // after entering an API key) correctly misses the preview-render cache.
      const { model: activeModel } = yield* provider.info;

      yield* sql.run("UPDATE jobs SET started_at = ? WHERE id = ?", [now(), jobId]);
      yield* setJobStatus(jobId, quality === "thinking" ? "thinking" : "rendering");
      yield* emitJob(deck.id, slide.id, jobId);

      // Cache hit — never re-bill an unchanged slide (PRD §12).
      const cached = yield* sql.get<{ id: string; image_blob_ref: string | null }>(
        "SELECT id, image_blob_ref FROM versions WHERE assembled_prompt_hash = ? AND model = ? AND quality = ? AND seed = ? AND image_blob_ref IS NOT NULL ORDER BY created_at DESC LIMIT 1",
        [assembledHash, activeModel, quality, slide.seed],
      );
      if (cached && blobExists(cached.image_blob_ref)) {
        yield* sql.run("UPDATE slides SET current_version_id = ? WHERE id = ?", [cached.id, slide.id]);
        yield* setJobStatus(jobId, "done");
        yield* emitJob(deck.id, slide.id, jobId);
        yield* events.publish({ type: "slide-changed", deckId: deck.id, slideId: slide.id });
        return;
      }

      const result = yield* provider
        .render({
          assembledPrompt: assembled,
          aspectRatio: deck.aspect_ratio as AspectRatio,
          quality,
          seed: slide.seed,
        })
        .pipe(
          Effect.map((value) => ({ ok: true as const, value })),
          Effect.catch((e) => Effect.succeed({ ok: false as const, message: e.message })),
        );

      if (!result.ok) {
        yield* setJobStatus(jobId, "error", result.message);
        yield* emitJob(deck.id, slide.id, jobId);
        return;
      }

      const blobRef = yield* sql.sync(() => writeBlob(result.value.bytes, result.value.ext));
      const substrate = yield* sql.get<{ id: string }>(
        "SELECT id FROM substrates WHERE slide_id = ? ORDER BY created_at DESC LIMIT 1",
        [slide.id],
      );
      const versionId = id("ver");
      yield* sql.run(
        "INSERT INTO versions (id, slide_id, substrate_id, assembled_prompt_hash, image_blob_ref, seed, model, quality, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [versionId, slide.id, substrate?.id ?? "unknown", assembledHash, blobRef, slide.seed, result.value.model, quality, now()],
      );
      yield* sql.run("UPDATE slides SET current_version_id = ? WHERE id = ?", [versionId, slide.id]);
      yield* setJobStatus(jobId, "done");
      yield* emitJob(deck.id, slide.id, jobId);
      yield* events.publish({ type: "slide-changed", deckId: deck.id, slideId: slide.id });
    });

  const enqueueRender: GenerationShape["enqueueRender"] = (slideId, opts = {}) =>
    Effect.gen(function* () {
      const slide = yield* sql.get<SlideRow>("SELECT id, deck_id, prompt, seed FROM slides WHERE id = ?", [slideId]);
      if (!slide) return "";

      // Coalesce: if a render for this slide is already queued (not yet started),
      // reuse it rather than piling on a duplicate — guards rapid R / overlapping
      // edits. A reseed always gets a fresh job (it intends a different output).
      if (!opts.reseed) {
        const pending = yield* sql.get<{ id: string }>(
          "SELECT id FROM jobs WHERE slide_id = ? AND status = 'queued' AND started_at IS NULL ORDER BY rowid DESC LIMIT 1",
          [slideId],
        );
        if (pending) return pending.id;
      }

      if (opts.reseed) yield* sql.run("UPDATE slides SET seed = ? WHERE id = ?", [newSeed(), slideId]);

      const jobId = id("job");
      yield* sql.run("INSERT INTO jobs (id, slide_id, status, error, started_at, finished_at) VALUES (?, ?, 'queued', NULL, NULL, NULL)", [jobId, slideId]);
      yield* emitJob(slide.deck_id, slideId, jobId);

      const quality: Quality = opts.quality ?? "instant";
      // Fork a detached fiber guarded by the concurrency semaphore (PRD §6.2).
      yield* Effect.forkDetach(Semaphore.withPermits(semaphore, 1, runJob(jobId, slideId, quality)));
      return jobId;
    });

  const generateVariations: GenerationShape["generateVariations"] = (slideId, count) =>
    Effect.gen(function* () {
      const slide = yield* sql.get<SlideRow>("SELECT id, deck_id, prompt, seed FROM slides WHERE id = ?", [slideId]);
      if (!slide) return [];
      const deck = yield* sql.get<DeckRow>(
        "SELECT id, aspect_ratio, main_design_prompt, design_preset_id FROM decks WHERE id = ?",
        [slide.deck_id],
      );
      if (!deck) return [];
      const assembled = assemblePrompt(deck.main_design_prompt, slide.prompt);
      const assembledHash = hash(`${assembled}|instant`);
      const substrate = yield* sql.get<{ id: string }>(
        "SELECT id FROM substrates WHERE slide_id = ? ORDER BY created_at DESC LIMIT 1",
        [slide.id],
      );

      const seeds = Array.from({ length: count }, () => newSeed());
      // Render each variation independently: one provider failure must not discard
      // the siblings that did succeed (the old forEach short-circuited the whole
      // batch on the first error, then swallowed it to []). Collect the successes;
      // log every failure so a total wipeout isn't silent. Partial success returns
      // what landed; the caller treats an empty result as "none could be made".
      const outcomes = yield* Effect.forEach(
        seeds,
        (seed) =>
          Effect.gen(function* () {
            const result = yield* provider.render({
              assembledPrompt: assembled,
              aspectRatio: deck.aspect_ratio as AspectRatio,
              quality: "instant",
              seed,
            });
            const blobRef = yield* sql.sync(() => writeBlob(result.bytes, result.ext));
            const versionId = id("ver");
            yield* sql.run(
              "INSERT INTO versions (id, slide_id, substrate_id, assembled_prompt_hash, image_blob_ref, seed, model, quality, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'instant', ?)",
              [versionId, slide.id, substrate?.id ?? "unknown", assembledHash, blobRef, seed, result.model, now()],
            );
            return { versionId, imageBlobRef: blobRef, seed };
          }).pipe(
            // Isolate each render: a provider failure on one seed logs and yields
            // null, leaving its siblings untouched (DB-write failures still orDie
            // as the defects they are — this only absorbs the recoverable render E).
            Effect.catch((e) =>
              Effect.gen(function* () {
                yield* Effect.logWarning(`generateVariations: render failed for slide ${slideId}: ${e.message}`);
                return null;
              }),
            ),
          ),
        { concurrency: config.concurrency },
      );
      return outcomes.filter((o) => o !== null);
    });

  const jobStats: GenerationShape["jobStats"] = Effect.gen(function* () {
    const rows = yield* sql.all<{ status: string; c: number }>(
      "SELECT status, COUNT(*) c FROM jobs WHERE finished_at IS NULL GROUP BY status",
    );
    const map = new Map(rows.map((r) => [r.status, r.c]));
    return { rendering: map.get("rendering") ?? 0, thinking: map.get("thinking") ?? 0, queued: map.get("queued") ?? 0 };
  });

  // Resume jobs orphaned by a crash or restart. The render workers are in-memory
  // detached fibers, so a process exit leaves their jobs unfinished in the DB with
  // no one to run them — a slide stuck on "rendering"/"queued" forever. On startup,
  // reset every unfinished job and re-run it under the concurrency cap (reliability:
  // behavior stays predictable across restarts and partial renders).
  yield* Effect.gen(function* () {
    const orphans = yield* sql.all<{ id: string; slide_id: string }>(
      "SELECT id, slide_id FROM jobs WHERE finished_at IS NULL ORDER BY rowid",
    );
    if (orphans.length > 0) yield* Effect.logInfo(`resuming ${orphans.length} render job(s) orphaned by restart`);
    for (const o of orphans) {
      yield* sql.run("UPDATE jobs SET status = 'queued', started_at = NULL WHERE id = ?", [o.id]);
      yield* Effect.forkDetach(Semaphore.withPermits(semaphore, 1, runJob(o.id, o.slide_id, "instant")));
    }
  });

  return { enqueueRender, generateVariations, jobStats };
});

export const GenerationLayer = Layer.effect(Generation, make);
