// Boots the bundled server (apps/server/dist/server.mjs — the same artifact the
// Electron shell launches) on the host OS and checks it actually comes up and
// answers /api/status. Run after `pnpm build:dist`. Its real job is to prove the
// server boots on Windows (node:sqlite, the HTTP/WS/MCP stack, %APPDATA% data dir,
// loopback bind) on a real windows-latest runner — the closest automated "it works
// on Windows" short of driving the GUI. Exits non-zero if it never answers.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const serverEntry = path.join(repoRoot, "apps/server/dist/server.mjs");

if (!fs.existsSync(serverEntry)) {
  console.error(`✗ server bundle missing: ${serverEntry}\n  run \`pnpm build:dist\` first.`);
  process.exit(1);
}

const port = 4399;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-boot-"));
const env = {
  ...process.env,
  SUBSTRATE_PORT: String(port),
  SUBSTRATE_DATA_DIR: dataDir,
  SUBSTRATE_WEB_DIST: path.join(repoRoot, "apps/web/dist"),
  SUBSTRATE_DEMO_DIR: path.join(repoRoot, "apps/server/assets/demo"),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (pathname) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("timeout")));
  });

console.log(`booting ${serverEntry} on :${port} (${process.platform})`);
const proc = spawn(process.execPath, [serverEntry], { env, stdio: "inherit" });
let exited = null;
proc.on("exit", (code) => (exited = code));

let result = null;
for (let i = 0; i < 60 && exited === null; i++) {
  try {
    const r = await get("/api/status");
    if (r.status === 200) { result = r; break; }
  } catch {
    /* not up yet */
  }
  await sleep(1000);
}

proc.kill();
fs.rmSync(dataDir, { recursive: true, force: true });

if (exited !== null && !result) {
  console.error(`✗ server process exited early (code ${exited}) before answering`);
  process.exit(1);
}
if (!result) {
  console.error(`✗ /api/status never returned 200 within 60s`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(result.body);
} catch {
  console.error(`✗ /api/status returned 200 but not JSON: ${result.body.slice(0, 200)}`);
  process.exit(1);
}
const okShape = typeof parsed.model === "string" && typeof parsed.mcpUrl === "string";
console.log(`✓ /api/status → 200  model=${parsed.model} provider=${parsed.provider} mcp=${parsed.mcpUrl}`);
console.log(`\n${okShape ? "PASS" : "FAIL"} — server boots + answers on ${process.platform}`);
process.exit(okShape ? 0 : 1);
