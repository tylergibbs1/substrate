import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Events } from "./Events.ts";

/**
 * AgentActivity — the "an agent is at the controls" presence signal.
 *
 * A 3rd-party agent (Claude Code, Codex, …) drives Substrate over MCP. The
 * editor should visibly react to that, not just silently reflect the resulting
 * edits. mandrel models this with explicit `start/finish_working_on_feature`
 * transaction tools; we instead DEBOUNCE off the agent's actual tool calls, so
 * the presence works for ANY MCP client without requiring it to bracket its
 * work — the agent just edits, and the app lights up.
 *
 * `touch(deckId, agent)` is called on every agent-driven write. The first touch
 * for an idle deck emits `agent-activity { active: true }`; the deck is marked
 * idle again (emitting `active: false`) once `IDLE_MS` passes with no further
 * touch. State is per-deck so two decks can show independent activity, and the
 * agent name rides along so the UI can name who is working.
 */

// Real agents routinely pause >4s between tool calls (model reasoning, reading a
// large file, an async render). Hold presence well past that so the pill doesn't
// flicker mid-run; the in-app run bracket (agent-run) drives the precise feed/working
// state, while this is just the coarse "an agent is around" signal.
const IDLE_MS = 20000;

interface Live {
  readonly agent: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface AgentActivityShape {
  /** Register an agent action on a deck; (re)arms the idle countdown. */
  readonly touch: (deckId: string, agent: string) => Effect.Effect<void>;
}

export class AgentActivity extends Context.Service<AgentActivity, AgentActivityShape>()(
  "substrate/AgentActivity",
) {}

export const AgentActivityLayer = Layer.effect(
  AgentActivity,
  Effect.gen(function* () {
    const events = yield* Events;
    const live = new Map<string, Live>();

    // `events.publish(...)` carries no Effect requirements (Events is captured in
    // this closure), so it runs detached straight off the timer callback — no
    // runtime/context capture needed.
    const emit = (deckId: string, agent: string, active: boolean): void => {
      Effect.runFork(events.publish({ type: "agent-activity", deckId, agent, active }));
    };

    const goIdle = (deckId: string): void => {
      const entry = live.get(deckId);
      if (!entry) return;
      live.delete(deckId);
      emit(deckId, entry.agent, false);
    };

    const touch: AgentActivityShape["touch"] = (deckId, agent) =>
      Effect.sync(() => {
        const existing = live.get(deckId);
        if (existing) {
          clearTimeout(existing.timer);
          existing.timer = setTimeout(() => goIdle(deckId), IDLE_MS);
          existing.timer.unref?.();
          return;
        }
        // Leading edge: announce the agent took the controls, then arm idle.
        const timer = setTimeout(() => goIdle(deckId), IDLE_MS);
        timer.unref?.();
        live.set(deckId, { agent, timer });
        emit(deckId, agent, true);
      });

    return { touch };
  }),
);
