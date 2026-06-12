import { useEditor } from "../store.js";
import { ApiKeyForm } from "./ApiKeyForm.js";
import { OpenAI } from "./OpenAI.js";
import { Modal } from "../ui.js";

/**
 * Contextual OpenAI-key prompt. Instead of a first-run wall, this appears at the
 * moment an action actually needs the key (Create a deck, Build, render a slide).
 * The user has already seen value — the demo deck opens first — so the ask lands
 * in context, and the action they attempted resumes the instant a key is saved.
 */
export function KeyPrompt() {
  const keyPrompt = useEditor((s) => s.keyPrompt);
  const setKeyPrompt = useEditor((s) => s.setKeyPrompt);
  const close = () => setKeyPrompt(null);

  return (
    <Modal
      open={!!keyPrompt}
      onClose={close}
      icon={<OpenAI className="w-4 h-4 text-fg" />}
      title="Connect OpenAI to render"
      className="max-w-md"
    >
      {keyPrompt && (
        <div className="p-4 space-y-3">
          <p className="text-[13px] text-fg-dim text-balance">{keyPrompt.reason}</p>
          <ApiKeyForm
            onKeySaved={() => {
              keyPrompt.onSaved?.();
              close();
            }}
          />
        </div>
      )}
    </Modal>
  );
}
