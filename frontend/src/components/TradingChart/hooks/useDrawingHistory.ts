import { useCallback } from "react";
import type { DrawingPoint } from "../types";
import { brushSegmentsFromLineToolsExport } from "../utils/gameDrawingPersistence";
import { ensureFreehandPaneViewsClamped } from "../utils/freehandPaneViewClamp";
import { freezeAllBrushStrokes, removeCreatingLineTools } from "./useLineTools";

interface UseDrawingHistoryParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineToolsRef: React.RefObject<any>;
  isLockedRef: React.MutableRefObject<boolean>;
  drawingUndoStackRef: React.MutableRefObject<{ id: string; toolType: string }[]>;
  drawingRedoStackRef: React.MutableRefObject<string[]>;
  drawingSegmentsRef: React.MutableRefObject<DrawingPoint[][]>;
  devBrushPointsRef: React.MutableRefObject<DrawingPoint[]>;
  redrawDevDrawingOverlayRef: React.MutableRefObject<() => void>;
  schedulePersistGameDrawingsRef: React.MutableRefObject<(() => void) | null>;
  reassertViewportAfterLineToolsMutation: () => void;
  emitDrawingCapability: (reason: string, options?: { forceLog?: boolean }) => void;
  removeSelected: () => void;
}

interface UseDrawingHistoryReturn {
  undoLastDrawing: () => void;
  redoLastDrawing: () => void;
  removeSelectedAndPersist: () => void;
}

export function useDrawingHistory({
  lineToolsRef,
  isLockedRef,
  drawingUndoStackRef,
  drawingRedoStackRef,
  drawingSegmentsRef,
  devBrushPointsRef,
  redrawDevDrawingOverlayRef,
  schedulePersistGameDrawingsRef,
  reassertViewportAfterLineToolsMutation,
  emitDrawingCapability,
  removeSelected,
}: UseDrawingHistoryParams): UseDrawingHistoryReturn {
  const undoLastDrawing = useCallback(() => {
    if (isLockedRef.current) return;
    const lt = lineToolsRef.current;
    if (!lt?.removeLineToolsById) return;

    const stack = drawingUndoStackRef.current;
    if (stack.length > 0) {
      const { id, toolType } = stack.pop()!;
      if (typeof lt.exportLineTools === "function") {
        try {
          const exported = lt.exportLineTools() as string;
          const arr = JSON.parse(exported) as { id?: string }[];
          if (Array.isArray(arr)) {
            const entry = arr.find((t) => t && t.id === id);
            if (entry) {
              drawingRedoStackRef.current.push(JSON.stringify([entry]));
            }
          }
        } catch {
          /* ignore */
        }
      }
      try {
        lt.removeLineToolsById([id]);
      } catch {
        /* ignore */
      }
      reassertViewportAfterLineToolsMutation();
      if (toolType === "Brush" && drawingSegmentsRef.current.length > 0) {
        drawingSegmentsRef.current.pop();
      }
      if (toolType === "Brush") {
        const segsAfterUndo = drawingSegmentsRef.current;
        devBrushPointsRef.current =
          segsAfterUndo.length > 0
            ? segsAfterUndo[segsAfterUndo.length - 1]!.slice()
            : [];
      }
      requestAnimationFrame(() => redrawDevDrawingOverlayRef.current());
      queueMicrotask(() => schedulePersistGameDrawingsRef.current?.());
      emitDrawingCapability("undo-last-drawing", { forceLog: true });
      return;
    }

    const cancelled = removeCreatingLineTools(lt);
    if (cancelled > 0) {
      reassertViewportAfterLineToolsMutation();
      queueMicrotask(() => schedulePersistGameDrawingsRef.current?.());
      emitDrawingCapability("undo-in-progress-drawing", { forceLog: true });
    }
  }, [
    isLockedRef,
    lineToolsRef,
    drawingUndoStackRef,
    drawingRedoStackRef,
    drawingSegmentsRef,
    devBrushPointsRef,
    redrawDevDrawingOverlayRef,
    schedulePersistGameDrawingsRef,
    reassertViewportAfterLineToolsMutation,
    emitDrawingCapability,
  ]);

  const redoLastDrawing = useCallback(() => {
    if (isLockedRef.current) return;
    const lt = lineToolsRef.current;
    if (!lt?.importLineTools) return;

    const redoStack = drawingRedoStackRef.current;
    if (redoStack.length === 0) return;

    const json = redoStack[redoStack.length - 1]!;
    let id: string | undefined;
    let toolType: string | undefined;
    try {
      const parsed = JSON.parse(json) as { id?: string; toolType?: string }[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const entry = parsed[0]!;
      id = entry.id;
      toolType = entry.toolType;
      const ok = lt.importLineTools(json);
      if (!ok) return;
      redoStack.pop();
    } catch {
      return;
    }

    if (typeof id === "string" && id.length > 0 && toolType) {
      drawingUndoStackRef.current.push({ id, toolType });
    }

    if (toolType === "Brush") {
      const segs = brushSegmentsFromLineToolsExport(json);
      const stroke = segs[0];
      if (stroke && stroke.length > 0) {
        drawingSegmentsRef.current.push(stroke);
      }
    }

    ensureFreehandPaneViewsClamped(lt);
    freezeAllBrushStrokes(lt);
    reassertViewportAfterLineToolsMutation();

    if (toolType === "Brush") {
      const segs = drawingSegmentsRef.current;
      devBrushPointsRef.current =
        segs.length > 0 ? segs[segs.length - 1]!.slice() : [];
      requestAnimationFrame(() => redrawDevDrawingOverlayRef.current());
    }

    queueMicrotask(() => schedulePersistGameDrawingsRef.current?.());
    emitDrawingCapability("redo-last-drawing", { forceLog: true });
  }, [
    isLockedRef,
    lineToolsRef,
    drawingRedoStackRef,
    drawingUndoStackRef,
    drawingSegmentsRef,
    devBrushPointsRef,
    redrawDevDrawingOverlayRef,
    schedulePersistGameDrawingsRef,
    reassertViewportAfterLineToolsMutation,
    emitDrawingCapability,
  ]);

  const removeSelectedAndPersist = useCallback(() => {
    drawingRedoStackRef.current = [];
    removeSelected();
    queueMicrotask(() => schedulePersistGameDrawingsRef.current?.());
  }, [removeSelected, drawingRedoStackRef, schedulePersistGameDrawingsRef]);

  return { undoLastDrawing, redoLastDrawing, removeSelectedAndPersist };
}
