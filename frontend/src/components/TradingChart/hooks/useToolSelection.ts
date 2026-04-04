import { useRef, useState, useCallback, useEffect } from "react";
import type { AddToolOptions } from "./useLineTools";
import type { DrawingPoint } from "../types";

interface UseToolSelectionParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineToolsRef: React.RefObject<any | null>;
  addTool: (toolKey: string, opts?: AddToolOptions) => void;
  deactivateDrawingMode: () => void;
  isLockedRef: React.MutableRefObject<boolean>;
  brushAllowedRef: React.MutableRefObject<boolean>;
  fixedLogicalRangeRef: React.MutableRefObject<{ from: number; to: number } | null>;
  chartContainerRef: React.RefObject<HTMLDivElement | null>;
  devBrushPointsRef: React.MutableRefObject<DrawingPoint[]>;
  chartDebugModeRef: React.MutableRefObject<boolean>;
  redrawDevDrawingOverlayRef: React.MutableRefObject<() => void>;
  drawingUndoStackRef: React.MutableRefObject<{ id: string; toolType: string }[]>;
  drawingRedoStackRef: React.MutableRefObject<string[]>;
  emitDrawingCapability: (reason: string, options?: { forceLog?: boolean }) => void;
}

interface UseToolSelectionReturn {
  activeTool: string | null;
  activeToolRef: React.MutableRefObject<string | null>;
  pendingToolRef: React.MutableRefObject<string | null>;
  updateActiveTool: (toolKey: string | null) => void;
  tryApplyPendingTool: () => void;
  handleSelectTool: (toolKey: string) => void;
  addToolWithDevClear: (toolKey: string, opts?: AddToolOptions) => void;
  /** Stable ref wired to useLineTools onToolFinished — lives here (not in render body). */
  onStrokeFinishedContinuationRef: React.MutableRefObject<
    ((toolInfo: { toolType?: string; id?: string }) => void) | null
  >;
}

export function useToolSelection({
  lineToolsRef,
  addTool,
  deactivateDrawingMode,
  isLockedRef,
  brushAllowedRef,
  fixedLogicalRangeRef,
  chartContainerRef,
  devBrushPointsRef,
  chartDebugModeRef,
  redrawDevDrawingOverlayRef,
  drawingUndoStackRef,
  drawingRedoStackRef,
  emitDrawingCapability,
}: UseToolSelectionParams): UseToolSelectionReturn {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const activeToolRef = useRef<string | null>(null);
  const pendingToolRef = useRef<string | null>(null);
  const onStrokeFinishedContinuationRef = useRef<
    ((toolInfo: { toolType?: string; id?: string }) => void) | null
  >(null);

  // Keep addTool stable in closures
  const addToolRef = useRef(addTool);
  useEffect(() => {
    addToolRef.current = addTool;
  }, [addTool]);

  // Keep emitDrawingCapability stable in closures
  const emitRef = useRef(emitDrawingCapability);
  useEffect(() => {
    emitRef.current = emitDrawingCapability;
  }, [emitDrawingCapability]);

  const updateActiveTool = useCallback((toolKey: string | null) => {
    activeToolRef.current = toolKey;
    setActiveTool(toolKey);
  }, []);

  const addToolWithDevClear = useCallback(
    (toolKey: string, opts?: AddToolOptions) => {
      if (chartDebugModeRef.current && toolKey === "Brush") {
        devBrushPointsRef.current = [];
        requestAnimationFrame(() => redrawDevDrawingOverlayRef.current());
      }
      addToolRef.current(toolKey, opts);
    },
    [chartDebugModeRef, devBrushPointsRef, redrawDevDrawingOverlayRef],
  );

  const tryApplyPendingTool = useCallback(() => {
    const p = pendingToolRef.current;
    if (!p || isLockedRef.current) return;
    if (p === "Brush" && !brushAllowedRef.current) return;
    if (!lineToolsRef.current || !fixedLogicalRangeRef.current) return;
    pendingToolRef.current = null;
    addToolWithDevClear(p, { replacePreviousOfSameKind: p === "Brush" });
    requestAnimationFrame(() => {
      chartContainerRef.current?.focus({ preventScroll: true });
    });
    emitRef.current(`tryApplyPendingTool:${p}`, { forceLog: true });
  }, [
    isLockedRef,
    brushAllowedRef,
    lineToolsRef,
    fixedLogicalRangeRef,
    addToolWithDevClear,
    chartContainerRef,
  ]);

  const handleSelectTool = useCallback(
    (toolKey: string) => {
      if (isLockedRef.current) {
        emitRef.current("handleSelectTool:blocked-locked", { forceLog: true });
        return;
      }

      if (activeToolRef.current === toolKey) {
        pendingToolRef.current = null;
        updateActiveTool(null);
        deactivateDrawingMode();
        emitRef.current(`handleSelectTool:toggle-off:${toolKey}`, {
          forceLog: true,
        });
        return;
      }

      if (toolKey === "Brush" && !brushAllowedRef.current) {
        emitRef.current("handleSelectTool:blocked-brush-phase", {
          forceLog: true,
        });
        return;
      }

      updateActiveTool(toolKey);
      if (!lineToolsRef.current || !fixedLogicalRangeRef.current) {
        pendingToolRef.current = toolKey;
        queueMicrotask(() => {
          tryApplyPendingTool();
        });
        emitRef.current("handleSelectTool:pending-until-chart", {
          forceLog: true,
        });
        return;
      }
      pendingToolRef.current = null;
      addToolWithDevClear(toolKey, {
        replacePreviousOfSameKind:
          toolKey === "Brush" || toolKey === "FibRetracement",
      });
      requestAnimationFrame(() => {
        chartContainerRef.current?.focus({ preventScroll: true });
      });
      emitRef.current(`handleSelectTool:${toolKey}`, { forceLog: true });
    },
    [
      isLockedRef,
      brushAllowedRef,
      lineToolsRef,
      fixedLogicalRangeRef,
      updateActiveTool,
      deactivateDrawingMode,
      addToolWithDevClear,
      tryApplyPendingTool,
      chartContainerRef,
    ],
  );

  // Wire up onStrokeFinishedContinuationRef as a stable callback (not render-body mutation)
  const onStrokeFinished = useCallback(
    (toolInfo: { toolType?: string; id?: string }) => {
      const type = toolInfo?.toolType;
      if (
        type !== "Brush" &&
        type !== "TrendLine" &&
        type !== "Ray" &&
        type !== "HorizontalLine" &&
        type !== "FibRetracement"
      ) {
        return;
      }
      const finishedId = toolInfo?.id;
      if (
        typeof finishedId === "string" &&
        finishedId.length > 0 &&
        !isLockedRef.current
      ) {
        drawingRedoStackRef.current = [];
        drawingUndoStackRef.current.push({ id: finishedId, toolType: type });
      }
      if (isLockedRef.current) return;
      if (type === "Brush" && !brushAllowedRef.current) return;
      queueMicrotask(() => {
        if (isLockedRef.current) return;
        if (type === "Brush" && !brushAllowedRef.current) return;
        addToolRef.current(type, { replacePreviousOfSameKind: false });
        requestAnimationFrame(() => {
          chartContainerRef.current?.focus({ preventScroll: true });
        });
        emitRef.current(`stroke-continued:${type}`, { forceLog: true });
      });
    },
    [
      isLockedRef,
      brushAllowedRef,
      drawingRedoStackRef,
      drawingUndoStackRef,
      chartContainerRef,
    ],
  );

  useEffect(() => {
    onStrokeFinishedContinuationRef.current = onStrokeFinished;
  }, [onStrokeFinished]);

  return {
    activeTool,
    activeToolRef,
    pendingToolRef,
    updateActiveTool,
    tryApplyPendingTool,
    handleSelectTool,
    addToolWithDevClear,
    onStrokeFinishedContinuationRef,
  };
}
