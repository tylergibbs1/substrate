// @effect-diagnostics nodeBuiltinImport:off cryptoRandomUUID:off
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import {
  AddSlideRequest,
  CreateDeckRequest,
  EditSlidePromptRequest,
  PickVersionRequest,
  RegenerateRequest,
  ReorderRequest,
  ResolveEditRequest,
  ReviewModeRequest,
  SetApiKeyRequest,
  SetDesignPromptRequest,
  VariationsRequest,
  type ExportFormat,
  type ServerEvent,
} from "@substrate/contracts";
import { config } from "./Config.ts";
import { blobExists, blobPath } from "./util.ts";
import { buildMcpServer } from "./mcp-server.ts";
import { Decks } from "./Decks.ts";
import { Provider } from "./Provider.ts";
import { Generation } from "./Generation.ts";
import { Events } from "./Events.ts";
import { Settings } from "./Settings.ts";
import { runtime } from "./runtime.ts";

/**
 * HTTP + WebSocket transport. Decodes request bodies with effect/Schema, runs
 * `Decks` Effects on the shared runtime, serves image blobs, streams domain
 * events to editor clients over WS, and mounts the MCP server live in-process at
 * /mcp (PRD §6.2, §6.5).
 */

const CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};


function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, x-agent-name",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

type AppServices = Decks | Generation | Provider | Events | Settings;

const run = <A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> => runtime.runPromise(effect);

const decodeAnd = <S extends Schema.Top, A, E>(
  schema: S,
  body: unknown,
  f: (decoded: S["Type"]) => Effect.Effect<A, E, AppServices>,
): Promise<A> => {
  // Request schemas have no decoding services; cast keeps the bridge generic.
  const decoded = Schema.decodeUnknownEffect(schema)(body) as Effect.Effect<S["Type"], unknown>;
  return runtime.runPromise(decoded.pipe(Effect.flatMap(f)));
};

/**
 * Serve the built web app over loopback so the desktop shell loads it from the
 * same origin as the API/WS/blobs (the mandrel pattern) — keeping the editor's
 * relative `/api`, `/blobs`, `/ws` calls working in a packaged build instead of
 * breaking under `file://`. No-op (returns false) when the build is absent (dev).
 */
const WEB_DIST = path.resolve(import.meta.dirname, "../../web/dist");
const STATIC_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  json: "application/json",
  map: "application/json",
};

function serveStatic(res: http.ServerResponse, pathname: string): boolean {
  const indexHtml = path.join(WEB_DIST, "index.html");
  if (!fs.existsSync(indexHtml)) return false;
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let file = path.join(WEB_DIST, rel);
  // No traversal outside the dist root; unknown paths fall back to the SPA shell.
  if (!file.startsWith(WEB_DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = indexHtml;
  }
  const ext = file.split(".").pop() ?? "";
  res.writeHead(200, { "content-type": STATIC_TYPES[ext] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
  return true;
}

function serveBlob(res: http.ServerResponse, ref: string): void {
  if (!blobExists(ref)) {
    json(res, 404, { error: "blob not found" });
    return;
  }
  const ext = ref.split(".").pop() ?? "bin";
  res.writeHead(200, {
    "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "access-control-allow-origin": "*",
  });
  fs.createReadStream(blobPath(ref)).pipe(res);
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const p = url.pathname;
  const method = req.method ?? "GET";
  const seg = p.split("/").filter(Boolean);

  if (p === "/api/status" && method === "GET") {
    const status = await run(
      Effect.gen(function* () {
        const provider = yield* Provider;
        const generation = yield* Generation;
        const jobs = yield* generation.jobStats;
        const info = yield* provider.info;
        return {
          provider: info.name,
          model: info.model,
          usingMock: info.usingMock,
          mcpClients: mcpSessions.size,
          concurrency: config.concurrency,
          mcpUrl: `http://localhost:${config.httpPort}/mcp`,
          mcpToken: config.mcpToken,
          jobs,
        };
      }),
    );
    return json(res, 200, status);
  }
  if (p === "/api/settings" && method === "GET") {
    return json(res, 200, await run(Effect.flatMap(Settings, (s) => s.view)));
  }
  if (p === "/api/settings" && method === "POST") {
    const body = await readBody(req);
    // Persist the key (or clear it), then return the fresh masked view so the UI
    // reflects the live provider immediately.
    const view = await decodeAnd(SetApiKeyRequest, body, (b) =>
      Effect.flatMap(Settings, (s) => Effect.flatMap(s.setApiKey(b.openaiApiKey), () => s.view)),
    );
    return json(res, 200, view);
  }
  if (p === "/api/presets" && method === "GET") return json(res, 200, await run(Effect.flatMap(Decks, (d) => d.listPresets)));
  if (p === "/api/decks" && method === "GET") return json(res, 200, await run(Effect.flatMap(Decks, (d) => d.listDecks)));
  if (p === "/api/decks" && method === "POST") {
    const body = await readBody(req);
    const result = await decodeAnd(CreateDeckRequest, body, (b) =>
      Effect.flatMap(Decks, (d) =>
        d.createDeck({
          title: b.title,
          aspectRatio: b.aspectRatio ?? "16:9",
          designPresetId: b.designPresetId,
          designPrompt: b.designPrompt,
          outline: b.outline,
        }),
      ),
    );
    return json(res, 201, result);
  }

  if (seg[0] === "api" && seg[1] === "decks" && seg[2]) {
    const deckId = seg[2];
    const sub = seg[3];
    if (!sub && method === "GET") {
      const detail = await run(Effect.flatMap(Decks, (d) => d.getDeckDetail(deckId)));
      return detail ? json(res, 200, detail) : json(res, 404, { error: "deck not found" });
    }
    if (sub === "design" && method === "POST") {
      const body = await readBody(req);
      return json(
        res,
        200,
        await decodeAnd(SetDesignPromptRequest, body, (b) =>
          Effect.flatMap(Decks, (d) => d.setDesignPrompt(deckId, b.designPrompt, b.mode ?? "direct", b.author, b.note)),
        ),
      );
    }
    if (sub === "slides" && method === "POST") {
      const body = await readBody(req);
      return json(
        res,
        201,
        await decodeAnd(AddSlideRequest, body, (b) => Effect.flatMap(Decks, (d) => d.addSlide(deckId, b.prompt, b.position, b.author))),
      );
    }
    if (sub === "reorder" && method === "POST") {
      const body = await readBody(req);
      await decodeAnd(ReorderRequest, body, (b) => Effect.flatMap(Decks, (d) => d.reorder(deckId, b.orderedSlideIds)));
      return json(res, 200, { ok: true });
    }
    if (sub === "review" && method === "POST") {
      const body = await readBody(req);
      await decodeAnd(ReviewModeRequest, body, (b) => Effect.flatMap(Decks, (d) => d.setReviewMode(deckId, b.on)));
      return json(res, 200, { ok: true });
    }
    if (sub === "pending" && method === "GET") {
      return json(res, 200, await run(Effect.flatMap(Decks, (d) => d.listPendingEdits(deckId))));
    }
    if (sub === "export" && method === "GET") {
      const format = (url.searchParams.get("format") ?? "png") as ExportFormat;
      // /export/manifest lists the bundle's files (blob refs + notes text) so the
      // client can write them wherever the user chooses; /export writes to disk
      // (used by the MCP export_deck tool, which has no save dialog).
      if (seg[4] === "manifest") {
        return json(res, 200, await run(Effect.flatMap(Decks, (d) => d.exportManifest(deckId, format))));
      }
      return json(res, 200, await run(Effect.flatMap(Decks, (d) => d.exportDeck(deckId, format))));
    }
    if (sub === "titles" && method === "POST") {
      // Generate display titles for untitled slides; a deck-changed event then
      // pushes the refreshed deck to clients.
      return json(res, 200, await run(Effect.flatMap(Decks, (d) => d.ensureTitles(deckId))));
    }
  }

  if (seg[0] === "api" && seg[1] === "slides" && seg[2]) {
    const slideId = seg[2];
    const sub = seg[3];
    if (sub === "prompt" && method === "POST") {
      const body = await readBody(req);
      return json(
        res,
        200,
        await decodeAnd(EditSlidePromptRequest, body, (b) =>
          Effect.flatMap(Decks, (d) => d.editSlidePrompt(slideId, b.prompt, b.mode ?? "direct", b.author, b.note)),
        ),
      );
    }
    if (sub === "regenerate" && method === "POST") {
      const body = await readBody(req);
      return json(
        res,
        200,
        await decodeAnd(RegenerateRequest, body, (b) => Effect.flatMap(Decks, (d) => d.regenerate(slideId, b))),
      );
    }
    if (sub === "variations" && method === "POST") {
      const body = await readBody(req);
      return json(
        res,
        200,
        await decodeAnd(VariationsRequest, body, (b) => Effect.flatMap(Decks, (d) => d.variations(slideId, b.count ?? 4))),
      );
    }
    if (sub === "pick" && method === "POST") {
      const body = await readBody(req);
      await decodeAnd(PickVersionRequest, body, (b) => Effect.flatMap(Decks, (d) => d.pickVersion(slideId, b.versionId)));
      return json(res, 200, { ok: true });
    }
    if (sub === "history" && method === "GET") {
      return json(res, 200, await run(Effect.flatMap(Decks, (d) => d.getHistory(slideId))));
    }
  }

  if (seg[0] === "api" && seg[1] === "edits" && seg[2] && seg[3] === "resolve" && method === "POST") {
    const body = await readBody(req);
    const editId = seg[2];
    return json(
      res,
      200,
      await decodeAnd(ResolveEditRequest, body, (b) => Effect.flatMap(Decks, (d) => d.resolveEdit(editId, b.decision))),
    );
  }

  json(res, 404, { error: "not found" });
}

/**
 * Stateful MCP over Streamable HTTP, bearer-gated (the mandrel pattern).
 * Each session gets its own McpServer — the SDK's Protocol layer is
 * single-transport, so reusing one server across sessions throws
 * "Already connected to a transport" on the second initialize.
 */
interface McpSession {
  readonly transport: StreamableHTTPServerTransport;
  readonly server: McpServer;
}
const mcpSessions = new Map<string, McpSession>();

const publishMcpCount = () =>
  run(Effect.flatMap(Events, (e) => e.publish({ type: "mcp-clients", count: mcpSessions.size })));

function bearerOk(req: http.IncomingMessage): boolean {
  const header = req.headers["authorization"];
  return typeof header === "string" && header === `Bearer ${config.mcpToken}`;
}

async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!bearerOk(req)) {
    json(res, 401, { error: "unauthorized: send Authorization: Bearer <token> (see /api/status or server log)" });
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const body = await readBody(req);

  // Existing session — route straight to its transport.
  if (sessionId !== undefined && mcpSessions.has(sessionId)) {
    await mcpSessions.get(sessionId)!.transport.handleRequest(req, res, body);
    return;
  }

  // New session — only on an initialize request.
  if (sessionId === undefined && isInitializeRequest(body)) {
    const agentName = (req.headers["x-agent-name"] as string | undefined) ?? "mcp-http-client";
    const server = buildMcpServer(agentName);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        mcpSessions.set(sid, { transport, server });
        void publishMcpCount();
      },
    } as never);
    transport.onclose = () => {
      if (transport.sessionId !== undefined) {
        mcpSessions.delete(transport.sessionId);
        void server.close();
        void publishMcpCount();
      }
    };
    await server.connect(transport as never);
    await transport.handleRequest(req, res, body);
    return;
  }

  // Stale session id from before a restart — tell the client to re-initialize
  // (404 + the canonical code) instead of tripping OAuth discovery on a 401.
  if (sessionId !== undefined) {
    json(res, 404, {
      jsonrpc: "2.0",
      error: { code: -32001, message: "Session not found. Please re-initialize." },
      id: null,
    });
    return;
  }

  json(res, 400, { error: "invalid_request" });
}

export async function startServer(): Promise<http.Server> {
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${config.httpPort}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, x-agent-name",
      });
      return res.end();
    }
    if (url.pathname.startsWith("/blobs/")) return serveBlob(res, decodeURIComponent(url.pathname.slice("/blobs/".length)));
    if (url.pathname === "/mcp") {
      handleMcp(req, res).catch((err) => {
        if (!res.headersSent) json(res, 500, { error: String(err) });
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      handleApi(req, res, url).catch((err) => {
        if (!res.headersSent) json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      });
      return;
    }
    if (req.method === "GET" && serveStatic(res, url.pathname)) return;
    json(res, 200, { name: "substrate-server", ok: true });
  });

  // WebSocket: one subscription to the Events PubSub broadcast to all clients.
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<WebSocket>();
  // Liveness tracking: a client that misses a ping/pong round is half-open
  // (laptop sleep, dropped NAT) — terminate it so the browser sees a close and
  // reconnects, rather than the link silently going stale (reliability-first).
  const alive = new WeakSet<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    ws.send(JSON.stringify({ type: "mcp-clients", count: mcpSessions.size } satisfies ServerEvent));
    ws.on("close", () => clients.delete(ws));
  });
  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      alive.delete(ws);
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }
  }, 30000);
  wss.on("close", () => clearInterval(heartbeat));

  const events = await run(Events);
  runtime.runFork(
    Stream.runForEach(Stream.fromPubSub(events.pubsub), (event: ServerEvent) =>
      Effect.sync(() => {
        const payload = JSON.stringify(event);
        for (const ws of clients) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }),
    ),
  );

  await new Promise<void>((resolve) => httpServer.listen(config.httpPort, resolve));
  const info = await run(Effect.flatMap(Provider, (p) => p.info));
  const mode = info.usingMock
    ? "preview renderer (add an OpenAI key in Settings or set OPENAI_API_KEY for GPT Image 2)"
    : `provider ${info.name}`;
  /* eslint-disable no-console */
  console.log(`[substrate] server on http://localhost:${config.httpPort}  ·  ${mode}  ·  model ${info.model}`);
  console.log(`[substrate] MCP (HTTP, bearer-gated) at http://localhost:${config.httpPort}/mcp`);
  // Print the token to stderr so a user can register Substrate with their AI
  // client once (it persists across launches). Add to e.g. Claude Code:
  //   claude mcp add --transport http substrate http://localhost:${config.httpPort}/mcp \
  //     --header "Authorization: Bearer ${config.mcpToken}"
  console.error(`[substrate] MCP_TOKEN=${config.mcpToken}`);
  /* eslint-enable no-console */
  return httpServer;
}
