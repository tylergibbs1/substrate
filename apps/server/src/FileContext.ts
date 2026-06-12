// @effect-diagnostics nodeBuiltinImport:off
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

/**
 * Sandboxed file exploration + a shell for the deck-building agent — the same
 * primitives Claude Code / Codex / opencode give a coding agent, scoped to ONE
 * user-chosen root so the agent can ground a deck in the user's real material
 * (notes, data, a spec, a CSV) instead of guessing, and run code to ANALYZE it.
 *
 * Safety (modeled on codex's canonicalize-and-reject + opencode's containment):
 * - Path TOOLS (read/list/glob/grep) are read-only and confined: every path is
 *   resolved against the root and `realpath`-canonicalized, then rejected if it
 *   escapes. File CONTENTS are untrusted (a prompt-injection surface), so there
 *   is no "ask the human" fallback — out-of-root access simply fails.
 * - `run` is an UNCONFINED shell (the user's explicit choice): a command runs
 *   with the host user's authority, cwd at the working dir. We mirror opencode's
 *   guardrails — timeout (default 2m, cap 10m, group-killed so children die too),
 *   bounded captured output, and an advisory flagging any path (absolute OR
 *   relative `..`) the command reaches outside the attached material. We also
 *   scrub Substrate's API keys / MCP token from the child env — but that is
 *   defense-in-depth, NOT a boundary: the same secrets persist on disk (settings
 *   file, sqlite) and a determined injected command runs as the same user and can
 *   read them. There is NO OS sandbox, so the build prompt's data-not-instructions
 *   guard is the real first line of defense.
 * - Read caps mirror opencode (50 KB / 2000 lines per read, 100 search hits) so a
 *   huge tree can't blow up the model's context. Binaries and junk dirs skipped.
 */

const isWindows = process.platform === "win32";

// The path tools resolve and display POSIX-style; Windows' path.relative returns
// backslash-separated, which would never match the forward-slash-anchored globs.
const toPosix = (p: string): string => (path.sep === "\\" ? p.split(path.sep).join("/") : p);

// Link an attached input into the workspace dir. Directories use an NTFS junction
// on Windows (no admin / Developer Mode needed; on POSIX the 'junction' type is
// ignored and a normal symlink is made). Files can't be junctioned, so symlink
// where the OS allows and copy as the Windows-without-symlink-privilege fallback.
const linkInto = (target: string, linkPath: string): void => {
  if (fs.statSync(target).isDirectory()) {
    fs.symlinkSync(target, linkPath, "junction");
    return;
  }
  try {
    fs.symlinkSync(target, linkPath, isWindows ? "file" : undefined);
  } catch {
    fs.copyFileSync(target, linkPath);
  }
};

const READ_MAX_BYTES = 50 * 1024;
const READ_DEFAULT_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const SEARCH_LIMIT = 100;
const GREP_MAX_FILE_BYTES = 256 * 1024;
const WALK_MAX_ENTRIES = 20000;
const RUN_TIMEOUT_MS = 2 * 60 * 1000;
const RUN_MAX_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_MAX_OUTPUT = 30 * 1024;
// Never hand Substrate's own secrets to a command the agent composed from
// untrusted file content — even in the unconfined shell.
const SCRUBBED_ENV_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "SUBSTRATE_MCP_TOKEN"];

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", ".next", ".nuxt",
  ".turbo", ".cache", "coverage", ".venv", "venv", "__pycache__", ".idea", ".vscode",
  ".pnpm-store", "target", "vendor", ".terraform",
]);

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".pdf", ".psd",
  ".zip", ".gz", ".tar", ".rar", ".7z", ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm",
  ".class", ".pyc", ".o", ".a", ".mp3", ".mp4", ".mov", ".avi", ".wav", ".flac", ".ogg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".sqlite", ".db", ".lock",
]);

export interface FileContext {
  /** The base tools resolve against: a single attached dir, or a workspace of
   *  named symlinks when several dirs/files were attached. */
  readonly root: string;
  /** Human description of what's attached, for the agent prompt (e.g. "the folder
   *  meridian-main" or "3 attached folders: a/, b/, c/"). */
  readonly label: string;
  /** When the user attached a single file, its absolute path; else null. */
  readonly focusFile: string | null;
  /** The single attached file relative to the root (for the prompt); else null. */
  readonly focusRel: string | null;
  readFile(input: string, offset?: number, limit?: number): Promise<string>;
  listDir(input?: string): Promise<string>;
  glob(pattern: string, input?: string): Promise<string>;
  grep(pattern: string, input?: string, include?: string): Promise<string>;
  /** Run a shell command to analyze/transform the material (cwd = the attached
   *  dir, or a 1-file scratch dir in single-file mode). Bounded output + group-
   *  killed timeout; unconfined (host-user authority). Never rejects. */
  run(command: string, timeoutMs?: number): Promise<string>;
  /** Remove any temp dirs/symlinks this context created. Idempotent; safe to call
   *  in a finally. Call once the build/revise run is done. */
  dispose(): void;
}

/**
 * Open a sandboxed file context over one or more user-chosen directories/files.
 * - One directory  → rooted at it.
 * - One file       → confined to just that file.
 * - Several inputs → a workspace of named symlinks; each is addressed as
 *   "<name>/..." (the basename, de-duplicated), and ALL paths are confined to the
 *   union of the chosen inputs.
 */
export function openFileContext(inputs: string[]): FileContext {
  const reals = inputs.map((i) => fs.realpathSync(i)); // canonicalize; throws if missing
  if (reals.length === 0) throw new Error("No file-context paths provided.");
  // The containment set: a real path is in-bounds iff it's under one of these.
  const roots = reals.slice();
  // Temp dirs we create (workspace + single-file scratch), removed by dispose().
  const tempDirs: string[] = [];

  const single = reals.length === 1 ? reals[0]! : null;
  const singleIsDir = single ? fs.statSync(single).isDirectory() : false;

  let root: string;
  let focusFile: string | null = null;
  let label: string;
  if (single && !singleIsDir) {
    root = path.dirname(single);
    focusFile = single;
    label = `the file ${path.basename(single)}`;
  } else if (single) {
    root = single;
    label = `the folder ${path.basename(single)}`;
  } else {
    // Several inputs: a workspace of named symlinks, addressed as "<name>/...".
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-ctx-"));
    tempDirs.push(ws);
    const allocated = new Set<string>();
    const names: string[] = [];
    for (const r of reals) {
      // Collision-proof name against ALL allocated names (a raw basename can equal
      // another input's auto-suffixed name), so no input is silently dropped.
      const base = path.basename(r) || "root";
      let name = base;
      for (let k = 2; allocated.has(name); k++) name = `${base}-${k}`;
      allocated.add(name);
      linkInto(r, path.join(ws, name)); // throws → fail the request, never drop silently
      names.push(name);
    }
    root = fs.realpathSync(ws); // canonicalize (e.g. macOS /var → /private/var)
    label = `${reals.length} attached folders: ${names.map((n) => `${n}/`).join(", ")}`;
  }

  // `run` needs a real working directory: the root (a dir or the workspace). For a
  // single file, a throwaway dir holding only a symlink to that file, so a bare
  // `ls`/relative path sees just it (the shell is still unconfined for absolute
  // paths — the user's accepted choice).
  let runCwd = root;
  if (focusFile) {
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-ctx-"));
      tempDirs.push(dir);
      linkInto(focusFile, path.join(dir, path.basename(focusFile)));
      runCwd = dir;
    } catch {
      runCwd = path.dirname(focusFile);
    }
  }

  const dispose = (): void => {
    for (const d of tempDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
    tempDirs.length = 0;
  };

  const isUnderOrEq = (base: string, p: string): boolean => {
    const r = path.relative(base, p);
    return r === "" || (r !== ".." && !r.startsWith(".." + path.sep) && !path.isAbsolute(r));
  };
  // In-bounds iff the REAL path is the/under the root (workspace-local) or under
  // any attached input (the symlink targets / each chosen folder).
  const insideRoots = (real: string): boolean =>
    isUnderOrEq(root, real) || roots.some((r) => isUnderOrEq(r, real));

  // Resolve a (possibly relative, possibly "<name>/...") path. Realpath ONLY for
  // the containment check (catches `..` and symlinks pointing out); return the
  // lexical path so fs ops follow the workspace symlinks and display stays clean.
  const resolveInRoot = (p: string): string => {
    const abs = path.resolve(root, p);
    let real: string;
    try {
      real = fs.realpathSync(abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") real = abs;
      else throw e;
    }
    if (!insideRoots(real)) throw new Error("Path escapes the attached file context and was refused.");
    return abs;
  };

  const rel = (abs: string): string => path.relative(root, abs) || ".";

  const isBinary = (file: string, head: Buffer): boolean => {
    if (BINARY_EXTS.has(path.extname(file).toLowerCase())) return true;
    const n = Math.min(head.length, 4096);
    if (n === 0) return false;
    let nonPrintable = 0;
    for (let i = 0; i < n; i++) {
      const b = head[i]!;
      if (b === 0) return true; // a NUL byte ⇒ binary
      if (b < 9 || (b > 13 && b < 32)) nonPrintable++;
    }
    return nonPrintable / n > 0.3;
  };

  // Depth-first walk yielding files, skipping ignored dirs and capping work.
  // When the user attached a SINGLE file, the context is exactly that file — never
  // the parent dir's other contents — so the walk yields only it.
  async function* walk(dir: string): AsyncGenerator<string> {
    if (focusFile) {
      yield focusFile;
      return;
    }
    let seen = 0;
    const stack: string[] = [dir];
    while (stack.length > 0) {
      const current = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (++seen > WALK_MAX_ENTRIES) return;
        const full = path.join(current, entry.name);
        let isDir = entry.isDirectory();
        let isFile = entry.isFile();
        if (entry.isSymbolicLink()) {
          // Follow only symlinks whose target stays inside the attached inputs:
          // the workspace's named roots do; a stray internal symlink to /etc won't.
          let real: string;
          try {
            real = await fsp.realpath(full);
          } catch {
            continue;
          }
          if (!insideRoots(real)) continue;
          try {
            const st = await fsp.stat(full);
            isDir = st.isDirectory();
            isFile = st.isFile();
          } catch {
            continue;
          }
        }
        if (isDir) {
          if (!IGNORED_DIRS.has(entry.name)) stack.push(full);
        } else if (isFile) {
          yield full;
        }
      }
    }
  }

  const readFile: FileContext["readFile"] = async (inputPath, offset = 1, limit = READ_DEFAULT_LIMIT) => {
    // Single-file context: only ever the attached file, whatever path is requested.
    const target = focusFile ?? resolveInRoot(inputPath);
    const stat = await fsp.stat(target);
    if (stat.isDirectory()) return listDir(inputPath);

    const fh = await fsp.open(target, "r");
    try {
      const head = Buffer.alloc(Math.min(4096, stat.size));
      await fh.read(head, 0, head.length, 0);
      if (isBinary(target, head)) return `Cannot read binary file: ${rel(target)} (${stat.size} bytes).`;
      const buf = Buffer.alloc(Math.min(stat.size, READ_MAX_BYTES));
      await fh.read(buf, 0, buf.length, 0);
      const truncatedBytes = stat.size > READ_MAX_BYTES;
      const lines = buf.toString("utf8").split("\n");
      const start = Math.max(0, offset - 1);
      const window = lines.slice(start, start + limit);
      const body = window
        .map((line, i) => {
          const text = line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}… (line truncated)` : line;
          return `${start + i + 1}: ${text}`;
        })
        .join("\n");
      const shown = start + window.length;
      const more = shown < lines.length || truncatedBytes;
      const hint = more ? `\n\n(Showing lines ${start + 1}-${shown}. Use offset=${shown + 1} to continue.)` : "";
      return `${rel(target)}:\n${body}${hint}`;
    } finally {
      await fh.close();
    }
  };

  const listDir: FileContext["listDir"] = async (inputPath = ".") => {
    // Single-file context: the only listing is the attached file itself.
    if (focusFile) return `(1 attached file)\n${path.basename(focusFile)}`;
    const target = resolveInRoot(inputPath);
    const stat = await fsp.stat(target);
    if (!stat.isDirectory()) return readFile(inputPath);
    const entries = await fsp.readdir(target, { withFileTypes: true });
    // A workspace's top level is symlinks to the attached roots — stat to see dirs.
    const marked = await Promise.all(
      entries.map(async (e) => {
        if (e.isSymbolicLink()) {
          try {
            return { name: e.name, dir: (await fsp.stat(path.join(target, e.name))).isDirectory() };
          } catch {
            return { name: e.name, dir: false };
          }
        }
        return { name: e.name, dir: e.isDirectory() };
      }),
    );
    const names = marked
      .filter((e) => !(e.dir && IGNORED_DIRS.has(e.name)))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
      .map((e) => (e.dir ? `${e.name}/` : e.name));
    return `${rel(target)}/ (${names.length} entries):\n${names.join("\n")}`;
  };

  const glob: FileContext["glob"] = async (pattern, inputPath = ".") => {
    const base = resolveInRoot(inputPath);
    const re = globToRegExp(pattern);
    const hits: string[] = [];
    for await (const file of walk(base)) {
      if (re.test(toPosix(path.relative(base, file)))) {
        hits.push(rel(file));
        if (hits.length >= SEARCH_LIMIT) break;
      }
    }
    if (hits.length === 0) return `No files match ${pattern} under ${rel(base)}.`;
    const trunc = hits.length >= SEARCH_LIMIT ? `\n(Showing first ${SEARCH_LIMIT}; narrow the pattern for more.)` : "";
    return `${hits.length} file(s):\n${hits.join("\n")}${trunc}`;
  };

  const grep: FileContext["grep"] = async (pattern, inputPath = ".", include) => {
    const base = resolveInRoot(inputPath);
    let re: RegExp;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return `Invalid regex: ${pattern}`;
    }
    const includeRe = include ? globToRegExp(include) : null;
    const groups: string[] = [];
    let total = 0;
    for await (const file of walk(base)) {
      if (total >= SEARCH_LIMIT) break;
      if (includeRe && !includeRe.test(toPosix(path.relative(base, file)))) continue;
      if (BINARY_EXTS.has(path.extname(file).toLowerCase())) continue;
      let stat: fs.Stats;
      try {
        stat = await fsp.stat(file);
      } catch {
        continue;
      }
      if (stat.size > GREP_MAX_FILE_BYTES || stat.size === 0) continue;
      let content: string;
      try {
        content = await fsp.readFile(file, "utf8");
      } catch {
        continue;
      }
      if (content.includes("\u0000")) continue; // a NUL byte means binary slipped through
      const matches: string[] = [];
      const lines = content.split("\n");
      for (let i = 0; i < lines.length && total < SEARCH_LIMIT; i++) {
        if (re.test(lines[i]!)) {
          const text = lines[i]!.length > 200 ? `${lines[i]!.slice(0, 200)}…` : lines[i]!;
          matches.push(`  ${i + 1}: ${text}`);
          total++;
        }
      }
      if (matches.length > 0) groups.push(`${rel(file)}:\n${matches.join("\n")}`);
    }
    if (groups.length === 0) return `No matches for /${pattern}/ under ${rel(base)}.`;
    const trunc = total >= SEARCH_LIMIT ? `\n(Hit the ${SEARCH_LIMIT}-match cap; narrow the pattern.)` : "";
    return `${total} match(es):\n${groups.join("\n\n")}${trunc}`;
  };

  // Paths the command names that fall OUTSIDE the working directory — advisory
  // only (the shell is unconfined), surfaced so the agent/log notes the reach.
  // Resolves BOTH absolute paths and relative `../` escapes (the common form, and
  // how Substrate's own on-disk secrets/data would be reached), against runCwd.
  const externalPaths = (command: string): string[] => {
    const out = new Set<string>();
    const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    for (const token of tokens) {
      const value = token.replace(/^(['"])(.*)\1$/, "$2").replace(/[;,|&]+$/, "");
      if (!value || value.startsWith("-")) continue; // skip flags, not paths
      const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(runCwd, value);
      const r = path.relative(runCwd, resolved);
      if (r === ".." || r.startsWith(".." + path.sep) || path.isAbsolute(r)) out.add(resolved);
    }
    return [...out];
  };

  const run: FileContext["run"] = (command, timeoutMs = RUN_TIMEOUT_MS) => {
    const limit = Math.min(Math.max(1000, timeoutMs), RUN_MAX_TIMEOUT_MS);
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of SCRUBBED_ENV_KEYS) delete env[k];
    const external = externalPaths(command);
    return new Promise((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        // `shell: true` runs the command through the host shell (cmd.exe on
        // Windows, /bin/sh on POSIX) and lets Node handle the invocation +
        // per-platform quote escaping — far more robust than hand-building cmd.exe
        // args. POSIX: `detached` makes the shell a process-group leader so the
        // timeout can group-kill it AND its children (pipelines, python3, &-jobs);
        // Windows uses taskkill /T in kill() to take down the whole tree instead.
        child = spawn(command, { cwd: runCwd, env, shell: true, detached: !isWindows });
      } catch (e) {
        resolve(`Failed to start the command: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      let out = "";
      let err = "";
      let outTrunc = false;
      let errTrunc = false;
      let timedOut = false;
      const kill = () => {
        const pid = child.pid;
        if (isWindows) {
          // taskkill /T walks and kills the child's whole process tree by pid.
          try {
            if (pid) spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
            else child.kill();
          } catch {
            child.kill();
          }
        } else {
          try {
            if (pid) process.kill(-pid, "SIGKILL"); // negative pid → whole group
            else child.kill("SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, limit);
      timer.unref?.();
      child.stdout?.on("data", (d: Buffer) => {
        if (out.length < RUN_MAX_OUTPUT) out += d.toString("utf8");
        else outTrunc = true;
      });
      child.stderr?.on("data", (d: Buffer) => {
        if (err.length < RUN_MAX_OUTPUT) err += d.toString("utf8");
        else errTrunc = true;
      });
      child.on("error", (e: Error) => {
        clearTimeout(timer);
        resolve(`Failed to run the command: ${e.message}`);
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timer);
        out = out.slice(0, RUN_MAX_OUTPUT);
        err = err.slice(0, RUN_MAX_OUTPUT);
        let body = out && err ? `${out}\n\nstderr:\n${err}` : err ? `stderr:\n${err}` : out;
        if (!body) body = "(no output)";
        if (outTrunc || errTrunc) body += `\n[output truncated at ${RUN_MAX_OUTPUT / 1024}KB]`;
        const warn = external.length ? `\nNote: this command reaches paths outside the attached material: ${external.join(", ")}` : "";
        const tail = timedOut
          ? `\n\nCommand timed out after ${Math.round(limit / 1000)}s and was killed.`
          : `\n\nExited with code ${code ?? "unknown"}.`;
        resolve(`${body}${warn}${tail}`);
      });
    });
  };

  return { root, label, focusFile, focusRel: focusFile ? path.relative(root, focusFile) : null, readFile, listDir, glob, grep, run, dispose };
}

/** Minimal glob → RegExp: supports `**` (across dirs), `*` (within a segment),
 *  and `?`. Anchored, matched against a POSIX-style relative path. */
function globToRegExp(pattern: string): RegExp {
  const posix = pattern.replace(/\\/g, "/");
  let out = "";
  for (let i = 0; i < posix.length; i++) {
    const c = posix[i]!;
    if (c === "*") {
      if (posix[i + 1] === "*") {
        out += ".*";
        i++;
        if (posix[i + 1] === "/") i++;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if ("+.^${}()|[]\\".includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`, "i");
}
