import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { api } from "../lib/api.js";
import { Button, Chip, Eyebrow, cx } from "../ui.js";

/**
 * In-app settings — everything tweakable without touching env: the OpenAI key
 * (slide rendering), and the deck-building agent's provider, model, and Anthropic
 * key. Saving persists to the server's settings.json and takes effect at once.
 * Shared by the Settings modal and the first-run KeyGate.
 */
export function ApiKeyForm() {
  const qc = useQueryClient();
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [modelDraft, setModelDraft] = useState<string | null>(null);

  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const data = settings.data;

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateSettings>[0]) => api.updateSettings(patch),
    onSuccess: (view) => {
      qc.setQueryData(["settings"], view);
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const model = modelDraft ?? data?.agentModel ?? "";

  return (
    <div className="space-y-5">
      {/* OpenAI key — slide rendering */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Eyebrow>OpenAI API key · rendering</Eyebrow>
          {data &&
            (data.usingMock ? (
              <Chip tone="warn">
                <Sparkles size={10} /> preview
              </Chip>
            ) : (
              <Chip tone="ok">
                <Check size={10} /> GPT Image 2 live
              </Chip>
            ))}
        </div>
        {data?.hasKey ? (
          <p className="text-[11px] text-fg-dim">
            A key is set{data.keyFromEnv ? " via OPENAI_API_KEY" : ""} —{" "}
            <span className="mono text-fg-faint">{data.keyMasked}</span>. Replace it below.
          </p>
        ) : (
          <p className="text-[11px] text-fg-dim">Substrate renders every slide with GPT Image 2. Paste your key.</p>
        )}
        <input
          type="password"
          value={openaiKey}
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…"
          aria-label="OpenAI API key"
          onChange={(e) => setOpenaiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && openaiKey.trim()) {
              save.mutate({ openaiApiKey: openaiKey.trim() });
              setOpenaiKey("");
            }
          }}
          className="w-full bg-ink-3 border border-line-2 rounded-lg px-3 py-2 outline-none focus:border-accent mono text-[12px]"
        />
        <div className="flex items-center gap-2 pt-0.5">
          <Button
            variant="primary"
            disabled={!openaiKey.trim() || save.isPending}
            onClick={() => {
              save.mutate({ openaiApiKey: openaiKey.trim() });
              setOpenaiKey("");
            }}
          >
            <Check size={14} /> Save
          </Button>
          {data?.hasKey && !data.keyFromEnv && (
            <Button variant="danger" disabled={save.isPending} onClick={() => save.mutate({ openaiApiKey: null })}>
              Remove
            </Button>
          )}
        </div>
      </section>

      {/* Deck-building agent — provider, model, Anthropic key */}
      <section className="space-y-2 border-t border-line pt-4">
        <Eyebrow>Deck-building agent</Eyebrow>

        <div className="flex rounded-full border border-line-2 p-0.5 text-[11px]">
          {(["anthropic", "openai"] as const).map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => save.mutate({ agentProvider: p })}
              aria-pressed={data?.agentProvider === p}
              className={cx(
                "flex-1 rounded-full px-2 py-1 transition-colors",
                data?.agentProvider === p ? "bg-fg text-on-primary" : "text-fg-dim hover:text-fg",
              )}
            >
              {p === "anthropic" ? "Anthropic (Claude)" : "OpenAI"}
            </button>
          ))}
        </div>

        <label className="grid gap-1">
          <span className="text-[11px] text-fg-dim">Model</span>
          <div className="flex gap-2">
            <input
              value={model}
              spellCheck={false}
              aria-label="Agent model"
              onChange={(e) => setModelDraft(e.target.value)}
              className="flex-1 bg-ink-3 border border-line-2 rounded-lg px-3 py-2 outline-none focus:border-accent mono text-[12px]"
            />
            <Button
              disabled={save.isPending || !model.trim() || model.trim() === data?.agentModel}
              onClick={() => save.mutate({ agentModel: model.trim() })}
            >
              Save
            </Button>
          </div>
          <span className="text-[10px] text-fg-faint">e.g. claude-opus-4-8 · claude-sonnet-4-6 · gpt-5.1</span>
        </label>

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-fg-dim">Anthropic API key</span>
            {data &&
              (data.hasAnthropicKey ? (
                <Chip tone="ok">
                  <Check size={10} /> set
                </Chip>
              ) : (
                <Chip tone="warn">none</Chip>
              ))}
          </div>
          {data?.hasAnthropicKey && (
            <p className="text-[10px] text-fg-faint">
              Set{data.anthropicKeyFromEnv ? " via ANTHROPIC_API_KEY" : ""} —{" "}
              <span className="mono">{data.anthropicKeyMasked}</span>
            </p>
          )}
          <input
            type="password"
            value={anthropicKey}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            aria-label="Anthropic API key"
            onChange={(e) => setAnthropicKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && anthropicKey.trim()) {
                save.mutate({ anthropicApiKey: anthropicKey.trim() });
                setAnthropicKey("");
              }
            }}
            className="w-full bg-ink-3 border border-line-2 rounded-lg px-3 py-2 outline-none focus:border-accent mono text-[12px]"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              disabled={!anthropicKey.trim() || save.isPending}
              onClick={() => {
                save.mutate({ anthropicApiKey: anthropicKey.trim() });
                setAnthropicKey("");
              }}
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </Button>
            {data?.hasAnthropicKey && !data.anthropicKeyFromEnv && (
              <Button variant="danger" disabled={save.isPending} onClick={() => save.mutate({ anthropicApiKey: null })}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </section>

      {save.isError && <p className="text-danger text-xs">{(save.error as Error).message}</p>}
      {data?.forceMock && (
        <p className="text-[10px] text-warn">SUBSTRATE_FORCE_MOCK is set — the preview renderer is pinned regardless of any key.</p>
      )}

      <p className="flex items-start gap-1.5 text-[10px] text-fg-faint border-t border-line pt-3">
        <ShieldCheck size={12} className="mt-0.5 shrink-0" />
        <span>
          Stored locally on this machine (<span className="mono">~/.../substrate/settings.json</span>, permissions 0600)
          and sent only to the provider. Persists across restarts — no env editing needed.
        </span>
      </p>
    </div>
  );
}
