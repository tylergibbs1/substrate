import { useEffect, useState } from "react";
import { Key, Loader2, Check, ArrowUpCircle } from "lucide-react";
import { useEditor } from "../store.js";
import { Button, Eyebrow, Modal } from "../ui.js";
import { ApiKeyForm } from "./ApiKeyForm.js";
import { desktop } from "../lib/desktop.js";
import { useUpdater } from "../lib/useUpdater.js";

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
      <div className="p-4 space-y-4">
        <ApiKeyForm />
        <UpdateSection />
      </div>
    </Modal>
  );
}

/**
 * Manual update control (desktop only). The global pill surfaces a ready update;
 * this lets a user pull rather than wait, and shows the running version.
 */
function UpdateSection() {
  const { state, supported, check, restart } = useUpdater();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void desktop()?.getVersion?.().then(setVersion);
  }, []);

  if (!supported) return null;

  const line = (() => {
    switch (state.status) {
      case "checking":
        return { icon: <Loader2 size={12} className="animate-spin" />, text: "Checking for updates…", tone: "text-fg-faint" };
      case "downloading":
        return {
          icon: <Loader2 size={12} className="animate-spin" />,
          text: `Downloading${state.percent != null ? ` ${state.percent}%` : "…"}`,
          tone: "text-fg-faint",
        };
      case "downloaded":
        return { icon: <ArrowUpCircle size={12} className="text-accent" />, text: `Update ready${state.version ? ` · ${state.version}` : ""}`, tone: "text-fg" };
      case "uptodate":
        return { icon: <Check size={12} className="text-ok" />, text: "You're on the latest version.", tone: "text-fg-faint" };
      case "error":
        return { icon: null, text: "Couldn't check for updates.", tone: "text-warn" };
      default:
        return null;
    }
  })();

  return (
    <div className="border-t border-line pt-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Eyebrow className="block">Updates</Eyebrow>
          <span className="text-[12px] text-fg-dim mono">{version ? `Version ${version}` : "Version —"}</span>
        </div>
        {state.status === "downloaded" ? (
          <Button variant="primary" onClick={() => restart()}>
            <ArrowUpCircle size={13} /> Restart to update
          </Button>
        ) : (
          <Button onClick={() => check()} disabled={state.status === "checking" || state.status === "downloading"}>
            Check for updates
          </Button>
        )}
      </div>
      {line && (
        <p className={`flex items-center gap-1.5 text-[11px] ${line.tone}`}>
          {line.icon}
          {line.text}
        </p>
      )}
    </div>
  );
}
