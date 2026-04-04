/** Browser localStorage: son oyun turundaki çizimler (line-tools export). */

import type { DrawingPoint } from "../types";

export const GAME_DRAWING_STORAGE_VERSION = 1 as const;

export type GameDrawingPersistedV1 = {
  v: typeof GAME_DRAWING_STORAGE_VERSION;
  /** Tur T0 (snapshot’taki game start unix sn); eşleşmezse geri yükleme yapılmaz */
  gameStartTime: number;
  /** `exportLineTools()` çıktısı — JSON.stringify(LineToolExport[]) */
  lineToolsJson: string;
};

function storageKey(coin: string): string {
  return `tradingChart.gameDrawing.v${GAME_DRAWING_STORAGE_VERSION}:${coin}`;
}

export function readGameDrawingPersistence(
  coin: string,
): GameDrawingPersistedV1 | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(coin));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameDrawingPersistedV1;
    if (
      parsed?.v !== GAME_DRAWING_STORAGE_VERSION ||
      typeof parsed.gameStartTime !== "number" ||
      typeof parsed.lineToolsJson !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeGameDrawingPersistence(
  coin: string,
  payload: GameDrawingPersistedV1,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(coin), JSON.stringify(payload));
  } catch {
    /* kotası / gizli mod */
  }
}

export function clearGameDrawingPersistence(coin: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(coin));
  } catch {
    /* ignore */
  }
}

/** Brush segmentleri — oyun sonu log / telafi */
export function brushSegmentsFromLineToolsExport(
  lineToolsJson: string,
): DrawingPoint[][] {
  type Row = { toolType?: string; points?: { timestamp?: number; price?: number; time?: number }[] };
  try {
    const arr = JSON.parse(lineToolsJson) as Row[];
    if (!Array.isArray(arr)) return [];
    const out: DrawingPoint[][] = [];
    for (const t of arr) {
      if (t.toolType !== "Brush" || !Array.isArray(t.points)) continue;
      out.push(
        t.points.map((p) => ({
          timestamp: Number(p.timestamp ?? p.time),
          price: Number(p.price),
        })),
      );
    }
    return out;
  } catch {
    return [];
  }
}
