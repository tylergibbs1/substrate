import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Key, Check, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { api } from "../lib/api.js";
import { useEditor } from "../store.js";
import { Button, Chip, Eyebrow, IconButton } from "../ui.js";

/**
 * Settings — enter and persist the OpenAI API key. Saving switches the renderer
 * from the offline preview to GPT Image 2 immediately (no restart), and the key
 * is stored locally (0600) so it's entered once. The full key never comes back
 * from the server — only a masked tail for display.
 */
export function Settings() {
  const qc = useQueryClient();
  const open = useEditor((s) => s.settingsOpen);
  const setOpen = useEditor((s) => s.setSettingsOpen);
  const [key, setKey] = useState("");

  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings, enabled: open });
  const data = settings.data;

  const save = useMutation({
    mutationFn: (value: string | null) => api.setApiKey(value),
    onSuccess: (view) => {
      qc.setQueryData(["settings"], view);
      qc.invalidateQueries({ queryKey: ["status"] });
      setKey("");
    },
  });

  if (!open) return null;

  const canSave = key.trim().length > 0 && !save.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-ink-0/60" onClick={() => setOpen(false)}>
      <div
        className="animate-enter w-full max-w-lg rounded-lg border border-line-2 bg-ink-1 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-line">
          <span className="flex items-center gap-2 text-[13px] font-medium">
            <Key size={14} className="text-accent" /> Settings
          </span>
          <IconButton label="Close" onClick={() => setOpen(false)} className="-mr-1">
            <X size={14} />
          </IconButton>
        </header>

        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Eyebrow>OpenAI API key</Eyebrow>
              {data &&
                (data.usingMock ? (
                  <Chip tone="warn">
                    <Sparkles size={10} /> preview renderer
                  </Chip>
                ) : (
                  <Chip tone="ok">
                    <Check size={10} /> GPT Image 2 live
                  </Chip>
                ))}
            </div>

            {data?.hasKey ? (
              <p className="text-[11px] text-fg-dim">
                A key is set{data.keyFromEnv ? " via the OPENAI_API_KEY environment variable" : ""} —{" "}
                <span className="mono text-fg-faint">{data.keyMasked}</span>. Enter a new one below to replace it.
              </p>
            ) : (
              <p className="text-[11px] text-fg-dim">
                No key set — Substrate is using the offline preview renderer. Add your key to render with GPT Image 2.
              </p>
            )}

            <input
              type="password"
              value={key}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-…"
              aria-label="OpenAI API key"
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) save.mutate(key.trim());
              }}
              className="w-full bg-ink-3 border border-line-2 rounded-lg px-3 py-2 outline-none focus:border-accent mono text-[12px]"
            />

            <div className="flex items-center gap-2 pt-1">
              <Button variant="primary" disabled={!canSave} onClick={() => save.mutate(key.trim())}>
                {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save key
              </Button>
              {data?.hasKey && !data.keyFromEnv && (
                <Button variant="danger" disabled={save.isPending} onClick={() => save.mutate(null)}>
                  Remove key
                </Button>
              )}
            </div>

            {save.isError && <p className="text-danger text-xs">{(save.error as Error).message}</p>}
            {data?.forceMock && (
              <p className="text-[10px] text-warn">
                SUBSTRATE_FORCE_MOCK is set — the preview renderer is pinned regardless of any key.
              </p>
            )}
          </div>

          <p className="flex items-start gap-1.5 text-[10px] text-fg-faint border-t border-line pt-3">
            <ShieldCheck size={12} className="mt-0.5 shrink-0" />
            <span>
              Stored locally on this machine (<span className="mono">~/.../substrate/openai-key</span>, permissions 0600)
              and sent only to OpenAI when rendering. It persists across restarts — enter it once.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
