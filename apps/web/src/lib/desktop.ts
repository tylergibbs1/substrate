// Typed access to the Electron preload bridge (window.substrate). Present only in
// the packaged/desktop shell — undefined in the browser and in `pnpm dev`, so every
// caller treats it as optional. This is the single source of truth for the bridge
// shape (the picker, native export, and the auto-updater surface).

export interface UpdateState {
  status: "idle" | "checking" | "uptodate" | "downloading" | "downloaded" | "error";
  /** The available/downloaded version (when known). */
  version?: string;
  /** Download progress 0-100 (while status === "downloading"). */
  percent?: number;
  error?: string;
}

export interface SubstrateBridge {
  /** Native folder/file picker for attaching read-only file context. */
  pickPath?: (opts?: { directory?: boolean }) => Promise<string[] | string | null>;
  /** Native save-to-folder export (no File System Access API in Electron). */
  saveExport?: (payload: {
    suggestedName: string;
    files: Array<{ name: string; data: Uint8Array }>;
  }) => Promise<string | null>;
  /** Auto-update (electron-updater) — desktop only, no-ops in dev. */
  getVersion?: () => Promise<string>;
  checkForUpdates?: () => Promise<void>;
  restartToUpdate?: () => Promise<void>;
  /** Subscribe to updater state changes; returns an unsubscribe function. */
  onUpdate?: (cb: (state: UpdateState) => void) => () => void;
}

declare global {
  interface Window {
    substrate?: SubstrateBridge;
  }
}

/** The bridge if running inside the desktop shell, else undefined. */
export const desktop = (): SubstrateBridge | undefined =>
  typeof window !== "undefined" ? window.substrate : undefined;
