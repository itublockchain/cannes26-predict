import { useRef, useCallback, useEffect } from "react";
import type {
  IChartApiBase,
  ISeriesApi,
  SeriesType,
  UTCTimestamp,
} from "lightweight-charts";
import { redrawDevDrawingPointsCanvas } from "../utils/devDrawingPointsCanvas";
import type { DrawingPoint } from "../types";

interface UseDevOverlayParams {
  chartRef: React.RefObject<IChartApiBase<UTCTimestamp> | null>;
  seriesRef: React.RefObject<ISeriesApi<SeriesType, UTCTimestamp> | null>;
  chartShellRef: React.RefObject<HTMLDivElement | null>;
  devBrushPointsRef: React.MutableRefObject<DrawingPoint[]>;
  chartDebugModeRef: React.MutableRefObject<boolean>;
}

interface UseDevOverlayReturn {
  drawingDebugCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  redrawDevDrawingOverlay: () => void;
  redrawDevDrawingOverlayRef: React.MutableRefObject<() => void>;
}

export function useDevOverlay({
  chartRef,
  seriesRef,
  chartShellRef,
  devBrushPointsRef,
  chartDebugModeRef,
}: UseDevOverlayParams): UseDevOverlayReturn {
  const drawingDebugCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const redrawDevDrawingOverlayRef = useRef<() => void>(() => {});

  const redrawDevDrawingOverlay = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const shell = chartShellRef.current;
    const canvas = drawingDebugCanvasRef.current;
    if (!chart || !series || !shell || !canvas) return;
    redrawDevDrawingPointsCanvas(
      chart as IChartApiBase<UTCTimestamp>,
      series as ISeriesApi<SeriesType, UTCTimestamp>,
      shell,
      canvas,
      devBrushPointsRef.current,
      chartDebugModeRef.current,
    );
  }, [chartRef, seriesRef, chartShellRef, devBrushPointsRef, chartDebugModeRef]);

  useEffect(() => {
    redrawDevDrawingOverlayRef.current = redrawDevDrawingOverlay;
  }, [redrawDevDrawingOverlay]);

  return { drawingDebugCanvasRef, redrawDevDrawingOverlay, redrawDevDrawingOverlayRef };
}
