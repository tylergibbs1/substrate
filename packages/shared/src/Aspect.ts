import type { AspectRatio } from "@substrate/contracts";

/**
 * Maps a deck aspect ratio to a GPT Image 2 size (PRD §12). Runtime constant —
 * lives in `@substrate/shared`, not `@substrate/contracts`, because contracts is
 * schema-only (see AGENTS.md).
 */
export const ASPECT_SIZE: Record<AspectRatio, { readonly width: number; readonly height: number; readonly openai: string }> = {
  "16:9": { width: 1536, height: 864, openai: "1536x864" },
  "4:3": { width: 1280, height: 960, openai: "1280x960" },
  "1:1": { width: 1024, height: 1024, openai: "1024x1024" },
};
