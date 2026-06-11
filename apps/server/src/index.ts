import { startServer } from "./http.ts";

/**
 * Substrate server entry: composes the Effect runtime (Sqlite, Provider,
 * Generation, Decks, Events), serves the editor over HTTP/WS, and mounts the MCP
 * server (PRD §9). In the desktop build this is spawned by the Electron main.
 */
startServer().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[substrate] fatal:", err);
  process.exit(1);
});
