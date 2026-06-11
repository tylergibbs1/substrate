// @effect-diagnostics nodeBuiltinImport:off cryptoRandomUUID:off
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

/**
 * Local-first storage layout (PRD §13). Image blobs are files on disk; the DB
 * holds references, not bytes (PRD §10). Plain module rather than a service —
 * it reads the environment once at boot.
 */

const APP_DIR_NAME = "substrate";

function defaultDataDir(): string {
  if (process.env.SUBSTRATE_DATA_DIR) return process.env.SUBSTRATE_DATA_DIR;
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", APP_DIR_NAME);
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), APP_DIR_NAME);
    default:
      return path.join(process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), APP_DIR_NAME);
  }
}

export const DATA_DIR = defaultDataDir();
export const BLOBS_DIR = path.join(DATA_DIR, "blobs");
export const DB_PATH = path.join(DATA_DIR, "substrate.sqlite");
const TOKEN_PATH = path.join(DATA_DIR, "mcp-token");
/** Where a UI-entered OpenAI key is persisted (mode 0600). See Settings.ts. */
export const OPENAI_KEY_PATH = path.join(DATA_DIR, "openai-key");
/** JSON store for all in-app-tweakable settings (keys, agent provider/model). */
export const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

fs.mkdirSync(BLOBS_DIR, { recursive: true });

/**
 * Bearer token for the local MCP server (mandrel pattern). Persisted across
 * launches in the app data dir (mode 0600) so a user adds Substrate to their AI
 * client once and it keeps working on every restart. `SUBSTRATE_MCP_TOKEN`
 * overrides; otherwise generate-and-persist on first launch.
 */
function loadOrCreateMcpToken(): string {
  if (process.env.SUBSTRATE_MCP_TOKEN) return process.env.SUBSTRATE_MCP_TOKEN;
  try {
    const existing = fs.readFileSync(TOKEN_PATH, "utf8").trim();
    if (existing.length > 0) return existing;
  } catch {
    // not yet created
  }
  const fresh = randomUUID();
  try {
    fs.writeFileSync(TOKEN_PATH, fresh, { mode: 0o600 });
  } catch {
    // best-effort; falls back to in-memory token for this launch
  }
  return fresh;
}

export const config = {
  httpPort: Number(process.env.SUBSTRATE_PORT ?? 4321),
  /** Cap on concurrent generation jobs (PRD §6.2). */
  concurrency: Number(process.env.SUBSTRATE_CONCURRENCY ?? 4),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  /** Pinned production snapshot so behavior does not shift mid-batch (PRD §12). */
  imageModel: process.env.SUBSTRATE_IMAGE_MODEL ?? "gpt-image-2-2026-04-21",
  textModel: process.env.SUBSTRATE_TEXT_MODEL ?? "gpt-5.1",
  /** Small/cheap model for deriving short slide titles in the rail. */
  titleModel: process.env.SUBSTRATE_TITLE_MODEL ?? "gpt-5-mini-2025-08-07",
  /** Deck-building agent provider + model (via the Vercel AI SDK, so it's swappable).
   *  Anthropic Claude is the default — stronger at design. Image rendering always
   *  uses OpenAI (gpt-image-2) regardless of this. */
  agentProvider: (process.env.SUBSTRATE_AGENT_PROVIDER ?? "anthropic") as "anthropic" | "openai",
  agentModel: process.env.SUBSTRATE_AGENT_MODEL ?? "claude-opus-4-8",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  forceMock: process.env.SUBSTRATE_FORCE_MOCK === "1",
  /** Artificial delay for the mock renderer (ms) — lets dev see loading states. */
  mockDelayMs: Number(process.env.SUBSTRATE_MOCK_DELAY_MS ?? 0),
  /** MCP bearer token (loopback). Required on every /mcp request. */
  mcpToken: loadOrCreateMcpToken(),
} as const;

/** True when we have no usable image provider and must fall back to the mock. */
export const usingMockProvider = config.forceMock || config.openaiApiKey.length === 0;
