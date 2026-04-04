import type {
  IChartApiBase,
  ISeriesApi,
  Logical,
  SeriesType,
  UTCTimestamp,
} from "lightweight-charts";
import { interpolateLogicalIndexFromTime } from "lightweight-charts-line-tools-core";
import type { DrawingPoint } from "../types";

/**
 * Fırça zamanları mum saniyesiyle birebir olmayabilir; LW `timeToCoordinate` ise
 * `timeToIndex(time, false)` kullandığı için çoğu noktada X null döner. En az iki
 * mum varken kesirli logical için interpolasyon; aksi halde `timeToIndex(…, true)`.
 */
export function drawingPointToPanePixel(
  chart: IChartApiBase<UTCTimestamp>,
  series: ISeriesApi<SeriesType, UTCTimestamp>,
  timestamp: number,
  price: number,
): { x: number; y: number } | null {
  const y = series.priceToCoordinate(price);
  if (y === null) {
    return null;
  }

  const timeScale = chart.timeScale();
  const time = timestamp as UTCTimestamp;

  let x: number | null = null;

  if (series.dataByIndex(1, 0) != null) {
    const logical = interpolateLogicalIndexFromTime(chart, series, time);
    if (logical != null) {
      x = timeScale.logicalToCoordinate(logical as Logical);
    }
  }

  if (x === null) {
    const idx = timeScale.timeToIndex(time, true);
    if (idx != null) {
      x = timeScale.logicalToCoordinate(idx as unknown as Logical);
    }
  }

  if (x === null) {
    return null;
  }
  return { x, y };
}

export function redrawDevDrawingPointsCanvas(
  chart: IChartApiBase<UTCTimestamp>,
  series: ISeriesApi<SeriesType, UTCTimestamp>,
  shellEl: HTMLElement,
  canvas: HTMLCanvasElement,
  points: DrawingPoint[],
  visible: boolean,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = shellEl.clientWidth;
  const h = shellEl.clientHeight;
  if (w <= 0 || h <= 0) {
    return;
  }

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!visible || points.length === 0) {
    return;
  }

  const panes = chart.panes();
  const paneEl = panes[0]?.getHTMLElement?.() ?? null;
  if (!paneEl) {
    return;
  }

  const shellRect = shellEl.getBoundingClientRect();
  const paneRect = paneEl.getBoundingClientRect();
  const ox = paneRect.left - shellRect.left;
  const oy = paneRect.top - shellRect.top;

  const R = 2.5;
  ctx.fillStyle = "rgba(255, 215, 0, 0.92)";
  ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
  ctx.lineWidth = 0.75;

  for (const p of points) {
    const c = drawingPointToPanePixel(chart, series, p.timestamp, p.price);
    if (!c) {
      continue;
    }
    const x = ox + c.x;
    const y = oy + c.y;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
