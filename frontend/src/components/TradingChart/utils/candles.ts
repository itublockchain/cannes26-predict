import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { Candle1s, LWCandle } from "../types";

export function toLW(c: Candle1s): LWCandle {
  return {
    time: c.time as UTCTimestamp,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  };
}

export function fillCandleGaps(data: LWCandle[]): LWCandle[] {
  if (data.length === 0) return [];
  const sorted = [...data].sort(
    (a, b) => (a.time as number) - (b.time as number),
  );
  const result: LWCandle[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    if (i > 0) {
      const prev = result[result.length - 1];
      const prevTime = prev.time as number;
      const currTime = curr.time as number;
      const diff = currTime - prevTime;

      if (diff > 1) {
        for (let t = prevTime + 1; t < currTime; t++) {
          const k = t - prevTime;
          const v =
            prev.close + ((curr.open - prev.close) * k) / diff;
          result.push({
            time: t as UTCTimestamp,
            open: v,
            high: v,
            low: v,
            close: v,
          });
        }
      }
    }
    result.push(curr);
  }
  return result;
}

/** 1s OHLC → kapanış çizgisi (line series). */
export function candlesToLine(data: LWCandle[]): LineData<UTCTimestamp>[] {
  return data.map((c) => ({
    time: c.time,
    value: c.close,
  }));
}
