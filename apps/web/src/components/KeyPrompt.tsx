import { X } from "lucide-react";
import { useEditor } from "../store.js";
import { ApiKeyForm } from "./ApiKeyForm.js";
import { OpenAI } from "./OpenAI.js";
import { IconButton } from "../ui.js";

/**
 * Contextual OpenAI-key prompt. Instead of a first-run wall, this appears at the
 * moment an action actually needs the key (Create a deck, Build, render a slide).
 * The user has already seen value — the demo deck opens first — so the ask lands
 * in context, and the action they attempted resumes the instant a key is saved.
 */
export function KeyPrompt() {
  const keyPrompt = useEditor((s) => s.keyPrompt);
  const setKeyPrompt = useEditor((s) => s.setKeyPrompt);
  if (!keyPrompt) return null;

  const close = () => setKeyPrompt(null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-ink-0/60" onClick={close}>
      <div
        className="animate-enter w-full max-w-md rounded-lg border border-line bg-ink-1 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-line">
          <span className="flex items-center gap-2 text-[13px] font-normal">
            <OpenAI className="w-4 h-4 text-fg" /> Connect OpenAI to render
          </span>
          <IconButton label="Close" onClick={close} className="-mr-1">
            <X size={14} />
          </IconButton>
        </header>
        <div className="p-4 space-y-3">
          <p className="text-[13px] text-fg-dim text-balance">{keyPrompt.reason}</p>
          <ApiKeyForm
            onKeySaved={() => {
              keyPrompt.onSaved?.();
              close();
            }}
          />
        </div>
      </div>
    </div>
  );
}
