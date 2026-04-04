import { useEffect, useRef, type RefObject } from "react";
import type {
  ISeriesApi,
  IChartApi,
  LineData,
  Time,
  UTCTimestamp,
  WhitespaceData,
} from "lightweight-charts";
import type { Candle1s, ResolvedTradingChartGameConfig } from "../types";
import { toLW, fillCandleGaps, candlesToLine } from "../utils/candles";
import { applyDualPaneChartChrome } from "../utils/chartTimeScale";
import {
  applyLockedViewport,
  applyVisiblePriceRangeFromSeriesOrChart,
  brushZoneOnlyLogicalRange,
  refreshLockedPriceRangeFromLiveSeries,
  scheduleReassertLockedViewport,
} from "./useWebSocket";

/** Tur [T0, roundEnd] unix saniye — ikinci panel grafiği aynı pencereyi kullanır. */
export interface GameRoundWindow {
  startTime: number;
  endTime: number;
}

/** Dual column: lock-step with main chart (logical anchor, price band, optional bar spacing). */
export interface ChartDualSync {
  anchorLogical: number;
  priceRange: { from: number; to: number };
  visibleLogical?: { from: number; to: number };
  barSpacing?: number;
}

function normalizedLogicalRange(
  r: { from: number; to: number } | null | undefined,
): { from: number; to: number } | null {
  if (r == null) return null;
  if (!Number.isFinite(r.from) || !Number.isFinite(r.to)) return null;
  if (r.to - r.from <= 1e-9) return null;
  return { from: r.from, to: r.to };
}

/**
 * Sol panel `fixedLogicalRangeRef` ile kilitler; sağda `getVisibleLogicalRange()` öncelikli olunca
 * LWC’nin iç yuvarlaması yüzünden birkaç ondalık fark oluşup çizgi kayıyordu.
 * Sıra: paylaşılan ana ref → props’taki visibleLogical → canlı okuma → fırça bandı.
 */
function resolveSecondPaneVisibleLogical(
  mainLogicalRef: React.MutableRefObject<{
    from: number;
    to: number;
  } | null> | null | undefined,
  mainChart: IChartApi | null | undefined,
  dual: ChartDualSync,
  gameConfig: ResolvedTradingChartGameConfig,
): { from: number; to: number } {
  const fromShared = normalizedLogicalRange(mainLogicalRef?.current ?? null);
  if (fromShared) return fromShared;
  const fromDual = normalizedLogicalRange(dual.visibleLogical ?? null);
  if (fromDual) return fromDual;
  const live = normalizedLogicalRange(
    mainChart?.timeScale().getVisibleLogicalRange() ?? null,
  );
  if (live) return live;
  return brushZoneOnlyLogicalRange(dual.anchorLogical, gameConfig);
}

interface Params {
  wsUrl: string;
  coin: string;
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Area"> | null>;
  gameConfig: ResolvedTradingChartGameConfig;
  /** Same round [T0, end] as main chart; without it snapshot may mis-anchor T0. */
  gameWindow?: GameRoundWindow | null;
  dualSyncRef?: React.MutableRefObject<ChartDualSync | null>;
  dualSync?: ChartDualSync | null;
  /**
   * Main chart `fixedPriceRangeRef` (read-only in dual column); Y-range matches left pane.
   */
  mainChartPriceRangeRef?: React.MutableRefObject<{
    from: number;
    to: number;
  } | null> | null;
  /** Incremented when main live price band updates; reapplies Y from main ref in dual column. */
  mainPriceRangeVersion?: number;
  /** Kilit + çift sütun: sol grafiğin gerçek görünür mantıksal aralığı (props dualSync React yenilemeden güncellenmez). */
  mainChartRef?: RefObject<IChartApi | null> | null;
  /** Ana `fixedLogicalRangeRef` — sağ panel zaman eksenini piksel hizasında sol ile aynı tutar */
  mainChartLogicalRangeRef?: React.MutableRefObject<{
    from: number;
    to: number;
  } | null> | null;
}

function logicalIndexAtOrBeforeTime(
  filled: { time: UTCTimestamp }[],
  unixSeconds: number,
): number {
  if (filled.length === 0) return 0;
  let lo = 0;
  let hi = filled.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const mt = filled[mid].time as number;
    if (mt <= unixSeconds) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function expandPriceRangeToMinSpan(
  minP: number,
  maxP: number,
  gameConfig: ResolvedTradingChartGameConfig,
): { minP: number; maxP: number } {
  const mid = (minP + maxP) / 2;
  let span = maxP - minP;
  const pct = gameConfig.priceScaleMinSpanPercent;
  const minSpanRel = Number.isFinite(pct) ? Math.abs(mid) * (pct / 100) : 0;
  const minSpanAbs = Math.max(0, gameConfig.priceScaleMinSpanAbsolute);
  const floorSpan = Math.max(minSpanRel, minSpanAbs);
  if (floorSpan <= 0) {
    return { minP, maxP };
  }
  if (!Number.isFinite(span) || span < floorSpan) {
    span = floorSpan;
    return { minP: mid - span / 2, maxP: mid + span / 2 };
  }
  return { minP, maxP };
}

function computePaddedPriceRange(
  minP: number,
  maxP: number,
  gameConfig: ResolvedTradingChartGameConfig,
): { from: number; to: number } {
  if (!Number.isFinite(minP) || !Number.isFinite(maxP)) {
    return { from: 0, to: 1 };
  }
  const expanded = expandPriceRangeToMinSpan(minP, maxP, gameConfig);
  const lo = expanded.minP;
  const hi = expanded.maxP;
  const span = hi - lo;
  const mid = (lo + hi) / 2;
  const pad =
    span > 0
      ? span * 0.15
      : Math.max(Math.abs(mid) * 0.002, Math.abs(lo) * 0.0001, 1);
  return { from: lo - pad, to: hi + pad };
}

function lockPriceScaleFromSnapshot(
  chart: IChartApi,
  series: ISeriesApi<"Area">,
  candles: { high: number; low: number }[],
  fixedPriceRangeRef: React.MutableRefObject<{
    from: number;
    to: number;
  } | null>,
  gameConfig: ResolvedTradingChartGameConfig,
) {
  const n = candles.length;
  if (n === 0) return;
  const lookback = Math.min(
    n,
    gameConfig.totalRoundSeconds + gameConfig.observationSeconds + 30,
  );
  const slice = candles.slice(Math.max(0, n - lookback));
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of slice) {
    minP = Math.min(minP, c.low);
    maxP = Math.max(maxP, c.high);
  }
  const range = computePaddedPriceRange(minP, maxP, gameConfig);
  applyVisiblePriceRangeFromSeriesOrChart(chart, series, range);
  fixedPriceRangeRef.current = range;
}

function isLineValuePoint(
  d: LineData<Time> | WhitespaceData<Time>,
): d is LineData<Time> {
  return (
    "value" in d && typeof d.value === "number" && Number.isFinite(d.value)
  );
}

function getLastLineDatum(
  series: ISeriesApi<"Area">,
): { time: number; value: number } | null {
  const raw = series.data();
  for (let i = raw.length - 1; i >= 0; i--) {
    const d = raw[i];
    if (isLineValuePoint(d)) {
      return { time: d.time as number, value: d.value };
    }
  }
  return null;
}

function scheduleStabilizeVisibleRange(
  chart: IChartApi,
  series: ISeriesApi<"Area">,
  range: { from: number; to: number },
  price: { from: number; to: number } | null,
) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyLockedViewport(chart, series, range, price);
    });
  });
}

function applySyncedPriceRange(
  chart: IChartApi,
  series: ISeriesApi<"Area">,
  dual: ChartDualSync,
  fixedPriceRangeRef: React.MutableRefObject<{
    from: number;
    to: number;
  } | null>,
) {
  const range = {
    from: dual.priceRange.from,
    to: dual.priceRange.to,
  };
  fixedPriceRangeRef.current = range;
  applyVisiblePriceRangeFromSeriesOrChart(chart, series, range);
}

function normalizedPriceBand(
  r: { from: number; to: number } | null | undefined,
): { from: number; to: number } | null {
  if (r == null) return null;
  if (
    !Number.isFinite(r.from) ||
    !Number.isFinite(r.to) ||
    r.to === r.from
  ) {
    return null;
  }
  return r;
}

/**
 * Çift sütun: Y her zaman sol ile aynı olmalı — yerel snapshot bandına (`lockPriceScaleFromSnapshot`)
 * düşmek iki grafiği kayırır; önce paylaşılan ref, sonra `dual.priceRange`, en son (yalnız tek panel) yerel.
 */
function resolveSecondPaneViewportPrice(
  mainChartPriceRangeRef: React.MutableRefObject<{
    from: number;
    to: number;
  } | null> | null | undefined,
  localPriceRangeRef: React.MutableRefObject<{
    from: number;
    to: number;
  } | null>,
  dualFallback: ChartDualSync | null,
  forDualColumnSync: boolean,
): { from: number; to: number } | null {
  const fromMain = normalizedPriceBand(mainChartPriceRangeRef?.current ?? null);
  if (fromMain) return fromMain;
  const fromDual = normalizedPriceBand(dualFallback?.priceRange ?? null);
  if (fromDual) return fromDual;
  if (!forDualColumnSync) {
    return normalizedPriceBand(localPriceRangeRef.current);
  }
  return null;
}

/**
 * Second panel: same WS protocol as main; dual-column sync when locked.
 */
export function useSecondPaneChartWebSocket({
  wsUrl,
  coin,
  chartRef,
  seriesRef,
  gameConfig,
  gameWindow,
  dualSyncRef,
  dualSync,
  mainChartPriceRangeRef,
  mainPriceRangeVersion,
  mainChartRef,
  mainChartLogicalRangeRef,
}: Params) {
  const lastTimeRef = useRef<number | null>(null);
  const gameStartTimeRef = useRef<number | null>(null);
  const gameBrushZoneEndTimeRef = useRef<number | null>(null);
  const roundAnchorLogicalRef = useRef<number | null>(null);
  const fixedLogicalRangeRef = useRef<{ from: number; to: number } | null>(
    null,
  );
  const fixedPriceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const snapshotLoadedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const applyBrushViewportRef = useRef<(() => void) | null>(null);

  const getDual = (): ChartDualSync | null =>
    dualSyncRef?.current ?? dualSync ?? null;

  const syncPriceFromMain = mainChartPriceRangeRef != null;

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const dual = getDual();
    if (!chart || !series || !dual) return;

    roundAnchorLogicalRef.current = dual.anchorLogical;
    if (!snapshotLoadedRef.current) {
      const pm = resolveSecondPaneViewportPrice(
        mainChartPriceRangeRef,
        fixedPriceRangeRef,
        dual,
        syncPriceFromMain,
      );
      if (!pm) {
        applySyncedPriceRange(chart, series, dual, fixedPriceRangeRef);
      }
    }
    applyDualPaneChartChrome(chart, dual);
    const logical = resolveSecondPaneVisibleLogical(
      mainChartLogicalRangeRef,
      mainChartRef?.current ?? undefined,
      dual,
      gameConfig,
    );
    fixedLogicalRangeRef.current = logical;
    const price = resolveSecondPaneViewportPrice(
      mainChartPriceRangeRef,
      fixedPriceRangeRef,
      dual,
      syncPriceFromMain,
    );
    applyLockedViewport(chart, series, logical, price);
    scheduleReassertLockedViewport(chart, series, logical, price);
  }, [
    chartRef,
    seriesRef,
    gameConfig,
    mainChartPriceRangeRef,
    syncPriceFromMain,
    dualSync?.anchorLogical,
    dualSync?.priceRange.from,
    dualSync?.priceRange.to,
    dualSync?.visibleLogical?.from,
    dualSync?.visibleLogical?.to,
    dualSync?.barSpacing,
    mainChartRef,
    mainChartLogicalRangeRef,
  ]);

  /** Dual column: when main price band updates, re-lock Y from shared ref (separate WS ordering). */
  useEffect(() => {
    if (!syncPriceFromMain || mainChartPriceRangeRef == null) return;
    if (mainPriceRangeVersion === undefined) return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const dual = getDual();
    if (dual) {
      roundAnchorLogicalRef.current = dual.anchorLogical;
      applyDualPaneChartChrome(chart, dual);
    }
    const anchor = roundAnchorLogicalRef.current;
    if (anchor == null) return;

    const logical =
      dual != null
        ? resolveSecondPaneVisibleLogical(
            mainChartLogicalRangeRef,
            mainChartRef?.current ?? undefined,
            dual,
            gameConfig,
          )
        : brushZoneOnlyLogicalRange(anchor, gameConfig);
    fixedLogicalRangeRef.current = logical;
    const price = resolveSecondPaneViewportPrice(
      mainChartPriceRangeRef,
      fixedPriceRangeRef,
      dual,
      syncPriceFromMain,
    );
    applyLockedViewport(chart, series, logical, price);
    scheduleReassertLockedViewport(chart, series, logical, price);
  }, [
    mainPriceRangeVersion,
    chartRef,
    seriesRef,
    gameConfig,
    mainChartPriceRangeRef,
    syncPriceFromMain,
    dualSync?.anchorLogical,
    dualSync?.priceRange.from,
    dualSync?.priceRange.to,
    dualSync?.visibleLogical?.from,
    dualSync?.visibleLogical?.to,
    dualSync?.barSpacing,
    mainChartRef,
    mainChartLogicalRangeRef,
  ]);

  useEffect(() => {
    if (!coin) return;
    if (!chartRef.current || !seriesRef.current) return;

    seriesRef.current.setData([]);

    const ft0 = gameWindow?.startTime;
    const fEnd = gameWindow?.endTime;
    const useFixedRound =
      typeof ft0 === "number" &&
      Number.isFinite(ft0) &&
      typeof fEnd === "number" &&
      Number.isFinite(fEnd);

    lastTimeRef.current = null;
    roundAnchorLogicalRef.current = null;
    fixedLogicalRangeRef.current = null;
    fixedPriceRangeRef.current = null;
    snapshotLoadedRef.current = false;

    if (useFixedRound) {
      gameStartTimeRef.current = ft0;
      gameBrushZoneEndTimeRef.current = fEnd;
    } else {
      gameStartTimeRef.current = null;
      gameBrushZoneEndTimeRef.current = null;
    }

    const chart = chartRef.current;
    const series = seriesRef.current;
    const lastLiveWickRef: { current: { low: number; high: number } | null } =
      { current: null };

    let lastClose: number | null = null;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const applyBrushViewport = () => {
      const c = chartRef.current;
      const s = seriesRef.current;
      if (!c || !s) return;

      const dual = getDual();
      if (dual) {
        roundAnchorLogicalRef.current = dual.anchorLogical;
        if (!snapshotLoadedRef.current) {
          const pm = resolveSecondPaneViewportPrice(
            mainChartPriceRangeRef,
            fixedPriceRangeRef,
            dual,
            syncPriceFromMain,
          );
          if (!pm) {
            applySyncedPriceRange(c, s, dual, fixedPriceRangeRef);
          }
        }
        applyDualPaneChartChrome(c, dual);
      }

      const anchor = roundAnchorLogicalRef.current;
      if (anchor == null) return;
      const logical =
        dual != null
          ? resolveSecondPaneVisibleLogical(
              mainChartLogicalRangeRef,
              mainChartRef?.current ?? undefined,
              dual,
              gameConfig,
            )
          : brushZoneOnlyLogicalRange(anchor, gameConfig);
      fixedLogicalRangeRef.current = logical;
      const price = resolveSecondPaneViewportPrice(
        mainChartPriceRangeRef,
        fixedPriceRangeRef,
        dual,
        syncPriceFromMain,
      );
      applyLockedViewport(c, s, logical, price);
      scheduleReassertLockedViewport(c, s, logical, price);
    };

    applyBrushViewportRef.current = applyBrushViewport;

    function connectWs() {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ method: "subscribe", coin }));
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ method: "ping" }));
          }
        }, gameConfig.wsPingIntervalMs);
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "snapshot" && msg.data) {
          const arr = Array.isArray(msg.data) ? msg.data : [msg.data];
          const candles = (arr as Candle1s[])
            .map(toLW)
            .sort((a, b) => (a.time as number) - (b.time as number));

          const seen = new Set<number>();
          const unique = candles.filter((c) => {
            if (seen.has(c.time as number)) return false;
            seen.add(c.time as number);
            return true;
          });

          const filled = fillCandleGaps(unique);

          if (filled.length > 0) {
            const snapshotLast = filled[filled.length - 1].time as number;
            if (!useFixedRound) {
              if (
                gameStartTimeRef.current !== null &&
                lastTimeRef.current !== null
              ) {
                lastTimeRef.current = Math.max(
                  lastTimeRef.current,
                  snapshotLast,
                );
              } else {
                lastTimeRef.current = snapshotLast;
              }
              if (gameStartTimeRef.current === null) {
                const T0 = lastTimeRef.current;
                gameStartTimeRef.current = T0;
                gameBrushZoneEndTimeRef.current =
                  T0 + gameConfig.totalRoundSeconds;
              }
            }
          }

          const t0ForSeries = gameStartTimeRef.current;
          const roundEndSnap = gameBrushZoneEndTimeRef.current;
          const dataForChart =
            t0ForSeries !== null
              ? fillCandleGaps(
                  filled.filter((c) => {
                    const tm = c.time as number;
                    return (
                      tm >= t0ForSeries &&
                      (roundEndSnap === null || tm <= roundEndSnap)
                    );
                  }),
                )
              : filled;

          series.setData(candlesToLine(dataForChart));
          if (dataForChart.length > 0) {
            lastClose = dataForChart[dataForChart.length - 1].close;
            lastTimeRef.current = dataForChart[dataForChart.length - 1]
              .time as number;
          }
          const barCount = dataForChart.length;
          const t0 = gameStartTimeRef.current;
          const dualOnSnap = getDual();
          const anchor =
            dualOnSnap != null
              ? dualOnSnap.anchorLogical
              : t0 !== null && barCount > 0
                ? logicalIndexAtOrBeforeTime(dataForChart, t0)
                : Math.max(0, barCount - 1);
          roundAnchorLogicalRef.current = anchor;
          if (syncPriceFromMain) {
            if (dualOnSnap) {
              const pm = resolveSecondPaneViewportPrice(
                mainChartPriceRangeRef,
                fixedPriceRangeRef,
                dualOnSnap,
                true,
              );
              if (!pm) {
                applySyncedPriceRange(
                  chart,
                  series,
                  dualOnSnap,
                  fixedPriceRangeRef,
                );
              }
            }
          } else if (dualOnSnap) {
            const pm = resolveSecondPaneViewportPrice(
              mainChartPriceRangeRef,
              fixedPriceRangeRef,
              dualOnSnap,
              false,
            );
            if (!pm) {
              applySyncedPriceRange(
                chart,
                series,
                dualOnSnap,
                fixedPriceRangeRef,
              );
            }
          } else {
            lockPriceScaleFromSnapshot(
              chart,
              series,
              dataForChart,
              fixedPriceRangeRef,
              gameConfig,
            );
          }
          applyBrushViewport();
          const logical = fixedLogicalRangeRef.current;
          if (logical) {
            const price = resolveSecondPaneViewportPrice(
              mainChartPriceRangeRef,
              fixedPriceRangeRef,
              dualOnSnap,
              syncPriceFromMain,
            );
            scheduleStabilizeVisibleRange(chart, series, logical, price);
          }
          snapshotLoadedRef.current = true;
        }

        if (msg.type === "candle1s" && msg.data && !Array.isArray(msg.data)) {
          const data = toLW(msg.data);
          const currTime = data.time as number;
          const roundEnd = gameBrushZoneEndTimeRef.current;

          const tail = getLastLineDatum(series);
          const seriesLastT = tail?.time ?? null;

          const endStopAt = seriesLastT ?? lastTimeRef.current;
          if (roundEnd !== null && endStopAt !== null && endStopAt >= roundEnd) {
            return;
          }

          const targetTime =
            roundEnd !== null ? Math.min(currTime, roundEnd) : currTime;

          if (seriesLastT !== null && targetTime < seriesLastT) {
            return;
          }

          const bridgeFrom = seriesLastT ?? lastTimeRef.current;
          if (bridgeFrom !== null && targetTime > bridgeFrom + 1) {
            const nMissing = targetTime - bridgeFrom - 1;
            const fromPrice =
              tail !== null && Number.isFinite(tail.value)
                ? tail.value
                : lastClose !== null && Number.isFinite(lastClose)
                  ? lastClose
                  : data.open;
            for (let j = 1; j <= nMissing; j++) {
              const t = bridgeFrom + j;
              const alpha = j / (nMissing + 1);
              series.update({
                time: t as UTCTimestamp,
                value: fromPrice + (data.open - fromPrice) * alpha,
              });
            }
          }

          series.update({
            time: targetTime as UTCTimestamp,
            value: data.close,
          });
          lastClose = data.close;
          lastLiveWickRef.current = { low: data.low, high: data.high };
          lastTimeRef.current = targetTime;

          if (snapshotLoadedRef.current) {
            /* Dual column: Y band computed on main chart only; this pane uses mainChartPriceRangeRef. */
            if (!syncPriceFromMain) {
              const cCur = chartRef.current;
              if (cCur) {
                refreshLockedPriceRangeFromLiveSeries(
                  cCur,
                  series,
                  fixedPriceRangeRef,
                  gameConfig,
                  lastLiveWickRef.current,
                );
              }
            }
            applyBrushViewport();
          }

          if (!snapshotLoadedRef.current) {
            if (!useFixedRound && gameStartTimeRef.current === null) {
              const T0 = currTime;
              gameStartTimeRef.current = T0;
              gameBrushZoneEndTimeRef.current =
                T0 + gameConfig.totalRoundSeconds;
              roundAnchorLogicalRef.current = 0;
            }
            snapshotLoadedRef.current = true;
          }
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          reconnectTimer = setTimeout(connectWs, gameConfig.wsReconnectDelayMs);
        }
      };
    }

    connectWs();

    return () => {
      cancelled = true;
      applyBrushViewportRef.current = null;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [
    wsUrl,
    coin,
    chartRef,
    seriesRef,
    gameConfig,
    gameWindow?.startTime,
    gameWindow?.endTime,
    mainChartPriceRangeRef,
    syncPriceFromMain,
    mainChartRef,
    mainChartLogicalRangeRef,
  ]);

  /** Sol zaman ölçeği rAF ile güncellenince React render olmaz; sağ panel canlı logical ile eşitlenir (ws effect ref atar). */
  useEffect(() => {
    const main = mainChartRef?.current;
    const dualNow = getDual();
    if (!main || !dualNow) return;
    const ts = main.timeScale();
    const run = () => applyBrushViewportRef.current?.();
    ts.subscribeVisibleLogicalRangeChange(run);
    ts.subscribeVisibleTimeRangeChange(run);
    ts.subscribeSizeChange(run);
    queueMicrotask(run);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(run);
      ts.unsubscribeVisibleTimeRangeChange(run);
      ts.unsubscribeSizeChange(run);
    };
  }, [mainChartRef, dualSync?.anchorLogical, chartRef, dualSync]);
}
