# Architecture

Substrate is a TypeScript monorepo (pnpm workspaces, ESM, Node `^24.13.1`),
structured and stacked like [t3code](https://github.com/pingdotgg/t3code).

```
apps/
  server/     Effect Node server: generation orchestration, node:sqlite persistence, HTTP/WS, MCP
  web/        React 19 + Vite + Tailwind v4 editor (the three-panel UI)
  desktop/    Electron shell
  mobile/     Expo viewer — post-v1 stub
  marketing/  Astro site — stub
packages/
  contracts/  effect/Schema schemas — schema only, no runtime logic
  shared/     shared runtime utilities (subpath exports, no barrel)
  runtime/    shared-services extraction point — stub
  ssh/        remote MCP access helpers — stub
  tailscale/  remote MCP access helpers — stub
```

## Server (Effect)

The server is built on **Effect 4** with namespace imports throughout. Its shape
mirrors t3code's: `Context.Service` tags provided by `Layer`s, composed into a
single application layer and run with `@effect/platform-node`'s `NodeRuntime`.

Services:

- **`Sqlite`** — a thin Effect service over Node's built-in `node:sqlite`
  (`packages`-free persistence, the same choice t3code makes with its
  `NodeSqliteClient`). Owns the schema migration and prepared queries.
- **`Provider`** — the image/text model abstraction (`ProviderAdapter`). Ships a
  GPT Image 2 adapter and a deterministic offline mock, selected by config.
- **`Generation`** — the job queue: assembles `mainDesignPrompt + slidePrompt`,
  enforces a concurrency cap, caches on assembled-hash + model + quality + seed.
- **`Decks`** — the domain service that mutates the two editable artifacts. Both
  the HTTP API and the MCP server call through it, so a human edit and an agent
  edit travel the exact same path with attribution.
- **`Events`** — an Effect `PubSub` of domain events streamed to editor clients
  over WebSocket.

The HTTP/WS transport and the MCP server bridge into the Effect runtime at the
edges via a `ManagedRuntime`, so request handlers run real Effect programs.

## Persistence (`node:sqlite`)

No native build step — `node:sqlite` is built into Node 24. Image blobs are
files under the app data dir; rows hold references, not bytes. No overlay or
layer tables, by design.

## Contracts (`effect/Schema`)

Every wire and domain type is an `effect/Schema` schema. The package is
schema-only; encode/decode and validation live with the consumers.

## Web

React 19 + Vite + Tailwind v4, Base UI primitives, DM Sans + JetBrains Mono,
lucide-react, dnd-kit, TanStack Query + Zustand for state, `tsgo` for
typechecking. (All of these are part of the t3code web stack.)
