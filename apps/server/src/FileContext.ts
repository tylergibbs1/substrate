// @effect-diagnostics nodeBuiltinImport:off
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Read-only, sandboxed file exploration for the deck-building agent — the same
 * primitives Claude Code / Codex / opencode give a coding agent, scoped to ONE
 * user-chosen root so the agent can ground a deck in the user's real material
 * (notes, data, a spec, a CSV) instead of guessing.
 *
 * Safety (modeled on codex's canonicalize-and-reject + opencode's containment):
 * - Every path is resolved against the root and `realpath`-canonicalized, then
 *   rejected if it escapes the root. File CONTENTS are untrusted (a prompt-
 *   injection surface), so there is no "ask the human" fallback — out-of-root
 *   access simply fails.
 * - Strictly read-only: nothing here writes, deletes, renames, or executes.
 * - Caps mirror opencode (50 KB / 2000 lines per read, 100 search hits) so a huge
 *   tree can't blow up the model's context. Binaries and heavy/junk dirs are
 *   skipped, not dumped.
 */

const READ_MAX_BYTES = 50 * 1024;
const READ_DEFAULT_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const SEARCH_LIMIT = 100;
const GREP_MAX_FILE_BYTES = 256 * 1024;
const WALK_MAX_ENTRIES = 20000;

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
  /** The sandbox root (a directory). */
  readonly root: string;
  /** When the user picked a single file, its absolute path; else null. */
  readonly focusFile: string | null;
  /** The picked file relative to the root (for the agent prompt); else null. */
  readonly focusRel: string | null;
  readFile(input: string, offset?: number, limit?: number): Promise<string>;
  listDir(input?: string): Promise<string>;
  glob(pattern: string, input?: string): Promise<string>;
  grep(pattern: string, input?: string, include?: string): Promise<string>;
}

/** Open a read-only file context rooted at a user-chosen directory or file. */
export function openFileContext(input: string): FileContext {
  const real = fs.realpathSync(input); // canonicalize once; throws if missing
  const isDir = fs.statSync(real).isDirectory();
  const root = isDir ? real : path.dirname(real);
  const focusFile = isDir ? null : real;

  // Resolve a (possibly relative) path against the root and reject any escape —
  // via `..`, an absolute path outside root, or a symlink pointing out.
  const resolveInRoot = (p: string): string => {
    const abs = path.resolve(root, p);
    let resolved: string;
    try {
      resolved = fs.realpathSync(abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") resolved = abs;
      else throw e;
    }
    const rel = path.relative(root, resolved);
    if (rel !== "" && (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))) {
      throw new Error("Path escapes the file-context root and was refused.");
    }
    return resolved;
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
  async function* walk(dir: string): AsyncGenerator<string> {
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
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) stack.push(full);
        } else if (entry.isFile()) {
          yield full;
        }
      }
    }
  }

  const readFile: FileContext["readFile"] = async (inputPath, offset = 1, limit = READ_DEFAULT_LIMIT) => {
    const target = resolveInRoot(inputPath);
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
    const target = resolveInRoot(inputPath);
    const stat = await fsp.stat(target);
    if (!stat.isDirectory()) return readFile(inputPath);
    const entries = await fsp.readdir(target, { withFileTypes: true });
    const names = entries
      .filter((e) => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    return `${rel(target)}/ (${names.length} entries):\n${names.join("\n")}`;
  };

  const glob: FileContext["glob"] = async (pattern, inputPath = ".") => {
    const base = resolveInRoot(inputPath);
    const re = globToRegExp(pattern);
    const hits: string[] = [];
    for await (const file of walk(base)) {
      if (re.test(path.relative(base, file))) {
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
      if (includeRe && !includeRe.test(path.relative(base, file))) continue;
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

  return { root, focusFile, focusRel: focusFile ? path.relative(root, focusFile) : null, readFile, listDir, glob, grep };
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
