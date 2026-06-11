import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DeckDetail, ServerEvent } from "@substrate/contracts";
import { useEditor } from "../store.js";

/**
 * Live event subscription (PRD §6.2 WS transport). The server pushes
 * deck/slide/job/edit/mcp events; we reflect them in the query cache so both
 * human and agent edits surface in real time.
 *
 * Reliability-first (AGENTS.md §3): the socket survives server restarts, laptop
 * sleep, and network blips. It reconnects with capped exponential backoff and
 * resyncs the visible deck on reopen, and it applies the `job-changed` payload
 * in place — a true delta channel, not a refetch-the-world on every render tick.
 */
export function useServerEvents(activeDeckId: string | null, onMcpClients: (n: number) => void): void {
  const qc = useQueryClient();
  const setWsConnected = useEditor((s) => s.setWsConnected);

  // Keep the live deck id in a ref so the long-lived socket always resyncs the
  // *current* deck on reconnect, without tearing down and re-dialing whenever
  // the user switches decks.
  const deckRef = useRef(activeDeckId);
  deckRef.current = activeDeckId;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closedByUs = false;

    const apply = (event: ServerEvent) => {
      switch (event.type) {
        case "mcp-clients":
          onMcpClients(event.count);
          break;
        case "job-changed":
          // Delta: patch the embedded job row into the cached deck in place.
          qc.setQueryData<DeckDetail>(["deck", event.deckId], (d) =>
            d
              ? {
                  ...d,
                  slides: d.slides.map((s) =>
                    s.id === event.slideId ? { ...s, jobStatus: event.job.status } : s,
                  ),
                }
              : d,
          );
          // A terminal transition can change the rendered image + job counts; pull
          // those once, cheaply, only when the job actually finishes or errors.
          if (event.job.status === "done" || event.job.status === "error") {
            qc.invalidateQueries({ queryKey: ["deck", event.deckId] });
            qc.invalidateQueries({ queryKey: ["status"] });
            qc.invalidateQueries({ queryKey: ["history", event.slideId] });
          }
          break;
        case "deck-changed":
        case "slide-changed":
        case "pending-edits-changed":
          qc.invalidateQueries({ queryKey: ["deck", event.deckId] });
          qc.invalidateQueries({ queryKey: ["decks"] });
          qc.invalidateQueries({ queryKey: ["status"] });
          if ("slideId" in event) qc.invalidateQueries({ queryKey: ["history", event.slideId] });
          break;
      }
    };

    const scheduleReconnect = () => {
      setWsConnected(false);
      if (closedByUs || reconnectTimer) return;
      // Capped exponential backoff: 0.5s → 1s → 2s → 4s → 8s.
      const delay = Math.min(8000, 500 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);

      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
        // We may have missed events while the socket was down — resync the
        // visible deck and the global lists so nothing is silently stale.
        const deckId = deckRef.current;
        if (deckId) qc.invalidateQueries({ queryKey: ["deck", deckId] });
        qc.invalidateQueries({ queryKey: ["decks"] });
        qc.invalidateQueries({ queryKey: ["status"] });
      };

      ws.onmessage = (e) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }
        apply(event);
      };

      // Either handler can fire; both funnel into a single backoff schedule.
      ws.onerror = () => ws?.close();
      ws.onclose = scheduleReconnect;
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [qc, onMcpClients, setWsConnected]);
}
