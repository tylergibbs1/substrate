import { useEffect, useState } from "react";
import { desktop, type UpdateState } from "./desktop.js";

/**
 * Subscribes to the desktop auto-updater. Auto-update runs best-effort in the
 * background (electron-updater); this hook just reflects its state so the UI can
 * surface the actionable moment (an update has downloaded → offer a restart) and
 * a manual "check now". No-ops outside the desktop shell — `supported` is false
 * in the browser / `pnpm dev`, and the actions become safe no-ops.
 */
export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const bridge = desktop();
  const supported = !!bridge?.onUpdate;

  useEffect(() => {
    if (!bridge?.onUpdate) return;
    return bridge.onUpdate(setState);
  }, [bridge]);

  return {
    state,
    supported,
    check: () => {
      if (!bridge?.checkForUpdates) return;
      setState({ status: "checking" });
      void bridge.checkForUpdates();
    },
    restart: () => void bridge?.restartToUpdate?.(),
  };
}
