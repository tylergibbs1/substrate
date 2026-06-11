# AGENTS.md

## Task Completion Requirements

- `pnpm typecheck` (runs `tsgo --noEmit` in every package) must pass before a task is considered complete.
- `pnpm lint` (oxlint) should pass.
- When you change generation, persistence, or the MCP surface, run the smoke tests in `docs/SMOKE.md`.

## Project Snapshot

Substrate is a desktop app for AI-generated raster slide decks. The product's
one idea: **the prompt is the only editable artifact.** An image model returns
pixels, which cannot be diffed, reviewed, or co-authored — so Substrate never
makes pixels editable. The only editable surfaces are two prompts:

- a per-slide prompt (the slide's _substrate_), and
- a deck-level _main design prompt_, injected ahead of every slide prompt.

A human edits them in the UI; an agent edits the same prompts over MCP. The
image is a pure build output. There is no overlay, layer, or object concept.

Stack and conventions are modeled on [pingdotgg/t3code](https://github.com/pingdotgg/t3code).

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (provider errors,
   reconnects, partial renders, concurrent human+agent edits).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long-term maintainability is a core priority. Before adding functionality, check
whether shared logic can be extracted into a module. Duplicated logic across
files is a code smell. Don't take shortcuts by adding local logic where a shared
service belongs.

## Effect conventions (from t3code)

- Use **namespace imports**: `import * as Effect from "effect/Effect"`, never barrel imports.
- Use **`effect/Schema`** for all data contracts. `packages/contracts` is schema-only — no runtime logic.
- Services are `Context.Service` tags provided by a `Layer`. Compose layers; don't reach for globals.
- No global `Date`, `Math.random`, `crypto.randomUUID`, `fetch`, or `console` —
  use the Effect equivalents (`DateTime`, `Effect.sync` wrappers, `HttpClient`,
  `Effect.log`). The `@effect/language-service` plugin enforces this in-editor.
- Relative imports use explicit `.ts` extensions (NodeNext + `rewriteRelativeImportExtensions`).
- The server runs on Node's native TypeScript execution (`node --watch src/index.ts`)
  and persists via Node's built-in `node:sqlite`.

## Package Roles

- `apps/server`: Effect Node server. Orchestrates generation against the image
  provider, persists to `node:sqlite`, serves the editor over HTTP/WS, and hosts
  the MCP server.
- `apps/web`: React/Vite editor UI. Owns deck/slide UX and client state.
- `apps/desktop`: Electron shell.
- `packages/contracts`: shared `effect/Schema` schemas — schema only, no runtime logic.
- `packages/shared`: shared runtime utilities via explicit subpath exports (no barrel index).
- `packages/runtime` / `ssh` / `tailscale`: extraction points / remote-access helpers (stubs).

## Web styling (Tailwind v4)

- Colors are defined in `@theme` in `apps/web/src/index.css` and used as **named
  utilities** (`bg-accent`, `text-fg-faint`, `border-line-2`) — the t3code pattern.
- Do NOT use the v3 shorthand `bg-[--color-x]`; in Tailwind v4 it does not resolve
  and the style silently drops (the background just goes transparent). Use the
  named utility, or `bg-(--color-x)` for a raw variable. `color-mix(… var(--color-x) …)`
  and literal `[#hex]` arbitrary values are fine.
- Component variants use `class-variance-authority`; merge classes with `cn`
  (`tailwind-merge`). Interactive primitives come from Base UI (`@base-ui/react`).

## Design principles (Linear-modeled, PRD §7)

The UI is product judgment, not decoration. Keep visual weight a ranking system:
the rendered slide dominates, the active prompt is the work surface, all chrome
(rail, inspector, status bar) recedes. Borders/icons/separators earn their place
or get cut. Quality is a habit — fix papercuts as real work, verify in-browser.

## Accepted Constraints (do not "fix" with editable layers)

Pure raster output has real costs that are deliberate scope, not gaps:
- Slide text is not selectable — the slide prompt is the text-of-record.
- The model can render a wrong number — v1 scopes away from data-critical decks.
- Iterating re-renders the whole slide — a pinned seed keeps the look stable.
