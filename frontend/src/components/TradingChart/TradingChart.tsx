import type {
  IChartApiBase,
  ISeriesApi,
  SeriesType,
  UTCTimestamp,
} from "lightweight-charts";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactElement,
} from "react";
import type {
  DrawingPoint,
  DrawingToolbarState,
  TradingChartProps,
} from "./types";
import { resolveGameConfig } from "./types";
import { useChartSetup } from "./hooks/useChartSetup";
import {
  useLineTools,
  removeNonBrushLineTools,
} from "./hooks/useLineTools";
import {
  useWebSocket,
  animateBrushZoneHalfScreenViewport,
  applyLockedViewport,
  brushZoneOnlyLogicalRange,
  reassertViewportAfterLineToolsPlugin,
  scheduleReassertLockedViewport,
  visibleLogicalForChartAfterTool,
} from "./hooks/useWebSocket";
import { useGameLogic } from "./hooks/useGameLogic";
import type { ChartDualSync } from "./hooks/useSecondPaneChartWebSocket";
import type { SecondPaneChartProps } from "./SecondPaneChart";
import { applyDrawingConstraints } from "./utils/constraints";
import { buildPaneDualSync } from "./utils/buildPaneDualSync";
import {
  applyChartTimeScaleStyle,
  applyDualPaneChartChrome,
} from "./utils/chartTimeScale";
import { cn } from "./utils/cn";
import { PEN_CURSOR } from "./chartConstants";
import { TradingChartToolbar } from "./TradingChartToolbar";
import { useTradingChartKeyboard } from "./hooks/useTradingChartKeyboard";
import { useTradingChartChartShellLayout } from "./hooks/useTradingChartChartShellLayout";
import { useDevOverlay } from "./hooks/useDevOverlay";
import { useDrawingPersistence } from "./hooks/useDrawingPersistence";
import { useDrawingHistory } from "./hooks/useDrawingHistory";
import { useGamePhase } from "./hooks/useGamePhase";
import { useToolSelection } from "./hooks/useToolSelection";
import styles from "./TradingChart.module.css";

export function TradingChart({
  wsUrl,
  coin: coinProp,
  gameConfig: gameConfigProp,
  onDrawingComplete,
  onGameStateChange,
  onDrawingToolbarChange,
  className,
  resultSidePane,
  onGameRoundWindowKnown,
}: TradingChartProps) {
  const gameConfig = useMemo(
    () => resolveGameConfig(gameConfigProp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(gameConfigProp ?? null)],
  );
  const gameConfigRef = useRef(gameConfig);
  gameConfigRef.current = gameConfig;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartShellRef = useRef<HTMLDivElement | null>(null);
  const lineT0Ref = useRef<HTMLDivElement | null>(null);
  const lineObsEndRef = useRef<HTMLDivElement | null>(null);
  const lineTahminEndRef = useRef<HTMLDivElement | null>(null);
  const lineRoundEndRef = useRef<HTMLDivElement | null>(null);
  const gameBgAreaRef = useRef<HTMLDivElement | null>(null);
  const gameTahminBgAreaRef = useRef<HTMLDivElement | null>(null);

  // ── Dual-pane ─────────────────────────────────────────────────────────────
  const hasResultSidePane = resultSidePane != null;
  const hasResultSidePaneRef = useRef(hasResultSidePane);
  hasResultSidePaneRef.current = hasResultSidePane;

  // ── Shared mutable state ──────────────────────────────────────────────────
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(false);
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  const [chartDebugMode, setChartDebugMode] = useState(false);
  const chartDebugModeRef = useRef(false);

  const effectiveCoin = coinProp ?? "BTC";

  // Viewport locks (shared across many hooks)
  const fixedLogicalRangeRef = useRef<{ from: number; to: number } | null>(null);
  const fixedPriceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const roundAnchorLogicalRef = useRef<number | null>(null);

  // Drawing state shared across hooks
  const drawingSegmentsRef = useRef<DrawingPoint[][]>([]);
  const devBrushPointsRef = useRef<DrawingPoint[]>([]);
  const drawingUndoStackRef = useRef<{ id: string; toolType: string }[]>([]);
  const drawingRedoStackRef = useRef<string[]>([]);

  // Animation refs
  const viewportAnimationActiveRef = useRef(false);
  const brushViewportAnimRafRef = useRef<number | null>(null);
  const brushPanViewportAppliedRef = useRef(false);
  const nonBrushToolsClearedAtBrushZoneStartRef = useRef(false);

  // Lifecycle refs
  const pauseLivePriceRangeRef = useRef(false);
  const flushLivePriceRangeRef = useRef<(() => void) | null>(null);
  const lineToolsBeforeChartRemoveRef = useRef<(() => void) | null>(null);

  // ── Chart setup ───────────────────────────────────────────────────────────
  const { chartRef, seriesRef } = useChartSetup(chartContainerRef, undefined, {
    beforeChartRemoveRef: lineToolsBeforeChartRemoveRef,
  });

  // ── Game logic ────────────────────────────────────────────────────────────
  const {
    gameStartTimeRef,
    gameStartPriceRef,
    gameObservationEndTimeRef,
    gameTahminEndTimeRef,
    gameBrushZoneEndTimeRef,
    gameStartLogicalRef,
    lastTimeRef,
    checkLockCondition,
    updateOverlayPositions,
  } = useGameLogic({
    chartRef,
    roundAnchorLogicalRef,
    gameConfig,
    onGameStateChange,
  });

  // ── Simple capability logger (no state, no re-renders) ───────────────────
  const emitDrawingCapability = useCallback(
    (reason: string, options?: { forceLog?: boolean }) => {
      if (options?.forceLog) {
        console.log("[DrawingCapability]", reason);
      }
    },
    [],
  );

  // Shared persist trigger — must exist before useLineTools so it can wire into it
  const schedulePersistGameDrawingsRef = useRef<(() => void) | null>(null);

  // ── Dev overlay ───────────────────────────────────────────────────────────
  const { drawingDebugCanvasRef, redrawDevDrawingOverlay, redrawDevDrawingOverlayRef } =
    useDevOverlay({
      chartRef: chartRef as React.RefObject<IChartApiBase<UTCTimestamp> | null>,
      seriesRef: seriesRef as React.RefObject<ISeriesApi<SeriesType, UTCTimestamp> | null>,
      chartShellRef,
      devBrushPointsRef,
      chartDebugModeRef,
    });

  // ── Stroke-finished bridge (useLineTools ↔ useToolSelection) ─────────────
  // Created before useLineTools so it can be captured by onToolFinished.
  const strokeContinuationForwardRef = useRef<
    ((toolInfo: { toolType?: string; id?: string }) => void) | null
  >(null);

  // ── Line tools ────────────────────────────────────────────────────────────
  const {
    lineToolsRef,
    initLineTools,
    addTool,
    removeSelected,
    deactivateDrawingMode,
    lockAllTools,
    cleanup,
  } = useLineTools({
    chartRef,
    seriesRef,
    fixedLogicalRangeRef,
    fixedPriceRangeRef,
    onDrawingComplete: (points) => {
      if (points.length > 0) {
        drawingSegmentsRef.current.push(points);
        devBrushPointsRef.current = points.slice();
      }
      onDrawingComplete?.(points);
      requestAnimationFrame(() => redrawDevDrawingOverlayRef.current());
    },
    onToolFinished: (info) => strokeContinuationForwardRef.current?.(info),
    schedulePersistGameDrawingsRef,
    pauseLivePriceRangeRef,
    flushLivePriceRangeRef,
  });
  lineToolsBeforeChartRemoveRef.current = cleanup;

  // ── Drawing persistence ───────────────────────────────────────────────────
  const { restoreGameDrawingsFromStorageRef } =
    useDrawingPersistence({
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
      schedulePersistGameDrawingsRef,
    });

  // ── Viewport correction after line-tools mutations ────────────────────────
  const reassertViewportAfterLineToolsMutation = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const game = fixedLogicalRangeRef.current;
    const price = fixedPriceRangeRef.current;
    if (!chart || !series || !game) return;
    const logical = visibleLogicalForChartAfterTool(chart, game);
    if (!logical) return;
    applyLockedViewport(chart, series, logical, price);
    reassertViewportAfterLineToolsPlugin(chart, series, logical, price);
  }, [chartRef, seriesRef]);

  // ── Drawing history (undo/redo) ───────────────────────────────────────────
  const { undoLastDrawing, redoLastDrawing, removeSelectedAndPersist } =
    useDrawingHistory({
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
    });

  // ── Game phase ────────────────────────────────────────────────────────────
  const { gamePhase, syncPhaseAndMaybeAutoBrush } = useGamePhase({
    gameStartTimeRef,
    lastTimeRef,
    gameObservationEndTimeRef,
    gameTahminEndTimeRef,
    isLockedRef,
    chartContainerRef,
    lineToolsRef,
    emitDrawingCapability,
  });

  // Derived — computed fresh every render, synced to ref for closures
  const brushAllowed = !isLocked && (chartDebugMode || gamePhase === 2);
  const brushAllowedRef = useRef(false);
  useEffect(() => {
    brushAllowedRef.current = brushAllowed;
  }, [brushAllowed]);

  // ── Tool selection ────────────────────────────────────────────────────────
  const {
    activeTool,
    activeToolRef,
    pendingToolRef,
    updateActiveTool,
    tryApplyPendingTool,
    handleSelectTool,
    addToolWithDevClear,
    onStrokeFinishedContinuationRef,
  } = useToolSelection({
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
  });

  // Wire the stroke-finished bridge — ref assignment is safe during render
  strokeContinuationForwardRef.current = (info) =>
    onStrokeFinishedContinuationRef.current?.(info);

  // ── Chart + line-tools ready ──────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    applyDrawingConstraints(
      lineToolsRef,
      gameStartTimeRef,
      gameObservationEndTimeRef,
      gameTahminEndTimeRef,
      gameBrushZoneEndTimeRef,
      gameStartLogicalRef,
      lastTimeRef,
      gameConfigRef,
      chartDebugModeRef,
    );
    initLineTools();

    queueMicrotask(() => {
      restoreGameDrawingsFromStorageRef.current();
      tryApplyPendingTool();
      console.log("[DrawingCapability] chart-line-tools-ready");
    });

    return () => {
      drawingUndoStackRef.current = [];
      drawingRedoStackRef.current = [];
    };
  }, [chartRef.current, seriesRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart debug mode toggle ───────────────────────────────────────────────
  useEffect(() => {
    chartDebugModeRef.current = chartDebugMode;
    console.log("[DrawingCapability] chart-debug-mode", chartDebugMode);
    requestAnimationFrame(() => redrawDevDrawingOverlay());
  }, [chartDebugMode, redrawDevDrawingOverlay]);

  // ── Brush mode guard: disable brush tool when phase closes ───────────────
  useEffect(() => {
    if (activeTool !== "Brush") return;
    if (brushAllowed) return;
    pendingToolRef.current = null;
    updateActiveTool(null);
    deactivateDrawingMode();
    console.log("[DrawingCapability] condition:brush-phase-closed-tool");
  }, [activeTool, brushAllowed, updateActiveTool, deactivateDrawingMode, pendingToolRef]);

  // ── Drawing toolbar state (synced from activeTool) ────────────────────────
  const [drawingToolbar, setDrawingToolbar] = useState<DrawingToolbarState>({
    activeDrawingToolKey: null,
    isEngaged: false,
  });
  useEffect(() => {
    const next: DrawingToolbarState = {
      activeDrawingToolKey: activeTool,
      isEngaged: activeTool !== null,
    };
    setDrawingToolbar(next);
    onDrawingToolbarChange?.(next);
  }, [activeTool, onDrawingToolbarChange]);

  // ── Overlay positioning ───────────────────────────────────────────────────
  const updateOverlays = useCallback(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    updateOverlayPositions(
      lineT0Ref.current,
      lineObsEndRef.current,
      lineTahminEndRef.current,
      lineRoundEndRef.current,
      gameTahminBgAreaRef.current,
      gameBgAreaRef.current,
      container,
    );
  }, [updateOverlayPositions]);

  const updateOverlaysRef = useRef(updateOverlays);
  updateOverlaysRef.current = updateOverlays;

  useEffect(() => {
    updateOverlays();
  }, [isLocked, updateOverlays]);

  // ── Per-tick orchestration ────────────────────────────────────────────────
  const performAfterTick = useCallback(() => {
    // Inject tool actions to break circular dep between useGamePhase ↔ useToolSelection
    syncPhaseAndMaybeAutoBrush({ addToolWithDevClear, updateActiveTool });

    const lt = lastTimeRef.current;
    const te = gameTahminEndTimeRef.current;
    const anchor = roundAnchorLogicalRef.current;
    if (lt !== null && te !== null && lt < te) {
      brushPanViewportAppliedRef.current = false;
      nonBrushToolsClearedAtBrushZoneStartRef.current = false;
    } else if (lt !== null && te !== null && lt >= te) {
      if (!nonBrushToolsClearedAtBrushZoneStartRef.current) {
        nonBrushToolsClearedAtBrushZoneStartRef.current = true;
        drawingUndoStackRef.current = [];
        drawingRedoStackRef.current = [];
        removeNonBrushLineTools(lineToolsRef.current);
        queueMicrotask(() => schedulePersistGameDrawingsRef.current?.());
      }
      if (!brushPanViewportAppliedRef.current && anchor != null) {
        const ok = animateBrushZoneHalfScreenViewport(
          chartRef,
          seriesRef,
          fixedLogicalRangeRef,
          fixedPriceRangeRef,
          anchor,
          gameConfigRef.current,
          viewportAnimationActiveRef,
          brushViewportAnimRafRef,
        );
        if (ok) brushPanViewportAppliedRef.current = true;
      }
    }

    if (checkLockCondition()) {
      if (!isLockedRef.current) {
        const segments = drawingSegmentsRef.current;
        console.log("[Drawing — oyun bitti]", {
          segments,
          flatPoints: segments.flat(),
          segmentCount: segments.length,
          totalPoints: segments.reduce((n, s) => n + s.length, 0),
        });
      }
      pendingToolRef.current = null;
      setIsLocked(true);
      lockAllTools();
      if (activeToolRef.current) updateActiveTool(null);
      deactivateDrawingMode();
      console.log("[DrawingCapability] game-locked");
    }
    updateOverlays();
    tryApplyPendingTool();
    if (chartDebugModeRef.current) {
      requestAnimationFrame(() => redrawDevDrawingOverlayRef.current());
    }
  }, [
    syncPhaseAndMaybeAutoBrush,
    addToolWithDevClear,
    updateActiveTool,
    checkLockCondition,
    lockAllTools,
    updateOverlays,
    tryApplyPendingTool,
    deactivateDrawingMode,
  ]);

  const performAfterTickRef = useRef(performAfterTick);
  performAfterTickRef.current = performAfterTick;

  // ── Locked viewport — snap to brush zone on lock ──────────────────────────
  useEffect(() => {
    if (!isLocked) return;
    let cancelled = false;
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const chart = chartRef.current;
        const series = seriesRef.current;
        const anchor = roundAnchorLogicalRef.current;
        const cfg = gameConfigRef.current;
        const price = fixedPriceRangeRef.current;
        if (!chart || !series || anchor == null) return;
        if (brushViewportAnimRafRef.current != null) {
          cancelAnimationFrame(brushViewportAnimRafRef.current);
          brushViewportAnimRafRef.current = null;
        }
        viewportAnimationActiveRef.current = false;
        const brushOnly = brushZoneOnlyLogicalRange(anchor, cfg);
        fixedLogicalRangeRef.current = brushOnly;
        applyLockedViewport(chart, series, brushOnly, price);
        scheduleReassertLockedViewport(chart, series, brushOnly, price);
        requestAnimationFrame(() => {
          updateOverlaysRef.current();
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
    };
  }, [isLocked]);

  // ── WebSocket callbacks ───────────────────────────────────────────────────
  const onWsSnapshotLoaded = useCallback(() => {
    queueMicrotask(() => {
      restoreGameDrawingsFromStorageRef.current();
      performAfterTickRef.current();
    });
    setTimeout(() => updateOverlaysRef.current(), 0);
  }, []);

  const onWsCandleTick = useCallback(() => {
    performAfterTickRef.current();
  }, []);

  const onRoundWindowFromWs = useCallback(
    (start: number, end: number) => {
      onGameRoundWindowKnown?.({ startTime: start, endTime: end });
    },
    [onGameRoundWindowKnown],
  );

  // ── Dual-pane price range sync ────────────────────────────────────────────
  const [mainPriceRangeVersion, setMainPriceRangeVersion] = useState(0);
  const livePriceRangeNotifyRef = useRef<(() => void) | null>(null);
  livePriceRangeNotifyRef.current = () => {
    if (isLockedRef.current && hasResultSidePaneRef.current) {
      setMainPriceRangeVersion((n) => n + 1);
    }
  };

  useWebSocket({
    wsUrl,
    coin: effectiveCoin,
    chartRef,
    seriesRef,
    lastTimeRef,
    gameStartTimeRef,
    gameStartPriceRef,
    gameObservationEndTimeRef,
    gameTahminEndTimeRef,
    gameBrushZoneEndTimeRef,
    roundAnchorLogicalRef,
    fixedLogicalRangeRef,
    fixedPriceRangeRef,
    gameConfig,
    onSnapshotLoaded: onWsSnapshotLoaded,
    onCandleTick: onWsCandleTick,
    pauseLivePriceRangeRef,
    flushLivePriceRangeRef,
    viewportAnimationActiveRef,
    onGameRoundWindowKnown: onRoundWindowFromWs,
    livePriceRangeNotifyRef,
  });

  // ── Dual-pane sync ────────────────────────────────────────────────────────
  const computePaneDualSync = useCallback((): ChartDualSync | null => {
    if (!isLocked || !hasResultSidePane) return null;
    const anchor = roundAnchorLogicalRef.current;
    const chart = chartRef.current;
    const base = buildPaneDualSync(
      chart ?? undefined,
      anchor,
      fixedPriceRangeRef.current,
    );
    if (!base || anchor == null) return null;
    const lockedLogical = fixedLogicalRangeRef.current;
    const liveVis = chart?.timeScale().getVisibleLogicalRange() ?? null;
    const fallback = brushZoneOnlyLogicalRange(anchor, gameConfig);
    const visible = lockedLogical ?? liveVis ?? fallback;
    return {
      ...base,
      visibleLogical: { from: visible.from, to: visible.to },
    };
  }, [isLocked, hasResultSidePane, gameConfig]);

  useEffect(() => {
    const chart = chartRef.current;
    const ser = seriesRef.current;
    if (!chart || !ser) return;
    const dualPane = isLocked && hasResultSidePane;
    const paneDualSyncLocal = computePaneDualSync();

    if (dualPane) {
      chart.applyOptions({ rightPriceScale: { visible: false } });
      ser.applyOptions({ lastValueVisible: false });
      if (paneDualSyncLocal) {
        applyDualPaneChartChrome(chart, paneDualSyncLocal);
      }
    } else {
      chart.applyOptions({ rightPriceScale: { visible: true } });
      ser.applyOptions({ lastValueVisible: true });
      applyChartTimeScaleStyle(chart, "full");
    }

    const logical = fixedLogicalRangeRef.current;
    const price = fixedPriceRangeRef.current;
    if (!logical || !price) return;

    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const c = chartRef.current;
        const s = seriesRef.current;
        if (c && s) {
          applyLockedViewport(c, s, logical, price);
          scheduleReassertLockedViewport(c, s, logical, price);
        }
      });
    });
  }, [isLocked, hasResultSidePane, computePaneDualSync, mainPriceRangeVersion]);

  // ── Shell layout hook ─────────────────────────────────────────────────────
  useTradingChartChartShellLayout({
    chartRef,
    seriesRef,
    chartContainerRef,
    chartShellRef,
    isLocked,
    hasResultSidePane,
    updateOverlays,
    redrawDevDrawingOverlay,
    fixedLogicalRangeRef,
    fixedPriceRangeRef,
    roundAnchorLogicalRef,
    gameConfigRef,
    isLockedRef,
    hasResultSidePaneRef,
    brushPanViewportAppliedRef,
    viewportAnimationActiveRef,
    brushViewportAnimRafRef,
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useTradingChartKeyboard({
    isLocked,
    setChartDebugMode,
    undoLastDrawing,
    redoLastDrawing,
    handleSelectTool,
    removeSelectedAndPersist,
  });

  // ── Delete selected ───────────────────────────────────────────────────────
  const handleDeleteSelected = useCallback(() => {
    if (isLocked) return;
    pendingToolRef.current = null;
    removeSelectedAndPersist();
    updateActiveTool(null);
    deactivateDrawingMode();
    console.log("[DrawingCapability] deleteSelected");
  }, [
    isLocked,
    removeSelectedAndPersist,
    updateActiveTool,
    deactivateDrawingMode,
    pendingToolRef,
  ]);

  // ── globalThis debug (only when debug mode on) ────────────────────────────
  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    if (!chartDebugMode) {
      delete g.__tradingChartDrawingToolbar;
      return;
    }
    g.__tradingChartDrawingToolbar = drawingToolbar;
  }, [chartDebugMode, drawingToolbar]);

  // ── Pen cursor ────────────────────────────────────────────────────────────
  const penCursorActive =
    !isLocked && brushAllowed && activeTool === "Brush";

  const paneDualSync: ChartDualSync | null = computePaneDualSync();

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className={cn(styles.wrapper, className)}>
      <TradingChartToolbar
        isLocked={isLocked}
        activeTool={activeTool}
        brushAllowed={brushAllowed}
        onSelectTool={handleSelectTool}
        onDeleteSelected={handleDeleteSelected}
      />

      <div className={styles.mainColumn}>
        <div
          className={cn(
            styles.chartWorkspace,
            isLocked && hasResultSidePane && styles.chartWorkspaceDual,
          )}
        >
          <div
            className={cn(
              styles.chartLeftPane,
              isLocked ? styles.chartLeftPaneHalf : styles.chartLeftPaneFull,
            )}
          >
            <div className={styles.chartInfoBar} aria-label="Trading pair">
              {effectiveCoin}/USDC
            </div>
            <div
              className={styles.chartArea}
              style={
                {
                  ["--trading-chart-overlay-bottom" as string]: `${gameConfig.overlayBottomPx}px`,
                } as CSSProperties
              }
            >
              <div
                ref={gameTahminBgAreaRef}
                className={styles.gameTahminBgArea}
              />
              <div ref={gameBgAreaRef} className={styles.gameBgArea} />
              <div ref={lineT0Ref} className={styles.gameStartLine} />
              <div ref={lineObsEndRef} className={styles.gameEndLine} />
              <div ref={lineTahminEndRef} className={styles.gameRedLine} />
              <div ref={lineRoundEndRef} className={styles.gameRoundEndLine} />
              {chartDebugMode ? (
                <div className={styles.devDrawingPointsBadge} aria-hidden>
                  Debug: points · Shift+B
                </div>
              ) : null}
              <div ref={chartShellRef} className={styles.chartShell}>
                <div
                  ref={chartContainerRef}
                  className={cn(
                    styles.chart,
                    penCursorActive && styles.chartPenCursor,
                  )}
                  style={
                    penCursorActive
                      ? ({
                          cursor: PEN_CURSOR,
                          ["--trading-chart-pen-cursor" as string]: PEN_CURSOR,
                        } as CSSProperties)
                      : undefined
                  }
                  tabIndex={-1}
                  aria-label="Grafik — çizim için alan"
                />
                <canvas
                  ref={drawingDebugCanvasRef}
                  className={styles.drawingDebugCanvas}
                  aria-hidden
                />
              </div>
            </div>
          </div>
          {isLocked ? (
            <>
              <div className={styles.chartWorkspaceDivider} aria-hidden />
              <div
                className={styles.chartRightPlaceholder}
                aria-label={resultSidePane ? "Second chart column" : undefined}
              >
                {isValidElement(resultSidePane)
                  ? cloneElement(
                      resultSidePane as ReactElement<SecondPaneChartProps>,
                      {
                        dualSync: paneDualSync,
                        mainChartPriceRangeRef: fixedPriceRangeRef,
                        mainChartLogicalRangeRef: fixedLogicalRangeRef,
                        mainPriceRangeVersion,
                        mainChartRef: chartRef,
                      },
                    )
                  : (resultSidePane ?? null)}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
