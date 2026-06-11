// @effect-diagnostics nodeBuiltinImport:off
import fs from "node:fs";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { config, OPENAI_KEY_PATH, SETTINGS_PATH } from "./Config.ts";

/**
 * Settings — the live, persisted server configuration a user changes at runtime
 * from the app (no env editing): the OpenAI key (image rendering), the Anthropic
 * key, and the deck-building agent's provider + model. Persisted as a 0600 JSON
 * file in the app data dir so it survives restarts and is entered once. The
 * Provider and the agent consult this on every call, so a change takes effect
 * immediately — no restart (AGENTS.md: predictable, reliable).
 *
 * Precedence per field: a UI-entered value (present in the store) is authoritative;
 * an absent field falls back to the matching env var / config default. For keys,
 * an empty string in the store means "explicitly cleared" — but we represent that
 * as removing the field, i.e. clearing reverts to env. SUBSTRATE_FORCE_MOCK always
 * wins for the renderer. We never return full keys to clients, only masked tails.
 */

export type AgentProvider = "anthropic" | "openai";

interface StoredSettings {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  agentProvider?: AgentProvider;
  agentModel?: string;
}

/** The resolved server config the Provider + agent need to make a call. */
export interface ResolvedSettings {
  readonly openaiApiKey: string;
  readonly anthropicApiKey: string;
  readonly usingMock: boolean;
  readonly imageModel: string;
  readonly textModel: string;
  readonly titleModel: string;
  readonly agentProvider: AgentProvider;
  readonly agentModel: string;
}

/** The safe, client-facing view of settings (never the full keys). */
export interface SettingsView {
  readonly hasKey: boolean;
  readonly keyMasked: string | null;
  readonly keyFromEnv: boolean;
  readonly usingMock: boolean;
  readonly forceMock: boolean;
  readonly imageModel: string;
  readonly hasAnthropicKey: boolean;
  readonly anthropicKeyMasked: string | null;
  readonly anthropicKeyFromEnv: boolean;
  readonly agentProvider: AgentProvider;
  readonly agentModel: string;
}

/** A partial update; key fields use empty/null to mean "revert to env". */
export interface SettingsPatch {
  readonly openaiApiKey?: string | null | undefined;
  readonly anthropicApiKey?: string | null | undefined;
  readonly agentProvider?: AgentProvider | undefined;
  readonly agentModel?: string | undefined;
}

export interface SettingsShape {
  readonly resolve: Effect.Effect<ResolvedSettings>;
  readonly view: Effect.Effect<SettingsView>;
  /** Merge a partial update into the store and persist; takes effect at once. */
  readonly update: (patch: SettingsPatch) => Effect.Effect<void>;
}

export class Settings extends Context.Service<Settings, SettingsShape>()("substrate/Settings") {}

// Module-level store: the single source of truth regardless of layer composition.
function readStore(): StoredSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as StoredSettings;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* no JSON store yet */
  }
  // Back-compat: migrate the old single-purpose openai-key file if present.
  try {
    const legacy = fs.readFileSync(OPENAI_KEY_PATH, "utf8").trim();
    if (legacy) return { openaiApiKey: legacy };
  } catch {
    /* none */
  }
  return {};
}
let store: StoredSettings = readStore();

function persist(): void {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
  } catch {
    /* best effort; in-memory value still applies for this launch */
  }
}

function mask(key: string): string | null {
  return key.length > 0 ? `${"•".repeat(8)}${key.slice(-4)}` : null;
}

function resolved(): ResolvedSettings {
  const openaiApiKey = (store.openaiApiKey ?? config.openaiApiKey).trim();
  const anthropicApiKey = (store.anthropicApiKey ?? config.anthropicApiKey).trim();
  return {
    openaiApiKey,
    anthropicApiKey,
    usingMock: config.forceMock || openaiApiKey.length === 0,
    imageModel: config.imageModel,
    textModel: config.textModel,
    titleModel: config.titleModel,
    agentProvider: store.agentProvider ?? config.agentProvider,
    agentModel: store.agentModel ?? config.agentModel,
  };
}

const make = Effect.sync<SettingsShape>(() => ({
  resolve: Effect.sync(resolved),
  view: Effect.sync(() => {
    const r = resolved();
    return {
      hasKey: r.openaiApiKey.length > 0,
      keyMasked: mask(r.openaiApiKey),
      keyFromEnv: store.openaiApiKey === undefined && r.openaiApiKey.length > 0,
      usingMock: r.usingMock,
      forceMock: config.forceMock,
      imageModel: r.imageModel,
      hasAnthropicKey: r.anthropicApiKey.length > 0,
      anthropicKeyMasked: mask(r.anthropicApiKey),
      anthropicKeyFromEnv: store.anthropicApiKey === undefined && r.anthropicApiKey.length > 0,
      agentProvider: r.agentProvider,
      agentModel: r.agentModel,
    };
  }),
  update: (patch) =>
    Effect.sync(() => {
      const next: StoredSettings = { ...store };
      // Keys: empty/null clears the override (revert to env); a value is stored.
      if (patch.openaiApiKey !== undefined) {
        const v = patch.openaiApiKey?.trim() ?? "";
        if (v) next.openaiApiKey = v;
        else delete next.openaiApiKey;
      }
      if (patch.anthropicApiKey !== undefined) {
        const v = patch.anthropicApiKey?.trim() ?? "";
        if (v) next.anthropicApiKey = v;
        else delete next.anthropicApiKey;
      }
      if (patch.agentProvider !== undefined) next.agentProvider = patch.agentProvider;
      if (patch.agentModel !== undefined) {
        const v = patch.agentModel.trim();
        if (v) next.agentModel = v;
        else delete next.agentModel; // revert to the config default
      }
      store = next;
      persist();
    }),
}));

export const SettingsLayer = Layer.effect(Settings, make);
