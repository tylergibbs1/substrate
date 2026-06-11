# Smoke tests

Run the server with the offline mock provider, then exercise the REST + MCP surfaces.

```bash
SUBSTRATE_FORCE_MOCK=1 SUBSTRATE_DATA_DIR=/tmp/substrate-smoke pnpm dev:server
```

## REST

```bash
node scripts/smoke-rest.mjs
```

Creates a deck, edits prompts, exercises review/propose/approve, variations, and export.

## MCP

```bash
pnpm --filter @substrate/server exec node scripts/smoke-mcp.mjs
```

Connects an MCP client over HTTP, creates a deck, and proposes an agent edit —
which lands attributed to `agent:claude-desktop`.

Both print a trailing `OK`.
