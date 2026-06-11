// @effect-diagnostics globalFetch:off

/**
 * "Import a DESIGN.md" without leaving the app. The getdesign.md collection is
 * backed by the VoltAgent/awesome-design-md GitHub repo, so we resolve a slug (or
 * a getdesign.md link) straight to the raw DESIGN.md and fetch it server-side —
 * the user picks a design in-app instead of visiting the page. Pasting raw
 * DESIGN.md text still works too.
 */
const REPO_RAW = "https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md";

/** The 74 designs in the getdesign.md collection (awesome-design-md). */
export const DESIGN_MD_SLUGS: ReadonlyArray<string> = [
  "airbnb", "airtable", "apple", "binance", "bmw-m", "bmw", "bugatti", "cal", "claude", "clay",
  "clickhouse", "cohere", "coinbase", "composio", "cursor", "dell-1996", "elevenlabs", "expo", "ferrari",
  "figma", "framer", "hashicorp", "hp", "ibm", "intercom", "kraken", "lamborghini", "linear.app", "lovable",
  "mastercard", "meta", "minimax", "mintlify", "miro", "mistral.ai", "mongodb", "nike", "nintendo-2001",
  "notion", "nvidia", "ollama", "opencode.ai", "pinterest", "playstation", "posthog", "raycast", "renault",
  "replicate", "resend", "revolut", "runwayml", "sanity", "sentry", "shopify", "slack", "spacex", "spotify",
  "starbucks", "stripe", "supabase", "superhuman", "tesla", "theverge", "together.ai", "uber", "vercel",
  "vodafone", "voltagent", "warp", "webflow", "wired", "wise", "x.ai", "zapier",
];

const NAME_OVERRIDES: Record<string, string> = {
  "bmw-m": "BMW M", bmw: "BMW", hp: "HP", ibm: "IBM", nvidia: "NVIDIA", mongodb: "MongoDB",
  clickhouse: "ClickHouse", posthog: "PostHog", hashicorp: "HashiCorp", playstation: "PlayStation",
  elevenlabs: "ElevenLabs", runwayml: "Runway", voltagent: "VoltAgent", "x.ai": "xAI",
  "linear.app": "Linear", "mistral.ai": "Mistral", "together.ai": "Together AI", "opencode.ai": "OpenCode",
  theverge: "The Verge", "dell-1996": "Dell (1996)", "nintendo-2001": "Nintendo (2001)",
};

function prettyName(slug: string): string {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug
    .replace(/\.(app|ai|com|io)$/i, "")
    .split(/[-.]/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/** The picker list the editor shows. */
export function designRegistry(): ReadonlyArray<{ slug: string; name: string }> {
  return DESIGN_MD_SLUGS.map((slug) => ({ slug, name: prettyName(slug) }));
}

/** Pull a known slug out of a bare slug or a getdesign.md URL; else null. */
function extractSlug(input: string): string | null {
  const fromUrl = input.match(/getdesign\.md\/([a-z0-9._-]+)/i);
  if (fromUrl) return fromUrl[1]!.toLowerCase();
  if (/^[a-z0-9._-]{2,40}$/i.test(input)) return input.toLowerCase();
  return null;
}

export async function resolveDesignSource(input: string): Promise<string> {
  const trimmed = input.trim();
  const slug = extractSlug(trimmed);
  const url =
    slug && DESIGN_MD_SLUGS.includes(slug)
      ? `${REPO_RAW}/${encodeURIComponent(slug)}/DESIGN.md`
      : /^https?:\/\//i.test(trimmed)
        ? trimmed
        : null;

  if (url === null) return trimmed; // pasted DESIGN.md text

  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "text/markdown, text/plain, text/html" } });
  } catch {
    throw new Error(`Couldn't reach ${url} — paste the DESIGN.md text instead.`);
  }
  if (!res.ok) throw new Error(`Couldn't fetch that design (HTTP ${res.status}) — paste the DESIGN.md text instead.`);
  const text = (await res.text()).slice(0, 40000).trim();
  if (!text) throw new Error("That design returned no content — paste the DESIGN.md text instead.");
  return text;
}
