// @effect-diagnostics globalFetch:off
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { AspectRatio, Quality } from "@substrate/contracts";
import { ASPECT_SIZE } from "@substrate/shared/Aspect";
import { deriveSlideTitle } from "@substrate/shared/SlideTitle";
import { config } from "./Config.ts";
import { Settings } from "./Settings.ts";

/**
 * Provider — the model abstraction, kept real from day one (PRD §14). v1 ships
 * one image adapter (GPT Image 2) plus a deterministic offline mock, selected by
 * config. Seed is carried explicitly because continuity depends on it (PRD §12).
 */

export interface RenderInput {
  readonly assembledPrompt: string;
  readonly aspectRatio: AspectRatio;
  readonly quality: Quality;
  readonly seed: number;
  readonly styleRefPath?: string | null;
}

export interface RenderResult {
  readonly bytes: Buffer;
  readonly ext: string;
  readonly model: string;
}

export class ProviderError extends Data.TaggedError("ProviderError")<{
  readonly message: string;
}> {}

/** Live provider identity — resolved from Settings, so it tracks the current key. */
export interface ProviderInfo {
  readonly name: string;
  readonly model: string;
  readonly usingMock: boolean;
}

export interface ProviderShape {
  /** The active provider's identity right now (mock vs GPT Image 2). */
  readonly info: Effect.Effect<ProviderInfo>;
  readonly render: (input: RenderInput) => Effect.Effect<RenderResult, ProviderError>;
  readonly outline: (topic: string, count: number) => Effect.Effect<ReadonlyArray<string>, ProviderError>;
  /** Short display titles for slide prompts, batched into one call. Same length
   *  and order as the input. Uses the cheap title model; mock derives them locally. */
  readonly titles: (prompts: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<string>, ProviderError>;
  /** Compile a DESIGN.md / design-system spec into one concise image-model design
   *  prompt (the deck's main design prompt). Mock distills it locally. */
  readonly designPrompt: (source: string) => Effect.Effect<string, ProviderError>;
}

export class Provider extends Context.Service<Provider, ProviderShape>()("substrate/Provider") {}

// ---------------------------------------------------------------------------
// Mock — deterministic, slide-shaped SVG derived from (prompt + seed) so that
// seed-continuity (PRD §12) is observable even with no API key.
// ---------------------------------------------------------------------------

function hashToInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function extractContent(assembled: string): { title: string; body: ReadonlyArray<string> } {
  const marker = "--- SLIDE CONTENT ---";
  const idx = assembled.indexOf(marker);
  const content = idx >= 0 ? assembled.slice(idx + marker.length) : assembled;
  const lines = content
    .split(/\n|\. /)
    .map((l) => l.trim())
    .filter(Boolean);
  return { title: (lines[0] ?? "Untitled slide").slice(0, 64), body: lines.slice(1, 4).map((l) => l.slice(0, 90)) };
}

/** Greedy word-wrap to an approximate character budget, with hard-break for long words. */
function wrapLines(text: string, maxChars: number): ReadonlyArray<string> {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: Array<string> = [];
  let cur = "";
  for (const w of words) {
    let word = w;
    while (word.length > maxChars) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!cur) cur = word;
    else if (`${cur} ${word}`.length <= maxChars) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function renderMock(input: RenderInput): RenderResult {
  const { width, height } = ASPECT_SIZE[input.aspectRatio];
  const rng = mulberry32(input.seed ^ hashToInt(input.assembledPrompt));
  const { title, body } = extractContent(input.assembledPrompt);
  const dark = /dark|charcoal|near-black|black background|technical/i.test(input.assembledPrompt);

  const hue = Math.floor(rng() * 360);
  const accent = `hsl(${hue} 70% ${dark ? 60 : 45}%)`;
  const bg = dark ? "#0c0d10" : "#fbfbfd";
  const fg = dark ? "#f4f4f6" : "#0a0a0c";
  const sub = dark ? "#a0a3ad" : "#6b6f76";
  const bodySize = Math.round(height * 0.032);
  const shapeX = width * (0.62 + rng() * 0.1);
  const shapeY = height * (0.3 + rng() * 0.2);
  const shapeR = height * (0.12 + rng() * 0.08);

  // Fit the headline into the left column (clear of the focal shape on the
  // right): wrap to width, and shrink the type until it lands in ≤3 lines.
  const titleLeft = Math.round(width * 0.08);
  const maxTitleWidth = width * 0.5;
  const minTitleSize = Math.round(height * 0.05);
  let titleSize = Math.round(height * 0.085);
  const fit = (size: number) => wrapLines(title, Math.max(6, Math.floor(maxTitleWidth / (size * 0.56))));
  let titleLines = fit(titleSize);
  while (titleLines.length > 3 && titleSize > minTitleSize) {
    titleSize = Math.round(titleSize * 0.9);
    titleLines = fit(titleSize);
  }
  const titleLineHeight = Math.round(titleSize * 1.08);
  const titleTop = Math.round(height * 0.42 - ((titleLines.length - 1) * titleLineHeight) / 2);
  const titleSvg = titleLines
    .map(
      (ln, i) =>
        `<text x="${titleLeft}" y="${titleTop + i * titleLineHeight}" font-size="${titleSize}" font-weight="700" fill="${fg}" font-family="DM Sans, Inter, Helvetica, Arial, sans-serif">${escapeXml(ln)}</text>`,
    )
    .join("\n");

  const bodyLines = body
    .map(
      (line, i) =>
        `<text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.55 + i * bodySize * 1.6)}" font-size="${bodySize}" fill="${sub}" font-family="Inter, Helvetica, Arial, sans-serif">${escapeXml(line)}</text>`,
    )
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <circle cx="${Math.round(shapeX)}" cy="${Math.round(shapeY)}" r="${Math.round(shapeR)}" fill="${accent}" opacity="0.92"/>
  <circle cx="${Math.round(shapeX - shapeR * 0.5)}" cy="${Math.round(shapeY + shapeR * 0.7)}" r="${Math.round(shapeR * 0.45)}" fill="${accent}" opacity="0.35"/>
  <rect x="${titleLeft}" y="${Math.round(height * 0.2)}" width="${Math.round(width * 0.06)}" height="6" rx="3" fill="${accent}"/>
  ${titleSvg}
  ${bodyLines}
  <text x="${Math.round(width * 0.08)}" y="${height - Math.round(height * 0.05)}" font-size="${Math.round(bodySize * 0.7)}" fill="${sub}" font-family="ui-monospace, monospace">substrate · preview</text>
</svg>`;

  return { bytes: Buffer.from(svg, "utf8"), ext: "svg", model: "substrate-preview" };
}

const MOCK_BEATS = (topic: string): ReadonlyArray<string> => [
  `Title slide: ${topic}`,
  `The problem ${topic} solves`,
  "Why now",
  "How it works",
  "Key benefit one",
  "Key benefit two",
  "Proof and traction",
  "Comparison to alternatives",
  "Roadmap",
  "Team",
  "The ask",
  `Closing: ${topic}`,
];

const renderMockEff = (input: RenderInput): Effect.Effect<RenderResult, ProviderError> =>
  Effect.sync(() => renderMock(input)).pipe(
    // Optional artificial latency so loading states are observable in dev.
    config.mockDelayMs > 0 ? Effect.delay(Duration.millis(config.mockDelayMs)) : (e) => e,
  );

// ---------------------------------------------------------------------------
// OpenAI GPT Image 2 (PRD §12). Parameterized by the live key/model from
// Settings so a key entered in the UI takes effect without a restart.
// ---------------------------------------------------------------------------

const API_BASE = "https://api.openai.com/v1";

function safeParseArray(raw: string): ReadonlyArray<string> {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr: unknown = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

const openaiRender = (apiKey: string, imageModel: string, input: RenderInput): Effect.Effect<RenderResult, ProviderError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${API_BASE}/images/generations`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        // NB: the GPT Image 2 API does not accept a `seed` parameter (the PRD
        // assumed it would). We keep the per-slide seed for the cache key and
        // the mock renderer, but never send it to OpenAI — it 400s otherwise.
        body: JSON.stringify({
          model: imageModel,
          prompt: input.assembledPrompt,
          size: ASPECT_SIZE[input.aspectRatio].openai,
          n: 1,
          quality: input.quality === "thinking" ? "high" : "medium",
        }),
      });
      if (!res.ok) throw new Error(`GPT Image 2 render failed (${res.status}): ${await res.text()}`);
      const json = (await res.json()) as { data?: ReadonlyArray<{ b64_json?: string }> };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("GPT Image 2 returned no image data");
      const bytes = Buffer.from(b64, "base64");
      // Validate the PNG signature before this can be written + cached. A
      // truncated/garbled payload must error the job, not become a permanent
      // `done` version that's re-served on every cache hit (AGENTS.md reliability).
      const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (bytes.length < PNG_MAGIC.length || PNG_MAGIC.some((b, i) => bytes[i] !== b)) {
        throw new Error("GPT Image 2 returned malformed PNG data");
      }
      return { bytes, ext: "png", model: imageModel };
    },
    catch: (cause) => new ProviderError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });

/** Extract assistant text from an OpenAI /v1/responses payload. The raw HTTP JSON
 *  has NO top-level `output_text` (that's a client-SDK convenience) — the text is
 *  in output[].content[] message items. Used by outline, titles, and design compile. */
function responseText(json: {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text;
  const parts: Array<string> = [];
  for (const item of json.output ?? []) {
    if (item?.type !== "message") continue;
    for (const c of item.content ?? []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

const openaiOutline = (
  apiKey: string,
  textModel: string,
  topic: string,
  count: number,
): Effect.Effect<ReadonlyArray<string>, ProviderError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${API_BASE}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: textModel,
          input: [
            {
              role: "system",
              content:
                "You outline slide decks. Given a topic and a slide count, return ONLY a JSON array of that many short strings, each describing one slide's intent. No prose, no markdown.",
            },
            { role: "user", content: `Topic: ${topic}\nSlides: ${count}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Outline generation failed (${res.status}): ${await res.text()}`);
      const json = (await res.json()) as Parameters<typeof responseText>[0];
      return safeParseArray(responseText(json) || "[]").slice(0, count);
    },
    catch: (cause) => new ProviderError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });

const openaiTitles = (
  apiKey: string,
  titleModel: string,
  prompts: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, ProviderError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${API_BASE}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: titleModel,
          input: [
            {
              role: "system",
              content:
                "You title slides. Given a JSON array of slide prompts, return ONLY a JSON array of the same length and order, where each item is a 2–5 word Title Case label summarizing that slide. No quotes, no trailing punctuation, no prose, no markdown.",
            },
            { role: "user", content: JSON.stringify(prompts) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Title generation failed (${res.status}): ${await res.text()}`);
      const json = (await res.json()) as Parameters<typeof responseText>[0];
      const parsed = safeParseArray(responseText(json) || "[]");
      // Fall back to a derived title for any item the model dropped, keeping order.
      return prompts.map((p, i) => (typeof parsed[i] === "string" && parsed[i].trim() ? parsed[i] : deriveSlideTitle(p)));
    },
    catch: (cause) => new ProviderError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });

/** Local distillation when running on the mock provider: strip frontmatter and
 *  markdown noise, keep the first couple of prose paragraphs as a usable prompt. */
function mockDesignPrompt(source: string): string {
  const body = source
    .replace(/^---[\s\S]*?---/, "")
    .replace(/`{1,3}/g, "")
    .replace(/^[#>*-]+\s?/gm, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
  const text = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 3).join(" ").replace(/\s+/g, " ");
  return (text || "A clean, modern slide design.").slice(0, 700);
}

const openaiDesignPrompt = (apiKey: string, textModel: string, source: string): Effect.Effect<string, ProviderError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${API_BASE}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: textModel,
          input: [
            {
              role: "system",
              content:
                "You convert a design-system spec (a DESIGN.md or design documentation) into ONE concise visual design prompt for an AI IMAGE model that renders slide-deck slides. Capture the palette (named colors + mood), typography feel, layout/composition, signature motifs, and overall aesthetic in vivid, concrete language the image model can follow. 90-140 words. Output ONLY the prompt text — no preamble, headings, or markdown.",
            },
            { role: "user", content: source.slice(0, 12000) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Design compile failed (${res.status}): ${await res.text()}`);
      const json = (await res.json()) as Parameters<typeof responseText>[0];
      const out = responseText(json).trim();
      if (!out) throw new Error("empty design prompt from model");
      return out;
    },
    catch: (cause) => new ProviderError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });

const make = Effect.gen(function* () {
  const settings = yield* Settings;
  const shape: ProviderShape = {
    info: Effect.map(settings.resolve, (s): ProviderInfo =>
      s.usingMock
        ? { name: "substrate-preview", model: "substrate-preview", usingMock: true }
        : { name: "openai-gpt-image-2", model: s.imageModel, usingMock: false },
    ),
    render: (input) =>
      Effect.flatMap(settings.resolve, (s) =>
        s.usingMock ? renderMockEff(input) : openaiRender(s.openaiApiKey, s.imageModel, input),
      ),
    outline: (topic, count) =>
      Effect.flatMap(settings.resolve, (s) =>
        s.usingMock ? Effect.sync(() => MOCK_BEATS(topic).slice(0, count)) : openaiOutline(s.openaiApiKey, s.textModel, topic, count),
      ),
    titles: (prompts) =>
      Effect.flatMap(settings.resolve, (s) =>
        s.usingMock
          ? Effect.sync(() => prompts.map(deriveSlideTitle))
          : openaiTitles(s.openaiApiKey, s.titleModel, prompts),
      ),
    designPrompt: (source) =>
      Effect.flatMap(settings.resolve, (s) =>
        s.usingMock ? Effect.sync(() => mockDesignPrompt(source)) : openaiDesignPrompt(s.openaiApiKey, s.textModel, source),
      ),
  };
  return shape;
});

export const ProviderLayer = Layer.effect(Provider, make);
