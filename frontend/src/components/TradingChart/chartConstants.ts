import type { ToolDef } from "./types";

export type GamePhase = 1 | 2 | 3;

export const TOP_TOOLS: ToolDef[] = [
  {
    key: "TrendLine",
    title: "Trend Line",
    shortcutKey: "1",
    svg: '<path d="M3 19L19 3M19 3H14M19 3V8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    key: "Ray",
    title: "Ray",
    shortcutKey: "2",
    svg: '<circle cx="5" cy="19" r="2" fill="currentColor"/><path d="M5 19L20 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    key: "HorizontalLine",
    title: "Horizontal Line",
    shortcutKey: "3",
    svg: '<path d="M3 12H21" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  },
  {
    key: "FibRetracement",
    title: "Fibonacci Retracement",
    shortcutKey: "4",
    svg: '<path d="M4 5h16M4 9h14M4 13h10M4 17h12M4 21h8" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round"/>',
  },
];

/** Özel kalem imleci (Windows’ta ~32px sınırına uygun); uç ~ (6,24). */
export const PEN_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="#f8fafc" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round" d="M6 24l1.6-5L21 5.5l4.5 4.5L11.5 24H6z"/><path fill="#94a3b8" d="M21 5.5l4.5 4.5-1.2 1.2-4.5-4.5z"/></svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 6 24, crosshair`;
})();
