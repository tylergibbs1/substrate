import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, GripVertical, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { deriveSlideTitle } from "@substrate/shared/SlideTitle";
import { useEditor } from "../store.js";
import { Button, Chip, cx, IconButton, Tooltip } from "../ui.js";
import type { DeckDetail, Slide } from "@substrate/contracts";

/**
 * Slide rail (PRD §8): ordered slides, each showing a truncated *prompt* — the
 * rail is prompts, not thumbnails. Reorder with dnd-kit. Muted chrome that
 * steps forward only on hover/selection.
 */
export function SlideRail({ detail }: { detail: DeckDetail }) {
  const qc = useQueryClient();
  const activeSlideId = useEditor((s) => s.activeSlideId);
  const setActiveSlide = useEditor((s) => s.setActiveSlide);
  const [order, setOrder] = useState<string[] | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorder(detail.deck.id, ids),
    // Optimistically reorder the cached deck so there's no refetch flash.
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: ["deck", detail.deck.id] });
      const prev = qc.getQueryData<DeckDetail>(["deck", detail.deck.id]);
      qc.setQueryData<DeckDetail>(["deck", detail.deck.id], (d) =>
        d
          ? { ...d, slides: ids.map((sid, i) => ({ ...d.slides.find((s) => s.id === sid)!, orderIndex: i })) }
          : d,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["deck", detail.deck.id], ctx.prev);
    },
    onSettled: () => {
      setOrder(null);
      qc.invalidateQueries({ queryKey: ["deck", detail.deck.id] });
    },
  });

  const addSlide = useMutation({
    mutationFn: () => api.addSlide(detail.deck.id, { prompt: "A new slide. Describe what it should say and show." }),
    onSuccess: ({ slideId }) => {
      qc.invalidateQueries({ queryKey: ["deck", detail.deck.id] });
      setActiveSlide(slideId);
    },
  });

  const removeSlide = useMutation({
    mutationFn: (slideId: string) => api.deleteSlide(slideId),
    onSuccess: (_r, slideId) => {
      // Drop selection if the active slide went away (Editor re-selects the first).
      if (activeSlideId === slideId) setActiveSlide(null);
      qc.invalidateQueries({ queryKey: ["deck", detail.deck.id] });
    },
  });

  const slides = detail.slides;
  const ids = order ?? slides.map((s) => s.id);
  const pendingBySlide = new Set(
    detail.pendingEdits.filter((e) => e.target === "slide").map((e) => e.targetId),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const current = ids;
    const next = arrayMove(current, current.indexOf(String(active.id)), current.indexOf(String(over.id)));
    setOrder(next);
    reorder.mutate(next);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-3 h-9 shrink-0 border-b border-line mono text-[10px] uppercase tracking-wider text-fg-faint">
        <span>Slides</span>
        <Tooltip label="Add slide">
          <IconButton label="Add slide" tone="accent" onClick={() => addSlide.mutate()} className="-mr-1">
            <Plus size={14} />
          </IconButton>
        </Tooltip>
      </header>

      <div className="flex-1 overflow-auto py-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {ids.map((sid, i) => {
              const slide = slides.find((s) => s.id === sid);
              if (!slide) return null;
              return (
                <SlideRow
                  key={sid}
                  slide={slide}
                  index={i}
                  active={sid === activeSlideId}
                  hasPending={pendingBySlide.has(sid)}
                  onSelect={() => setActiveSlide(sid)}
                  onDelete={() => removeSlide.mutate(sid)}
                />
              );
            })}
          </SortableContext>
        </DndContext>

        {slides.length === 0 && (
          <div className="px-3 py-6 text-center text-fg-faint text-xs">
            No slides yet.
            <div className="mt-2">
              <Button onClick={() => addSlide.mutate()}>
                <Plus size={13} /> Add slide
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SlideRow({
  slide,
  index,
  active,
  hasPending,
  onSelect,
  onDelete,
}: {
  slide: Slide;
  index: number;
  active: boolean;
  hasPending: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const rendering = slide.jobStatus === "rendering" || slide.jobStatus === "thinking";
  const queued = slide.jobStatus === "queued";
  const errored = slide.jobStatus === "error";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        "group relative mx-1.5 my-0.5 rounded-lg border px-2 py-2 cursor-pointer transition-colors",
        active
          ? "border-accent bg-[color-mix(in_oklab,var(--color-accent)_9%,transparent)]"
          : "border-transparent hover:border-line hover:bg-ink-2",
        isDragging && "opacity-60",
      )}
      onClick={onSelect}
    >
      <button type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete slide"
        title="Delete slide"
        className="absolute top-1.5 right-1.5 grid place-items-center w-6 h-6 rounded-md text-fg-faint opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-ink-3 transition-colors"
      >
        <Trash2 size={13} />
      </button>
      <div className="flex items-start gap-1.5">
        <button type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 text-fg-faint opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={13} />
        </button>
        <span className="mono text-[10px] text-fg-faint mt-0.5 w-5 shrink-0">
          {String(index + 1).padStart(2, "0")}
        </span>
        {/* The title is a read-only label; the full prompt (the text-of-record)
            stays available on hover. Falls back to a derived headline until the
            AI title lands. */}
        <p
          className="text-[12px] leading-snug text-fg line-clamp-2 flex-1"
          title={slide.prompt}
        >
          {slide.title ?? deriveSlideTitle(slide.prompt)}
        </p>
      </div>
      <div className="flex items-center gap-1 mt-1.5 pl-7">
        {rendering && (
          <span className="inline-flex items-center gap-1 text-[10px] text-busy mono">
            <Loader2 size={10} className="animate-spin" /> {slide.jobStatus}
          </span>
        )}
        {queued && (
          <span className="inline-flex items-center gap-1 text-[10px] text-fg-faint mono">
            <span className="w-1.5 h-1.5 rounded-full bg-fg-faint/50" /> queued
          </span>
        )}
        {errored && (
          <span className="inline-flex items-center gap-1 text-[10px] text-danger mono">
            <AlertCircle size={10} /> error
          </span>
        )}
        {hasPending && <Chip tone="agent">proposal</Chip>}
      </div>
    </div>
  );
}
