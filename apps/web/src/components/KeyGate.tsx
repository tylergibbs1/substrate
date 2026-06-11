import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { ApiKeyForm } from "./ApiKeyForm.js";
import { OpenAI } from "./OpenAI.js";

/**
 * First-run gate: until an OpenAI key is set, the editor is blocked behind a
 * single key-entry screen — the user sets their key before they ever reach the
 * deck picker. Saving flips the cached `hasKey` true and the app renders. If the
 * server can't be reached we don't block (the app shows its own connection
 * banner instead).
 */
export function KeyGate({ children }: { children: ReactNode }) {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });

  // Until we know, render nothing — avoids flashing the deck picker then the gate.
  if (settings.isLoading) return null;

  const needsKey = settings.data ? !settings.data.hasKey : false;
  if (!needsKey) return <>{children}</>;

  return (
    <div className="flex-1 grid place-items-center px-6">
      <div className="w-full max-w-md grid gap-5 -mt-[6vh]">
        <div className="grid gap-2 text-center">
          <div className="mx-auto grid place-items-center w-11 h-11 rounded-full border border-line bg-ink-3">
            <OpenAI className="w-6 h-6" />
          </div>
          <h1 className="text-2xl tracking-tight [letter-spacing:-0.03em]">Connect OpenAI to begin</h1>
          <p className="text-fg-dim text-[13px] text-balance">
            Substrate renders every slide with GPT Image 2. Add your OpenAI API key once to get started — it's
            stored locally and you won't be asked again.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-ink-2 p-4">
          <ApiKeyForm />
        </div>
      </div>
    </div>
  );
}
