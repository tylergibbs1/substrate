/**
 * A compact word-level diff for prompt edits (PRD §6.8 — edits render as
 * readable text diffs, old vs new, before they render). LCS over tokens.
 */
function tokenize(s: string): string[] {
  return s.split(/(\s+)/);
}

interface Part {
  kind: "same" | "add" | "del";
  text: string;
}

function diff(oldText: string, newText: string): Part[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const parts: Part[] = [];
  let i = 0;
  let j = 0;
  const push = (kind: Part["kind"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push("del", a[i]!);
      i++;
    } else {
      push("add", b[j]!);
      j++;
    }
  }
  while (i < n) push("del", a[i++]!);
  while (j < m) push("add", b[j++]!);
  return parts;
}

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = diff(oldText, newText);
  return (
    <pre className="mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-dim max-h-40 overflow-auto">
      {parts.map((p, idx) => {
        const key = `${idx}:${p.kind}:${p.text}`;
        if (p.kind === "same") return <span key={key}>{p.text}</span>;
        if (p.kind === "add")
          return (
            <span key={key} className="bg-[color-mix(in_oklab,var(--color-ok)_22%,transparent)] text-ok rounded-sm">
              {p.text}
            </span>
          );
        return (
          <span
            key={key}
            className="bg-[color-mix(in_oklab,var(--color-danger)_20%,transparent)] text-danger line-through rounded-sm"
          >
            {p.text}
          </span>
        );
      })}
    </pre>
  );
}
