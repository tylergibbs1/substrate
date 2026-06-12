// Cross-platform smoke test for FileContext — the agent's sandboxed file context
// + shell. It exists to PROVE the Windows code paths (NTFS junctions instead of
// symlinks, cmd.exe instead of /bin/sh, taskkill instead of process-group kill,
// forward-slash glob matching) actually work on the target OS, since they can't
// be exercised from a macOS/Linux dev box. Run on every OS in CI.
//
//   node apps/server/test/filecontext.smoke.mjs
//
// All `run` commands use `node -e` so the test itself is OS-agnostic (awk/sleep
// don't exist on Windows). Exits non-zero on the first failed assertion.
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

// --- multi-root workspace (junction on Windows, symlink on POSIX) ---
const ctx = openFileContext([a, b]);
ok(/2 attached folders/.test(ctx.label), `multi-root label: ${ctx.label}`);
const entries = fs.readdirSync(ctx.root);
ok(entries.length === 2, `workspace exposes both roots (${entries.join(", ")})`);

const globOut = await ctx.glob("**/*.csv");
ok(/data\.csv/.test(globOut), `glob **/*.csv finds data.csv (forward-slash match)`);

const globNested = await ctx.glob("**/*.txt");
ok(/note\.txt/.test(globNested), `glob matches a nested file across the dir separator`);

const grepOut = await ctx.grep("gamma");
ok(/readme\.md/.test(grepOut), `grep finds a match in the second root`);

// --- run: the shell actually executes (cmd.exe on Windows, /bin/sh on POSIX) ---
const runOut = await ctx.run(`node -e "console.log('sum=' + (3+7))"`);
ok(/sum=10/.test(runOut), `run executes a command and captures stdout`);

// --- run timeout: the process tree is actually killed (taskkill / group-kill) ---
const t0 = Date.now();
const killOut = await ctx.run(`node -e "setTimeout(()=>{}, 10000)"`, 1500);
const elapsed = Date.now() - t0;
ok(/timed out/.test(killOut) && elapsed < 6000, `run timeout kills the process (${Math.round(elapsed)}ms)`);

ctx.dispose();
ok(!fs.existsSync(ctx.root), `dispose() removes the temp workspace`);

// --- single-file context ---
const ctx2 = openFileContext([path.join(a, "data.csv")]);
ok(/the file data\.csv/.test(ctx2.label), `single-file label: ${ctx2.label}`);
const readOut = await ctx2.readFile("data.csv");
ok(/name,n/.test(readOut), `single-file readFile returns the attached file`);
const runOut2 = await ctx2.run(`node -e "console.log('ran in single-file cwd')"`);
ok(/ran in single-file cwd/.test(runOut2), `run works in single-file scratch cwd`);
ctx2.dispose();

// cleanup the source fixtures
fs.rmSync(a, { recursive: true, force: true });
fs.rmSync(b, { recursive: true, force: true });

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s) on ${process.platform}`);
process.exit(failures === 0 ? 0 : 1);
