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

const FETCH_TIMEOUT_MS = 8000;

export async function resolveDesignSource(input: string): Promise<string> {
  const trimmed = input.trim();
  const slug = extractSlug(trimmed);

  // SSRF guard: the ONLY URL we ever fetch is the trusted getdesign.md raw URL
  // derived from a known slug. A getdesign.md link is reduced to its slug first,
  // so a crafted host can't redirect the fetch. Arbitrary URLs are refused (the
  // user pastes the DESIGN.md text instead); we never touch untrusted hosts.
  if (slug && DESIGN_MD_SLUGS.includes(slug)) {
    const url = `${REPO_RAW}/${encodeURIComponent(slug)}/DESIGN.md`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: "text/markdown, text/plain" },
        redirect: "error", // never follow a redirect off the trusted host
        signal: controller.signal,
      });
    } catch {
      throw new Error("Couldn't reach getdesign.md — paste the DESIGN.md text instead.");
    } finally {
      clearTimeout(timer);
    }
    // Generic, non-reflective errors so an unauthenticated caller can't use this
    // as a scanning oracle (the real status/url is never the user's to probe).
    if (!res.ok) throw new Error("Couldn't fetch that design — paste the DESIGN.md text instead.");
    const text = (await res.text()).slice(0, 40000).trim();
    if (!text) throw new Error("That design returned no content — paste the DESIGN.md text instead.");
    return text;
  }

  // Anything URL-like that isn't a known getdesign.md slug is refused outright —
  // we do not fetch user-supplied hosts.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    throw new Error("Only getdesign.md designs or pasted DESIGN.md text are supported.");
  }

  // Otherwise treat the input as pasted DESIGN.md text.
  return trimmed;
}
