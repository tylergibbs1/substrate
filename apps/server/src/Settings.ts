// @effect-diagnostics nodeBuiltinImport:off
import fs from "node:fs";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { config, OPENAI_KEY_PATH } from "./Config.ts";

/**
 * Settings — the live, persisted server configuration a user can change at
 * runtime (today: the OpenAI API key). Persisted to a 0600 file in the app data
 * dir so it survives restarts and the user enters it once. The Provider consults
 * this on every call, so saving a key switches from the offline preview renderer
 * to GPT Image 2 immediately — no restart (AGENTS.md: predictable, reliable).
 *
 * Precedence: a UI-entered key (the override file, once written) is authoritative
 * — including an empty value, which means "use the preview renderer". Before any
 * override is written we fall back to the OPENAI_API_KEY env var. SUBSTRATE_FORCE_MOCK
 * always wins. We never return the full key to clients, only a masked tail.
 */

/** The resolved server config the Provider needs to make a call. */
export interface ResolvedSettings {
  readonly openaiApiKey: string;
  readonly usingMock: boolean;
  readonly imageModel: string;
  readonly textModel: string;
  readonly titleModel: string;
}

/** The safe, client-facing view of settings (never the full key). */
export interface SettingsView {
  readonly hasKey: boolean;
  /** e.g. "••••••••cdef" — last 4 chars only, or null when no key is set. */
  readonly keyMasked: string | null;
  /** True when the active key comes from OPENAI_API_KEY (env), not the UI. */
  readonly keyFromEnv: boolean;
  readonly usingMock: boolean;
  /** True when SUBSTRATE_FORCE_MOCK pins the preview renderer regardless of key. */
  readonly forceMock: boolean;
  readonly imageModel: string;
}

export interface SettingsShape {
  readonly resolve: Effect.Effect<ResolvedSettings>;
  readonly view: Effect.Effect<SettingsView>;
  /** Persist (or clear, with null/empty) the OpenAI key; takes effect at once. */
  readonly setApiKey: (key: string | null) => Effect.Effect<void>;
}

export class Settings extends Context.Service<Settings, SettingsShape>()("substrate/Settings") {}

// Module-level holder so there is exactly one source of truth regardless of how
// the layer is composed: `null` = no override written yet (fall back to env);
// a string (possibly "") = the user's explicit choice.
function readOverride(): string | null {
  try {
    return fs.readFileSync(OPENAI_KEY_PATH, "utf8");
  } catch {
    return null;
  }
}
let override: string | null = readOverride();

function persist(value: string | null): void {
  if (value === null) {
    try {
      fs.rmSync(OPENAI_KEY_PATH, { force: true });
    } catch {
      /* best effort */
    }
    return;
  }
  try {
    fs.writeFileSync(OPENAI_KEY_PATH, value, { mode: 0o600 });
  } catch {
    /* best effort; falls back to the in-memory value for this launch */
  }
}

function resolved(): ResolvedSettings {
  const raw = override !== null ? override : config.openaiApiKey;
  const openaiApiKey = raw.trim();
  return {
    openaiApiKey,
    usingMock: config.forceMock || openaiApiKey.length === 0,
    imageModel: config.imageModel,
    textModel: config.textModel,
    titleModel: config.titleModel,
  };
}

const make = Effect.sync<SettingsShape>(() => ({
  resolve: Effect.sync(resolved),
  view: Effect.sync(() => {
    const r = resolved();
    const fromEnv = override === null && r.openaiApiKey.length > 0;
    return {
      hasKey: r.openaiApiKey.length > 0,
      keyMasked: r.openaiApiKey.length > 0 ? `${"•".repeat(8)}${r.openaiApiKey.slice(-4)}` : null,
      keyFromEnv: fromEnv,
      usingMock: r.usingMock,
      forceMock: config.forceMock,
      imageModel: config.imageModel,
    };
  }),
  setApiKey: (key) =>
    Effect.sync(() => {
      const trimmed = key?.trim() ?? "";
      // Clearing removes the override file and reverts to the env key (if any),
      // otherwise the preview renderer. A non-empty value is persisted verbatim.
      override = trimmed.length === 0 ? null : trimmed;
      persist(override);
    }),
}));

export const SettingsLayer = Layer.effect(Settings, make);
