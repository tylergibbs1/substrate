import { Key } from "lucide-react";
import { useEditor } from "../store.js";
import { Modal } from "../ui.js";
import { ApiKeyForm } from "./ApiKeyForm.js";

/**
 * Settings modal — wraps the shared key form (ApiKeyForm) in dismissible chrome.
 * Reachable any time from the picker or status rail; the contextual KeyPrompt
 * covers the no-key case at the moment an action needs a key.
 */
export function Settings() {
  const open = useEditor((s) => s.settingsOpen);
  const setOpen = useEditor((s) => s.setSettingsOpen);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      icon={<Key size={14} className="text-accent" />}
      title="Settings"
      className="max-w-lg"
    >
      <div className="p-4">
        <ApiKeyForm />
      </div>
    </Modal>
  );
}
