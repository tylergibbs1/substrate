import type {
  AddSlideRequest,
  AspectRatio,
  CreateDeckRequest,
  DeckDetail,
  DeckSummary,
  DesignPreset,
  EditMode,
  ExportFormat,
  PromptEdit,
  Quality,
  ServerSettings,
} from "@substrate/contracts";

export type { ServerSettings } from "@substrate/contracts";

/** Thin REST client for the editor. Mirrors the server's HTTP surface. */

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface ServerStatus {
  provider: string;
  model: string;
  usingMock: boolean;
  mcpClients: number;
  concurrency: number;
  mcpUrl?: string;
  mcpToken?: string;
  jobs: { rendering: number; thinking: number; queued: number };
}

export interface SlideHistory {
  versions: Array<{
    id: string;
    imageBlobRef: string | null;
    seed: number;
    model: string;
    quality: Quality;
    createdAt: number;
  }>;
  edits: PromptEdit[];
  substrates: Array<{
    id: string;
    prompt: string;
    author: { kind: string; id: string };
    createdAt: number;
  }>;
}

export interface Variation {
  versionId: string;
  imageBlobRef: string;
  seed: number;
}

export const api = {
  status: () => req<ServerStatus>("/api/status"),
  settings: () => req<ServerSettings>("/api/settings"),
  updateSettings: (patch: {
    openaiApiKey?: string | null;
    anthropicApiKey?: string | null;
    agentProvider?: "anthropic" | "openai";
    agentModel?: string;
  }) => req<ServerSettings>("/api/settings", { method: "POST", body: JSON.stringify(patch) }),
  presets: () => req<DesignPreset[]>("/api/presets"),
  decks: () => req<DeckSummary[]>("/api/decks"),
  deck: (id: string) => req<DeckDetail>(`/api/decks/${id}`),

  createDeck: (body: CreateDeckRequest) =>
    req<{ deckId: string; outlineFailed: boolean }>("/api/decks", { method: "POST", body: JSON.stringify(body) }),

  // Create an empty deck and let an OpenAI agent fill it from a description; the
  // editor shows slides appear and render live. Returns the new deck id at once.
  buildDeck: (body: {
    description: string;
    aspectRatio?: AspectRatio;
    designPresetId?: string;
    designPrompt?: string;
    contextPath?: string;
  }) => req<{ deckId: string }>("/api/decks/build", { method: "POST", body: JSON.stringify(body) }),

  // The Assistant: the agent applies a follow-up tweak to an existing deck and
  // reports the edits it made (which also stream into the editor live).
  reviseDeck: (deckId: string, instruction: string) =>
    req<{ actions: string[]; text: string }>(`/api/decks/${deckId}/revise`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    }),

  // The getdesign.md collection, resolved server-side so the user picks in-app.
  designRegistry: () => req<Array<{ slug: string; name: string }>>("/api/design/registry"),

  // Compile a DESIGN.md (a getdesign.md slug, a URL, or pasted text) into a deck
  // main design prompt the image model can follow.
  compileDesign: (source: string) =>
    req<{ designPrompt: string }>("/api/design/compile", { method: "POST", body: JSON.stringify({ source }) }),

  setDesignPrompt: (deckId: string, designPrompt: string, mode: EditMode) =>
    req<{ applied: boolean; editId: string; affectedSlides: number }>(`/api/decks/${deckId}/design`, {
      method: "POST",
      body: JSON.stringify({ designPrompt, mode }),
    }),

  addSlide: (deckId: string, body: AddSlideRequest) =>
    req<{ slideId: string }>(`/api/decks/${deckId}/slides`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  reorder: (deckId: string, orderedSlideIds: string[]) =>
    req<{ ok: true }>(`/api/decks/${deckId}/reorder`, {
      method: "POST",
      body: JSON.stringify({ orderedSlideIds }),
    }),

  deleteSlide: (slideId: string) => req<{ deckId: string }>(`/api/slides/${slideId}`, { method: "DELETE" }),

  setReviewMode: (deckId: string, on: boolean) =>
    req<{ ok: true }>(`/api/decks/${deckId}/review`, { method: "POST", body: JSON.stringify({ on }) }),

  editSlidePrompt: (slideId: string, prompt: string, mode: EditMode) =>
    req<{ applied: boolean; editId: string }>(`/api/slides/${slideId}/prompt`, {
      method: "POST",
      body: JSON.stringify({ prompt, mode }),
    }),

  regenerate: (slideId: string, body: { quality?: Quality; reseed?: boolean }) =>
    req<{ jobId: string }>(`/api/slides/${slideId}/regenerate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  variations: (slideId: string, count: number) =>
    req<Variation[]>(`/api/slides/${slideId}/variations`, {
      method: "POST",
      body: JSON.stringify({ count }),
    }),

  pickVersion: (slideId: string, versionId: string) =>
    req<{ ok: true }>(`/api/slides/${slideId}/pick`, {
      method: "POST",
      body: JSON.stringify({ versionId }),
    }),

  history: (slideId: string) => req<SlideHistory>(`/api/slides/${slideId}/history`),

  resolveEdit: (editId: string, decision: "approve" | "reject") =>
    req<{ applied: boolean }>(`/api/edits/${editId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),

  // The manifest lists the bundle's files so the client can write them to a
  // user-chosen location (see lib/downloadExport.ts). The disk-writing /export
  // route stays for the MCP export_deck tool.
  exportManifest: (deckId: string, format: ExportFormat) =>
    req<ExportManifest>(`/api/decks/${deckId}/export/manifest?format=${format}`),

  // Generate display titles for any slides that lack one (the rail shows a
  // derived fallback until these land). A deck-changed event refreshes the deck.
  ensureTitles: (deckId: string) =>
    req<{ generated: number }>(`/api/decks/${deckId}/titles`, { method: "POST" }),
};

/** One file in an export bundle: an existing image blob or inline text. */
export interface ExportFile {
  name: string;
  blobRef?: string;
  text?: string;
}

export interface ExportManifest {
  files: ExportFile[];
  note?: string;
  suggestedName: string;
}

export function blobUrl(ref: string | null | undefined): string | null {
  return ref ? `/blobs/${ref}` : null;
}
