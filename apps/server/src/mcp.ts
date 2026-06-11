#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "./mcp-server.ts";

/**
 * Stdio MCP entry point — what spawn-based clients (e.g. Claude Desktop) launch.
 * Shares the local node:sqlite store and the Effect runtime with the app. The
 * app also mounts MCP over HTTP at /mcp for fully live in-process sharing.
 *
 * Register in a client's config as:
 *   { "command": "pnpm", "args": ["--filter", "@substrate/server", "mcp"] }
 */
const agentName = process.env.SUBSTRATE_AGENT_NAME ?? "claude-desktop";

async function main(): Promise<void> {
  const server = buildMcpServer(agentName);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[substrate-mcp] fatal:", err);
  process.exit(1);
});
