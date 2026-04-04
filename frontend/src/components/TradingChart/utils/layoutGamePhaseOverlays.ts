import type { IChartApi } from "lightweight-charts";
import type { ResolvedTradingChartGameConfig } from "../types";

export type GamePhaseOverlayElements = {
  lineT0: HTMLElement | null;
  lineObsEnd: HTMLElement | null;
  lineTahminEnd: HTMLElement | null;
  lineRoundEnd: HTMLElement | null;
  gameTahminBgArea: HTMLElement | null;
  gameBgArea: HTMLElement | null;
};

/**
 * `useGameLogic` içindeki anchor seçili dal — sol / sağ panelde aynı faz çizgileri.
 */
export function layoutGamePhaseOverlays(
  chart: IChartApi,
  container: HTMLElement,
  elements: GamePhaseOverlayElements,
  anchorLogical: number,
  gameConfig: ResolvedTradingChartGameConfig,
): void {
  const rightScaleWidth = chart.priceScale("right").width();
  const maxVisibleX = container.clientWidth - rightScaleWidth;

  const updatePosition = (el: HTMLElement | null, x: number | null) => {
    if (!el) return;
    if (x === null || x < 0 || x > maxVisibleX) {
      el.style.display = "none";
    } else {
      el.style.display = "block";
      el.style.transform = `translateX(${Math.round(x)}px)`;
    }
  };

  const ts = chart.timeScale();
  const halfBar = ts.options().barSpacing / 2;

  const centerXAt = (offsetBars: number): number | null =>
    ts.logicalToCoordinate((anchorLogical + offsetBars) as never);

  updatePosition(elements.lineT0, centerXAt(0));
  updatePosition(
    elements.lineObsEnd,
    centerXAt(gameConfig.observationSeconds),
  );
  updatePosition(
    elements.lineTahminEnd,
    centerXAt(gameConfig.tahminEndOffsetBars),
  );
  updatePosition(
    elements.lineRoundEnd,
    centerXAt(gameConfig.brushZoneEndOffsetBars),
  );

  const cObs = centerXAt(gameConfig.observationSeconds);
  const cTah = centerXAt(gameConfig.tahminEndOffsetBars);
  const xTahminBandStart = cObs === null ? null : cObs - halfBar;
  const xTahminBandEnd = cTah === null ? null : cTah + halfBar;

  if (elements.gameTahminBgArea) {
    if (xTahminBandStart !== null && xTahminBandEnd !== null) {
      const clippedStartX = Math.max(
        0,
        Math.min(maxVisibleX, xTahminBandStart),
      );
      const clippedEndX = Math.max(0, Math.min(maxVisibleX, xTahminBandEnd));
      const rs = Math.round(clippedStartX);
      const re = Math.round(clippedEndX);
      const bgWidth = Math.max(0, re - rs);
      if (bgWidth > 0) {
        elements.gameTahminBgArea.style.display = "block";
        elements.gameTahminBgArea.style.transform = `translateX(${rs}px)`;
        elements.gameTahminBgArea.style.width = `${bgWidth}px`;
      } else {
        elements.gameTahminBgArea.style.display = "none";
      }
    } else {
      elements.gameTahminBgArea.style.display = "none";
    }
  }

  if (elements.gameBgArea) {
    const cBrush = centerXAt(gameConfig.tahminEndOffsetBars);
    const cEnd = centerXAt(gameConfig.brushZoneEndOffsetBars);
    const xBrush = cBrush === null ? null : cBrush - halfBar;
    const xEnd = cEnd === null ? null : cEnd + halfBar;
    if (xBrush !== null && xEnd !== null) {
      const clippedStartX = Math.max(0, Math.min(maxVisibleX, xBrush));
      const clippedEndX = Math.max(0, Math.min(maxVisibleX, xEnd));
      const rs = Math.round(clippedStartX);
      const re = Math.round(clippedEndX);
      const bgWidth = Math.max(0, re - rs);
      if (bgWidth > 0) {
        elements.gameBgArea.style.display = "block";
        elements.gameBgArea.style.transform = `translateX(${rs}px)`;
        elements.gameBgArea.style.width = `${bgWidth}px`;
      } else {
        elements.gameBgArea.style.display = "none";
      }
    } else {
      elements.gameBgArea.style.display = "none";
    }
  }
}
