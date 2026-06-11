import type { DesignPreset } from "@substrate/contracts";

/**
 * Built-in design presets (PRD §6.1). Apple-style is first and the default.
 * Each preset is a named main design prompt; framed as a design aesthetic, not a
 * clone of any company's proprietary assets (PRD §14).
 */
export const DEFAULT_PRESET_ID = "apple";

export const DESIGN_PRESETS: ReadonlyArray<Omit<DesignPreset, "styleRefBlobRef">> = [
  {
    id: "apple",
    name: "Apple-style",
    description:
      "Clean, minimal, generous whitespace, crisp typography, restrained color. A design aesthetic, not a brand clone.",
    isDefault: true,
    designPrompt: [
      "Design system: a calm, premium keynote aesthetic.",
      "Extreme minimalism with generous whitespace and a single clear focal point per slide.",
      "Typography: a crisp neutral grotesque sans-serif (Helvetica Neue / SF Pro feel), tight optical kerning, large confident headlines, restrained body text.",
      "Color: predominantly white or near-black backgrounds, one restrained accent color used sparingly. High contrast, no gradients unless subtle.",
      "Layout: strong grid, balanced negative space, content centered or anchored to a clean baseline. Nothing crowded.",
      "Imagery: photographic or product-render quality, soft realistic shadows, never clip-art. Avoid decorative borders, bevels, or skeuomorphism.",
      "Overall: quiet confidence. If in doubt, remove an element.",
    ].join(" "),
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Magazine-grade layout — serif headlines, strong columns, expressive whitespace.",
    isDefault: false,
    designPrompt: [
      "Design system: an editorial, magazine-grade layout.",
      "Typography: high-contrast serif headlines paired with a clean sans body, dramatic scale jumps, hanging punctuation feel.",
      "Color: warm paper-white or rich ink backgrounds with one or two accent inks.",
      "Layout: confident multi-column grids, pull quotes, generous margins, asymmetric balance.",
      "Imagery: full-bleed photography with editorial cropping. Refined, never busy.",
    ].join(" "),
  },
  {
    id: "technical",
    name: "Technical / Dark",
    description: "Dark, dense, IDE-flavored decks for engineering and product reviews.",
    isDefault: false,
    designPrompt: [
      "Design system: a dark, technical product aesthetic.",
      "Background near-black charcoal, subtle grid or dotted texture, cool neutral palette with a single saturated accent (electric blue or green).",
      "Typography: a geometric sans for headlines, a monospace for labels, identifiers, and data.",
      "Layout: precise alignment, diagram-friendly negative space, room for annotated callouts.",
      "Imagery: schematic, diagrammatic, or screenshot-like. Crisp, legible, engineering-grade.",
    ].join(" "),
  },
  {
    id: "bold",
    name: "Bold / Marketing",
    description: "High-energy marketing slides — saturated color, big type, momentum.",
    isDefault: false,
    designPrompt: [
      "Design system: a bold, high-energy marketing aesthetic.",
      "Color: saturated, confident color fields and tasteful gradients, strong figure-ground contrast.",
      "Typography: oversized expressive display type, tight leading, punchy short headlines.",
      "Layout: dynamic asymmetry, large shapes, a clear single message per slide with momentum.",
      "Imagery: vivid lifestyle or abstract 3D shapes. Energetic but still composed.",
    ].join(" "),
  },
];
