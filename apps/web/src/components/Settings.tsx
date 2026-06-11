import { X, Key } from "lucide-react";
import { useEditor } from "../store.js";
import { IconButton } from "../ui.js";
import { ApiKeyForm } from "./ApiKeyForm.js";

/**
 * Settings modal — wraps the shared key form (ApiKeyForm) in dismissible chrome.
 * Reachable any time from the picker or status rail; the contextual KeyPrompt
 * covers the no-key case at the moment an action needs a key.
 */
export function Settings() {
  const open = useEditor((s) => s.settingsOpen);
  const setOpen = useEditor((s) => s.setSettingsOpen);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-ink-0/60" onClick={() => setOpen(false)}>
      <div
        className="animate-enter w-full max-w-lg rounded-lg border border-line-2 bg-ink-1 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-line">
          <span className="flex items-center gap-2 text-[13px] font-normal">
            <Key size={14} className="text-accent" /> Settings
          </span>
          <IconButton label="Close" onClick={() => setOpen(false)} className="-mr-1">
            <X size={14} />
          </IconButton>
        </header>
        <div className="p-4">
          <ApiKeyForm />
        </div>
      </div>
    </div>
  );
}
