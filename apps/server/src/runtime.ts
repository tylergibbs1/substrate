import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { SqliteLayer } from "./Sqlite.ts";
import { SettingsLayer } from "./Settings.ts";
import { ProviderLayer } from "./Provider.ts";
import { EventsLayer } from "./Events.ts";
import { AgentActivityLayer } from "./AgentActivity.ts";
import { GenerationLayer } from "./Generation.ts";
import { DecksLayer } from "./Decks.ts";

/**
 * The application layer, composed t3code-style: `Context.Service` tags provided
 * by `Layer`s, wired into one runtime. The HTTP/WS transport and the MCP server
 * bridge into this runtime at the edges so request handlers run real Effects.
 *
 * `SettingsLayer` is both a published service (the settings endpoints) and the
 * Provider's dependency. Effect memoizes layers by reference, so both see the
 * same instance — a key entered in the UI is live for the next render.
 */

const ProviderWithSettings = Layer.provide(ProviderLayer, SettingsLayer);
const Infra = Layer.mergeAll(SqliteLayer, SettingsLayer, ProviderWithSettings, EventsLayer);
const GenerationWithInfra = Layer.provide(GenerationLayer, Infra);
// AgentActivity depends only on Events (from Infra); it publishes the
// "an agent is at the controls" presence events the editor reacts to.
const AgentActivityWithInfra = Layer.provide(AgentActivityLayer, Infra);
const Services = Layer.mergeAll(Infra, GenerationWithInfra, AgentActivityWithInfra);
const DecksWithServices = Layer.provide(DecksLayer, Services);

export const AppLayer = Layer.mergeAll(Services, DecksWithServices);

export const runtime = ManagedRuntime.make(AppLayer);
