import { BaseLineTool } from "lightweight-charts-line-tools-core";

let patched = false;

/**
 * `detached()` clears `_requestUpdate`; bazı yarışlarda (chart.remove, removeAllLineTools,
 * subscribe sonrası) araç yine `_triggerChartUpdate` çağırıyor — core `console.warn` basıyor.
 * Davranış zaten no-op olacaktı; uyarıyı kaldırırız.
 */
export function ensureBaseLineToolOrphanUpdatesSilenced(): void {
  if (patched) return;
  patched = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BaseLineTool.prototype as any)._triggerChartUpdate = function (this: any) {
    this._requestUpdate?.();
  };
}
