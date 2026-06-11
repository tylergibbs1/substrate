/**
 * Derive a concise display title from a slide prompt.
 *
 * The prompt is the slide's text-of-record; this is only a label for the rail and
 * command palette. It prefers the first quoted on-slide headline (these prompts
 * usually carry the literal headline in quotes), and otherwise falls back to the
 * first clause with leading stage directions ("Headline", "Title slide.", …)
 * stripped. Shared by the web fallback and the server's mock title provider so the
 * two never diverge; the real AI titles replace it once generated.
 */
export function deriveSlideTitle(prompt: string): string {
  const text = prompt.trim();
  // First quoted phrase (straight or curly quotes) — usually the headline.
  const quoted = text.match(/["“]([^"”]{2,80})["”]/);
  if (quoted?.[1]) return tidy(quoted[1]);
  // Otherwise the first sentence/clause, with leading directions removed.
  const firstClause = text.split(/(?<=[.!?])\s|[:\n]/)[0] ?? text;
  return tidy(stripDirective(firstClause)) || "Untitled slide";
}

function stripDirective(s: string): string {
  return s
    .replace(/^(title slide|closing slide|section slide|headline|a single bold statement[^.]*|centered|slide)\b[\s.:,-]*/i, "")
    .trim();
}

function tidy(s: string): string {
  const t = s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "");
  return t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
}
