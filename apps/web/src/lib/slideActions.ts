import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.js";
import { useEditor } from "../store.js";
import type { DeckDetail, Slide } from "@substrate/contracts";

/**
 * Shared slide mutations (regenerate / variations / add). One place owns the
 * optimistic `jobStatus: "queued"` write and the not-already-busy guard, so the
 * keyboard shortcuts (Editor), the command palette, and the canvas buttons all
 * behave identically — instant rail feedback, no duplicate billed renders on a
 * rapid R, and errors surface on the mutation instead of being swallowed by a
 * bare `.then(invalidate)` (AGENTS.md: shared logic over duplicated local logic).
 */

/** A slide is busy if a job is queued or running — re-rendering it is a no-op. */
export function isSlideBusy(slide: Slide | null | undefined): boolean {
  return (
    slide?.jobStatus === "queued" ||
    slide?.jobStatus === "rendering" ||
    slide?.jobStatus === "thinking"
  );
}

export function useSlideActions(deckId: string) {
  const qc = useQueryClient();
  const quality = useEditor((s) => s.quality);
  const setActiveSlide = useEditor((s) => s.setActiveSlide);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["deck", deckId] });

  // Optimistically flip the slide to "queued" so the rail/canvas react instantly
  // (the only spinner the user waits on is the render itself).
  const markQueued = (slideId: string) => {
    qc.setQueryData<DeckDetail>(["deck", deckId], (d) =>
      d
        ? { ...d, slides: d.slides.map((s) => (s.id === slideId ? { ...s, jobStatus: "queued" } : s)) }
        : d,
    );
  };

  const regenerate = useMutation({
    mutationFn: ({ slideId, reseed }: { slideId: string; reseed?: boolean }) =>
      api.regenerate(slideId, { quality, ...(reseed !== undefined ? { reseed } : {}) }),
    onMutate: ({ slideId }) => markQueued(slideId),
    onSettled: invalidate,
  });

  const variations = useMutation({
    mutationFn: ({ slideId }: { slideId: string }) => api.variations(slideId, 4),
    onSettled: invalidate,
  });

  const addSlide = useMutation({
    mutationFn: () => api.addSlide(deckId, { prompt: "A new slide. Describe what it should say and show." }),
    onSuccess: ({ slideId }) => {
      invalidate();
      setActiveSlide(slideId);
    },
  });

  /**
   * Regenerate guarded by the slide's live status — the dedup the audit asked
   * for. Returns false when skipped so callers can no-op a keypress quietly.
   */
  const regenerateIfIdle = (slide: Slide | null | undefined, reseed = false): boolean => {
    if (!slide || (isSlideBusy(slide) && !reseed)) return false;
    regenerate.mutate({ slideId: slide.id, reseed });
    return true;
  };

  return { regenerate, regenerateIfIdle, variations, addSlide, markQueued, invalidate };
}
