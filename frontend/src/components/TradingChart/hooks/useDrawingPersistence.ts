import { useRef, useCallback, useEffect } from "react";
import type { DrawingPoint } from "../types";
import {
  brushSegmentsFromLineToolsExport,
  clearGameDrawingPersistence,
  GAME_DRAWING_STORAGE_VERSION,
  readGameDrawingPersistence,
  writeGameDrawingPersistence,
} from "../utils/gameDrawingPersistence";
import {
  applyLockedViewport,
  scheduleReassertLockedViewport,
} from "./useWebSocket";
import { freezeAllBrushStrokes } from "./useLineTools";
import { ensureFreehandPaneViewsClamped } from "../utils/freehandPaneViewClamp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRef<T = any> = React.RefObject<T | null> | React.MutableRefObject<T | null>;

interface UseDrawingPersistenceParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineToolsRef: AnyRef<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chartRef: AnyRef<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seriesRef: AnyRef<any>;
  gameStartTimeRef: React.MutableRefObject<number | null>;
  fixedLogicalRangeRef: React.MutableRefObject<{ from: number; to: number } | null>;
  fixedPriceRangeRef: React.MutableRefObject<{ from: number; to: number } | null>;
  effectiveCoin: string;
  drawingSegmentsRef: React.MutableRefObject<DrawingPoint[][]>;
  devBrushPointsRef: React.MutableRefObject<DrawingPoint[]>;
  redrawDevDrawingOverlayRef: React.MutableRefObject<() => void>;
  drawingUndoStackRef: React.MutableRefObject<{ id: string; toolType: string }[]>;
  drawingRedoStackRef: React.MutableRefObject<string[]>;
  /** Optional external ref to populate — pass the same ref to useLineTools for shared access. */
  schedulePersistGameDrawingsRef?: React.MutableRefObject<(() => void) | null>;
}

interface UseDrawingPersistenceReturn {
  schedulePersistGameDrawingsRef: React.MutableRefObject<(() => void) | null>;
  restoreGameDrawingsFromStorageRef: React.MutableRefObject<() => void>;
}

export function useDrawingPersistence({
  lineToolsRef,
  chartRef,
  seriesRef,
  gameStartTimeRef,
  fixedLogicalRangeRef,
  fixedPriceRangeRef,
  effectiveCoin,
  drawingSegmentsRef,
  devBrushPointsRef,
  redrawDevDrawingOverlayRef,
  drawingUndoStackRef,
  drawingRedoStackRef,
  schedulePersistGameDrawingsRef: externalScheduleRef,
}: UseDrawingPersistenceParams): UseDrawingPersistenceReturn {
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredGameStartRef = useRef<number | null>(null);
  const internalScheduleRef = useRef<(() => void) | null>(null);
  const schedulePersistGameDrawingsRef = externalScheduleRef ?? internalScheduleRef;
  const restoreGameDrawingsFromStorageRef = useRef<() => void>(() => {});

  const flushPersistGameDrawingState = useCallback(() => {
    const lt = lineToolsRef.current;
    const t0 = gameStartTimeRef.current;
    if (!lt || t0 == null || typeof lt.exportLineTools !== "function") return;
    try {
      const lineToolsJson = lt.exportLineTools();
      writeGameDrawingPersistence(effectiveCoin, {
        v: GAME_DRAWING_STORAGE_VERSION,
        gameStartTime: t0,
        lineToolsJson,
      });
    } catch {
      /* ignore */
    }
  }, [effectiveCoin, lineToolsRef, gameStartTimeRef]);

  const schedulePersistGameDrawingState = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      flushPersistGameDrawingState();
    }, 120);
  }, [flushPersistGameDrawingState]);

  useEffect(() => {
    schedulePersistGameDrawingsRef.current = schedulePersistGameDrawingState;
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [schedulePersistGameDrawingState]);

  const restoreGameDrawingsFromStorage = useCallback(() => {
    const lt = lineToolsRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const t0 = gameStartTimeRef.current;
    const logical = fixedLogicalRangeRef.current;
    const price = fixedPriceRangeRef.current;
    if (!lt || !chart || !series || t0 == null) return;
    if (restoredGameStartRef.current === t0) return;

    const saved = readGameDrawingPersistence(effectiveCoin);
    if (!saved) {
      drawingUndoStackRef.current = [];
      drawingRedoStackRef.current = [];
      restoredGameStartRef.current = t0;
      return;
    }
    if (saved.gameStartTime !== t0) {
      clearGameDrawingPersistence(effectiveCoin);
      drawingUndoStackRef.current = [];
      drawingRedoStackRef.current = [];
      restoredGameStartRef.current = t0;
      return;
    }

    drawingUndoStackRef.current = [];
    drawingRedoStackRef.current = [];
    lt.removeAllLineTools();
    const ok = lt.importLineTools(saved.lineToolsJson);
    if (!ok) {
      restoredGameStartRef.current = t0;
      return;
    }
    ensureFreehandPaneViewsClamped(lt);
    freezeAllBrushStrokes(lt);
    drawingSegmentsRef.current = brushSegmentsFromLineToolsExport(saved.lineToolsJson);
    const segs = drawingSegmentsRef.current;
    if (segs.length > 0) {
      devBrushPointsRef.current = segs[segs.length - 1]!.slice();
    } else {
      devBrushPointsRef.current = [];
    }
    if (logical) {
      applyLockedViewport(chart, series, logical, price);
      scheduleReassertLockedViewport(chart, series, logical, price);
    }
    restoredGameStartRef.current = t0;
    requestAnimationFrame(() => redrawDevDrawingOverlayRef.current());
  }, [
    effectiveCoin,
    lineToolsRef,
    chartRef,
    seriesRef,
    gameStartTimeRef,
    fixedLogicalRangeRef,
    fixedPriceRangeRef,
    drawingSegmentsRef,
    devBrushPointsRef,
    redrawDevDrawingOverlayRef,
    drawingUndoStackRef,
    drawingRedoStackRef,
  ]);

  useEffect(() => {
    restoreGameDrawingsFromStorageRef.current = restoreGameDrawingsFromStorage;
  }, [restoreGameDrawingsFromStorage]);

  // Reset on coin change
  useEffect(() => {
    restoredGameStartRef.current = null;
    drawingUndoStackRef.current = [];
    drawingRedoStackRef.current = [];
  }, [effectiveCoin, drawingUndoStackRef, drawingRedoStackRef]);

  return { schedulePersistGameDrawingsRef, restoreGameDrawingsFromStorageRef };
}
