import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { api } from "../lib/api.js";
import { Button, Chip, Eyebrow } from "../ui.js";

/**
 * OpenAI key entry + persistence. Shared by the Settings modal and the first-run
 * KeyGate so the field, validation, and copy never diverge. Saving updates the
 * cached settings (and status) immediately — no restart; the gate dismisses as
 * soon as `hasKey` flips true.
 */
export function ApiKeyForm() {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const data = settings.data;

  const save = useMutation({
    mutationFn: (value: string | null) => api.setApiKey(value),
    onSuccess: (view) => {
      qc.setQueryData(["settings"], view);
      qc.invalidateQueries({ queryKey: ["status"] });
      setKey("");
    },
  });

  const canSave = key.trim().length > 0 && !save.isPending;

  return (
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
          Substrate renders every slide with OpenAI GPT Image 2. Paste your key to begin.
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

      <p className="flex items-start gap-1.5 text-[10px] text-fg-faint border-t border-line pt-3 mt-2">
        <ShieldCheck size={12} className="mt-0.5 shrink-0" />
        <span>
          Stored locally on this machine (<span className="mono">~/.../substrate/openai-key</span>, permissions 0600)
          and sent only to OpenAI when rendering. It persists across restarts — enter it once.
        </span>
      </p>
    </div>
  );
}
