import { useRef, useCallback } from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { ResolvedTradingChartGameConfig } from "../types";

interface UseGameLogicParams {
  chartRef: React.RefObject<IChartApi | null>;
  /** T0 mumunun mantıksal indeksi (snapshot); çizgiler hep anchor+offset ile — zaman ekseni kaysa bile oyun alanı sabit */
  roundAnchorLogicalRef: React.MutableRefObject<number | null>;
  gameConfig: ResolvedTradingChartGameConfig;
  onGameStateChange?: (state: "drawing" | "locked" | "scored") => void;
}

export function useGameLogic({
  chartRef,
  roundAnchorLogicalRef,
  gameConfig,
  onGameStateChange,
}: UseGameLogicParams) {
  const gameStartTimeRef = useRef<number | null>(null);
  const gameStartPriceRef = useRef<number | null>(null);
  /** Gözlem biter / tahmin başlar (T0 + observation) */
  const gameObservationEndTimeRef = useRef<number | null>(null);
  /** Tahmin biter / 60sn çizilecek alan başlar (T0 + obs + tahmin) */
  const gameTahminEndTimeRef = useRef<number | null>(null);
  /** Tur eksen sonu T0 + 120 */
  const gameBrushZoneEndTimeRef = useRef<number | null>(null);
  const gameStartLogicalRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const checkLockCondition = useCallback((): boolean => {
    if (lastTimeRef.current !== null && gameTahminEndTimeRef.current !== null) {
      if (lastTimeRef.current >= gameTahminEndTimeRef.current) {
        onGameStateChange?.("locked");
        return true;
      }
    }
    return false;
  }, [onGameStateChange]);

  const updateOverlayPositions = useCallback(
    (
      lineT0: HTMLDivElement | null,
      lineObsEnd: HTMLDivElement | null,
      lineTahminEnd: HTMLDivElement | null,
      lineRoundEnd: HTMLDivElement | null,
      gameTahminBgAreaEl: HTMLDivElement | null,
      gameBgAreaEl: HTMLDivElement | null,
      container: HTMLElement,
    ) => {
      const chart = chartRef.current;
      if (
        !chart ||
        !lineT0 ||
        !lineObsEnd ||
        !lineTahminEnd ||
        !lineRoundEnd ||
        gameStartTimeRef.current === null ||
        gameObservationEndTimeRef.current === null ||
        gameTahminEndTimeRef.current === null ||
        gameBrushZoneEndTimeRef.current === null
      )
        return;

      const rightScaleWidth = chart.priceScale("right").width();
      const maxVisibleX = container.clientWidth - rightScaleWidth;

      const updatePosition = (el: HTMLDivElement | null, x: number | null) => {
        if (!el) return;
        if (x === null || x < 0 || x > maxVisibleX) {
          el.style.display = "none";
        } else {
          el.style.display = "block";
          el.style.transform = `translateX(${Math.round(x)}px)`;
        }
      };

      const anchor = roundAnchorLogicalRef.current;
      const ts = chart.timeScale();
      const halfBar = ts.options().barSpacing / 2;

      /** `logicalToCoordinate` / `timeToCoordinate` mum merkezi — dik çizgiler burada. */
      const centerXLogical = (offsetBars: number): number | null => {
        if (anchor === null) return null;
        return ts.logicalToCoordinate((anchor + offsetBars) as never);
      };

      let startX: number | null = null;
      if (anchor !== null) {
        gameStartLogicalRef.current = anchor;
        startX = centerXLogical(0);
      } else {
        const centerStart = ts.timeToCoordinate(
          gameStartTimeRef.current as UTCTimestamp,
        );
        if (centerStart !== null && gameStartLogicalRef.current === null) {
          gameStartLogicalRef.current = ts.coordinateToLogical(centerStart);
        }
        startX = centerStart;
      }

      const getXLine = (
        timeRef: React.MutableRefObject<number | null>,
        offsetBars: number,
      ): number | null => {
        if (anchor !== null) return centerXLogical(offsetBars);
        let cx = ts.timeToCoordinate(timeRef.current as UTCTimestamp);
        if (cx === null && gameStartLogicalRef.current !== null) {
          cx = ts.logicalToCoordinate(
            (gameStartLogicalRef.current + offsetBars) as never,
          );
        }
        return cx;
      };

      updatePosition(lineT0, startX);
      updatePosition(
        lineObsEnd,
        anchor !== null
          ? centerXLogical(gameConfig.observationSeconds)
          : getXLine(gameObservationEndTimeRef, gameConfig.observationSeconds),
      );
      updatePosition(
        lineTahminEnd,
        anchor !== null
          ? centerXLogical(gameConfig.tahminEndOffsetBars)
          : getXLine(gameTahminEndTimeRef, gameConfig.tahminEndOffsetBars),
      );
      updatePosition(
        lineRoundEnd,
        anchor !== null
          ? centerXLogical(gameConfig.brushZoneEndOffsetBars)
          : getXLine(gameBrushZoneEndTimeRef, gameConfig.brushZoneEndOffsetBars),
      );

      const cObs =
        anchor !== null
          ? centerXLogical(gameConfig.observationSeconds)
          : getXLine(gameObservationEndTimeRef, gameConfig.observationSeconds);
      const cTah =
        anchor !== null
          ? centerXLogical(gameConfig.tahminEndOffsetBars)
          : getXLine(gameTahminEndTimeRef, gameConfig.tahminEndOffsetBars);
      const xTahminBandStart = cObs === null ? null : cObs - halfBar;
      const xTahminBandEnd = cTah === null ? null : cTah + halfBar;

      if (gameTahminBgAreaEl) {
        if (xTahminBandStart !== null && xTahminBandEnd !== null) {
          const clippedStartX = Math.max(
            0,
            Math.min(maxVisibleX, xTahminBandStart),
          );
          const clippedEndX = Math.max(
            0,
            Math.min(maxVisibleX, xTahminBandEnd),
          );
          const rs = Math.round(clippedStartX);
          const re = Math.round(clippedEndX);
          const bgWidth = Math.max(0, re - rs);
          if (bgWidth > 0) {
            gameTahminBgAreaEl.style.display = "block";
            gameTahminBgAreaEl.style.transform = `translateX(${rs}px)`;
            gameTahminBgAreaEl.style.width = `${bgWidth}px`;
          } else {
            gameTahminBgAreaEl.style.display = "none";
          }
        } else {
          gameTahminBgAreaEl.style.display = "none";
        }
      }

      if (gameBgAreaEl) {
        const cBrush =
          anchor !== null
            ? centerXLogical(gameConfig.tahminEndOffsetBars)
            : getXLine(gameTahminEndTimeRef, gameConfig.tahminEndOffsetBars);
        const cEnd =
          anchor !== null
            ? centerXLogical(gameConfig.brushZoneEndOffsetBars)
            : getXLine(gameBrushZoneEndTimeRef, gameConfig.brushZoneEndOffsetBars);
        const xBrush = cBrush === null ? null : cBrush - halfBar;
        const xEnd = cEnd === null ? null : cEnd + halfBar;
        if (xBrush !== null && xEnd !== null) {
          const clippedStartX = Math.max(0, Math.min(maxVisibleX, xBrush));
          const clippedEndX = Math.max(0, Math.min(maxVisibleX, xEnd));
          const rs = Math.round(clippedStartX);
          const re = Math.round(clippedEndX);
          const bgWidth = Math.max(0, re - rs);
          if (bgWidth > 0) {
            gameBgAreaEl.style.display = "block";
            gameBgAreaEl.style.transform = `translateX(${rs}px)`;
            gameBgAreaEl.style.width = `${bgWidth}px`;
          } else {
            gameBgAreaEl.style.display = "none";
          }
        } else {
          gameBgAreaEl.style.display = "none";
        }
      }
    },
    [
      chartRef,
      roundAnchorLogicalRef,
      gameConfig.observationSeconds,
      gameConfig.tahminEndOffsetBars,
      gameConfig.brushZoneEndOffsetBars,
    ],
  );

  return {
    gameStartTimeRef,
    gameStartPriceRef,
    gameObservationEndTimeRef,
    gameTahminEndTimeRef,
    gameBrushZoneEndTimeRef,
    gameStartLogicalRef,
    lastTimeRef,
    checkLockCondition,
    updateOverlayPositions,
  };
}
