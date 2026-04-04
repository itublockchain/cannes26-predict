import type { IChartApi } from "lightweight-charts";
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type RefObject,
} from "react";
import { useChartSetup } from "./hooks/useChartSetup";
import { useSecondPaneChartWebSocket } from "./hooks/useSecondPaneChartWebSocket";
import { useSecondPaneChartOverlays } from "./hooks/useSecondPaneChartOverlays";
import { resolveGameConfig, type TradingChartGameConfig } from "./types";
import type {
  ChartDualSync,
  GameRoundWindow,
} from "./hooks/useSecondPaneChartWebSocket";
import styles from "./TradingChart.module.css";

export interface SecondPaneChartProps {
  wsUrl: string;
  coin?: string;
  gameConfig?: TradingChartGameConfig;
  /** Same round window as main `TradingChart` [T0, end]. */
  gameWindow?: GameRoundWindow | null;
  /** When main chart is locked: shared logical view, price band, bar spacing, time format. */
  dualSync?: ChartDualSync | null;
  /** Main chart `fixedPriceRangeRef` — Y-axis matches left pane. */
  mainChartPriceRangeRef?: MutableRefObject<{
    from: number;
    to: number;
  } | null> | null;
  /** Bumps when main price band updates; dual column reasserts Y scale. */
  mainPriceRangeVersion?: number;
  /** Sol chart API — kilit + çift sütunda görünür mantıksal aralık birebir kopyalanır. */
  mainChartRef?: RefObject<IChartApi | null> | null;
  /** Ana grafik `fixedLogicalRangeRef` — zaman ekseni sol ile aynı sayısal aralıkta kilitlenir. */
  mainChartLogicalRangeRef?: MutableRefObject<{
    from: number;
    to: number;
  } | null> | null;
}

/**
 * Right column chart: same candle stream and phase overlays as the main chart, read-only (no drawing tools).
 */
export function SecondPaneChart({
  wsUrl,
  coin = "BTC",
  gameConfig: gameConfigProp,
  gameWindow,
  dualSync,
  mainChartPriceRangeRef,
  mainPriceRangeVersion,
  mainChartRef,
  mainChartLogicalRangeRef,
}: SecondPaneChartProps) {
  const gameConfig = useMemo(
    () => resolveGameConfig(gameConfigProp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(gameConfigProp ?? null)],
  );
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const chartShellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineT0Ref = useRef<HTMLDivElement>(null);
  const lineObsEndRef = useRef<HTMLDivElement>(null);
  const lineTahminEndRef = useRef<HTMLDivElement>(null);
  const lineRoundEndRef = useRef<HTMLDivElement>(null);
  const gameTahminBgRef = useRef<HTMLDivElement>(null);
  const gameBgRef = useRef<HTMLDivElement>(null);

  const dualSyncRef = useRef<ChartDualSync | null>(dualSync ?? null);
  dualSyncRef.current = dualSync ?? null;

  const { chartRef, seriesRef } = useChartSetup(containerRef, undefined, {
    hideRightPriceScale: true,
    lastValueVisible: true,
    disableChartScroll: true,
  });
  useSecondPaneChartWebSocket({
    wsUrl,
    coin,
    chartRef,
    seriesRef,
    gameConfig,
    gameWindow: gameWindow ?? null,
    dualSyncRef,
    dualSync: dualSync ?? null,
    mainChartPriceRangeRef: mainChartPriceRangeRef ?? null,
    mainPriceRangeVersion,
    mainChartRef: mainChartRef ?? null,
    mainChartLogicalRangeRef: mainChartLogicalRangeRef ?? null,
  });

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    s.applyOptions({ lastValueVisible: dualSync == null });
  }, [dualSync, seriesRef]);

  useSecondPaneChartOverlays(
    chartRef,
    chartAreaRef,
    lineT0Ref,
    lineObsEndRef,
    lineTahminEndRef,
    lineRoundEndRef,
    gameTahminBgRef,
    gameBgRef,
    dualSync?.anchorLogical ?? null,
    gameConfig,
  );

  return (
    <div className={styles.secondPaneChartRoot}>
      <div className={styles.chartInfoBar} aria-label="Trading pair">
        {coin}/USDC
      </div>
      <div
        ref={chartAreaRef}
        className={styles.chartArea}
        style={
          {
            ["--trading-chart-overlay-bottom" as string]: `${gameConfig.overlayBottomPx}px`,
          } as CSSProperties
        }
      >
        <div
          ref={gameTahminBgRef}
          className={styles.gameTahminBgArea}
          aria-hidden
        />
        <div ref={gameBgRef} className={styles.gameBgArea} aria-hidden />
        <div ref={lineT0Ref} className={styles.gameStartLine} aria-hidden />
        <div ref={lineObsEndRef} className={styles.gameEndLine} aria-hidden />
        <div
          ref={lineTahminEndRef}
          className={styles.gameRedLine}
          aria-hidden
        />
        <div
          ref={lineRoundEndRef}
          className={styles.gameRoundEndLine}
          aria-hidden
        />
        <div ref={chartShellRef} className={styles.chartShell}>
          <div
            ref={containerRef}
            className={`${styles.chart} ${styles.chartScrollLocked}`}
            tabIndex={-1}
            aria-label="Chart — drawing tools disabled"
          />
        </div>
      </div>
    </div>
  );
}
