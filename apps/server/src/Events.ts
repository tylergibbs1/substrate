import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import type { ServerEvent } from "@substrate/contracts";

/**
 * Events — an Effect `PubSub` of domain events (PRD §6.2). The HTTP/WS layer
 * subscribes and forwards to connected editor clients, so jobs and prompt edits
 * stream live, and both human and agent edits reach the UI in real time.
 */

export interface EventsShape {
  readonly publish: (event: ServerEvent) => Effect.Effect<void>;
  readonly pubsub: PubSub.PubSub<ServerEvent>;
}

export class Events extends Context.Service<Events, EventsShape>()("substrate/Events") {}

export const EventsLayer = Layer.effect(
  Events,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<ServerEvent>();
    return {
      pubsub,
      publish: (event) => Effect.asVoid(PubSub.publish(pubsub, event)),
    };
  }),
);
