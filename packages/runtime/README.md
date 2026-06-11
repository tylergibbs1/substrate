# @substrate/runtime

Shared services, modeled on t3code's Effect runtime layer (PRD §9). Stub.

This slice keeps the server's services (generation, decks, providers, events)
co-located in `apps/server/src` for directness. The extraction point is here:
the `ProviderAdapter` / `TextAdapter` interfaces and the generation queue are
the natural first move into a shared runtime package, with Effect 4.x layering
added when a second app (mobile viewer) needs the same services.
