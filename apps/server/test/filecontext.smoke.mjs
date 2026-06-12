// Cross-platform smoke test for FileContext — the agent's sandboxed file context
// + shell. It exists to PROVE the Windows code paths (NTFS junctions instead of
// symlinks, cmd.exe instead of /bin/sh, taskkill instead of process-group kill,
// forward-slash glob matching) actually work on the target OS, since they can't
// be exercised from a macOS/Linux dev box. Run on every OS in CI.
//
//   node apps/server/test/filecontext.smoke.mjs
//
// `run` commands invoke checked-in script files (no inline quotes) so the test
// itself survives cmd.exe quoting. Exits non-zero on the first failed assertion.
import { openFileContext } from "../src/FileContext.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

const a = fs.mkdtempSync(path.join(os.tmpdir(), "fc-a-"));
const b = fs.mkdtempSync(path.join(os.tmpdir(), "fc-b-"));
fs.writeFileSync(path.join(a, "data.csv"), "name,n\nx,3\ny,7\n");
fs.mkdirSync(path.join(a, "sub"));
fs.writeFileSync(path.join(a, "sub", "note.txt"), "hello world\nalpha beta\n");
fs.writeFileSync(path.join(b, "readme.md"), "# B\ngamma delta\n");
// Quote-free run targets (no inline `node -e`, which is a cmd.exe quoting minefield).
fs.writeFileSync(path.join(a, "compute.js"), "console.log('sum=' + (3 + 7));\n");
fs.writeFileSync(path.join(a, "sleeper.js"), "setTimeout(() => {}, 10000);\n");

// --- multi-root workspace (junction on Windows, symlink on POSIX) ---
const ctx = openFileContext([a, b]);
ok(/2 attached folders/.test(ctx.label), `multi-root label: ${ctx.label}`);
const entries = fs.readdirSync(ctx.root);
ok(entries.length === 2, `workspace exposes both roots (${entries.join(", ")})`);
const aName = entries.find((n) => fs.existsSync(path.join(ctx.root, n, "data.csv"))) ?? entries[0];

// Diagnostics (FC_DIAG=1): how each workspace link presents + whether its realpath
// matches the source root — the containment check compares these, and a mismatch
// (Windows short/long-name realpath variance) silently drops the link. Kept gated
// so a future cross-platform failure has the path reality in the log on demand.
if (process.env.FC_DIAG) {
  console.log(`[diag] platform=${process.platform} root=${ctx.root}`);
  for (const e of fs.readdirSync(ctx.root, { withFileTypes: true })) {
    let rp = "?";
    try { rp = fs.realpathSync(path.join(ctx.root, e.name)); } catch (err) { rp = "ERR:" + err.code; }
    console.log(`[diag]   ${e.name}: symlink=${e.isSymbolicLink()} dir=${e.isDirectory()} realpath=${rp}`);
  }
  console.log(`[diag] source realpaths a=${fs.realpathSync(a)} b=${fs.realpathSync(b)}`);
}

const globOut = await ctx.glob("**/*.csv");
ok(/data\.csv/.test(globOut), `glob **/*.csv finds data.csv (forward-slash match)`);

const globNested = await ctx.glob("**/*.txt");
ok(/note\.txt/.test(globNested), `glob matches a nested file across the dir separator`);

const grepOut = await ctx.grep("gamma");
ok(/readme\.md/.test(grepOut), `grep finds a match in the second root`);

// --- run: the shell actually executes (cmd.exe on Windows, /bin/sh on POSIX) ---
const runOut = await ctx.run(`node ${aName}/compute.js`);
ok(/sum=10/.test(runOut), `run executes a command and captures stdout`);

// --- run timeout: the process tree is actually killed (taskkill / group-kill) ---
const t0 = Date.now();
const killOut = await ctx.run(`node ${aName}/sleeper.js`, 1500);
const elapsed = Date.now() - t0;
ok(/timed out/.test(killOut) && elapsed < 6000, `run timeout kills the process (${Math.round(elapsed)}ms)`);

ctx.dispose();
ok(!fs.existsSync(ctx.root), `dispose() removes the temp workspace`);

// --- single-file context ---
const ctx2 = openFileContext([path.join(a, "data.csv")]);
ok(/the file data\.csv/.test(ctx2.label), `single-file label: ${ctx2.label}`);
const readOut = await ctx2.readFile("data.csv");
ok(/name,n/.test(readOut), `single-file readFile returns the attached file`);
const runOut2 = await ctx2.run(`node --version`);
ok(/^v?\d+\./m.test(runOut2), `run works in single-file scratch cwd`);
ctx2.dispose();

// cleanup the source fixtures
fs.rmSync(a, { recursive: true, force: true });
fs.rmSync(b, { recursive: true, force: true });

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s) on ${process.platform}`);
process.exit(failures === 0 ? 0 : 1);
