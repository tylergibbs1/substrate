// @effect-diagnostics nodeBuiltinImport:off cryptoRandomUUID:off globalDate:off globalRandom:off
import { createHash, randomUUID, randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BLOBS_DIR } from "./Config.ts";

/**
 * Pure helpers. These run outside the Effect context (called from inside
 * `Effect.sync` blocks in the services), so plain Node builtins are fine here.
 */

export function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function now(): number {
  return Date.now();
}

export function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

export function newSeed(): number {
  return randomInt(1, 2_000_000_000);
}

/** Write bytes to the blob store and return the on-disk reference filename. */
export function writeBlob(bytes: Buffer, ext: string): string {
  const ref = `${id("blob")}.${ext}`;
  fs.writeFileSync(path.join(BLOBS_DIR, ref), bytes);
  return ref;
}

export function blobPath(ref: string): string {
  return path.join(BLOBS_DIR, ref);
}

export function blobExists(ref: string | null): boolean {
  return !!ref && fs.existsSync(blobPath(ref));
}
