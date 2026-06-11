import { api, blobUrl, type ExportFile } from "./api.js";
import type { ExportFormat } from "@substrate/contracts";

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

/** Thrown when the user dismisses the destination picker — callers ignore it. */
export class ExportCancelled extends Error {
  constructor() {
    super("export cancelled");
    this.name = "ExportCancelled";
  }
}

export interface ExportResult {
  /** Where it landed — the chosen folder name, or "your downloads" for the fallback. */
  destination: string;
  note?: string;
}

async function fileBytes(file: ExportFile): Promise<Blob> {
  if (file.blobRef) {
    const res = await fetch(blobUrl(file.blobRef)!);
    if (!res.ok) throw new Error(`couldn't read ${file.name}`);
    return await res.blob();
  }
  return new Blob([file.text ?? ""], { type: "text/markdown" });
}

/**
 * Export a deck to a location the user picks — the standing rule is to always ask
 * where to download, never write to a fixed path. Uses the File System Access API
 * to write the image bundle + notes.md into a chosen folder; falls back to per-file
 * browser downloads where it is unavailable. Must be called from a user gesture.
 */
export async function downloadDeckExport(deckId: string, format: ExportFormat): Promise<ExportResult> {
  const picker = window.showDirectoryPicker;

  if (picker) {
    // Ask for the destination FIRST, while the click's activation is still fresh —
    // awaiting the manifest before the picker would spend the gesture and throw.
    let parent: FileSystemDirectoryHandle;
    try {
      parent = await picker({ id: "substrate-export", mode: "readwrite" });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw new ExportCancelled();
      throw e;
    }
    const manifest = await api.exportManifest(deckId, format);
    const dir = await parent.getDirectoryHandle(manifest.suggestedName, { create: true });
    for (const file of manifest.files) {
      const handle = await dir.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(await fileBytes(file));
      await writable.close();
    }
    return manifest.note === undefined
      ? { destination: manifest.suggestedName }
      : { destination: manifest.suggestedName, note: manifest.note };
  }

  // Fallback (no directory picker): hand each file to the browser's downloader,
  // which prompts for or uses the user's chosen download location.
  const manifest = await api.exportManifest(deckId, format);
  for (const file of manifest.files) {
    const href = URL.createObjectURL(await fileBytes(file));
    const a = document.createElement("a");
    a.href = href;
    a.download = `${manifest.suggestedName}-${file.name}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }
  return manifest.note === undefined
    ? { destination: "your downloads" }
    : { destination: "your downloads", note: manifest.note };
}
