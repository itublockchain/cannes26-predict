import type { IChartApi } from "lightweight-charts";

const PARIS_TZ = "Europe/Paris";

export function chartTickMarkFormatterFull(time: number): string {
  const date = new Date(time * 1000);
  return date.toLocaleTimeString("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function chartTimeFormatterFull(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Dar panele sığdırmak için saniye yok — etiket çakışmasını azaltır */
export function chartTickMarkFormatterCompact(time: number): string {
  const date = new Date(time * 1000);
  return date.toLocaleTimeString("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function chartTimeFormatterCompact(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString("fr-FR", {
    timeZone: PARIS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Sağ panel: sol «kilit + çift sütun» ile aynı zaman ekseni + isteğe bağlı barSpacing */
export function applyDualPaneChartChrome(
  chart: IChartApi,
  dual: { barSpacing?: number },
): void {
  applyChartTimeScaleStyle(chart, "dualCompact");
  if (typeof dual.barSpacing === "number" && Number.isFinite(dual.barSpacing)) {
    chart.timeScale().applyOptions({ barSpacing: dual.barSpacing });
  }
}

export function applyChartTimeScaleStyle(
  chart: IChartApi,
  mode: "full" | "dualCompact",
): void {
  if (mode === "full") {
    chart.applyOptions({
      timeScale: {
        secondsVisible: true,
        tickMarkFormatter: chartTickMarkFormatterFull,
      },
      localization: {
        timeFormatter: chartTimeFormatterFull,
      },
    });
  } else {
    chart.applyOptions({
      timeScale: {
        secondsVisible: false,
        tickMarkFormatter: chartTickMarkFormatterCompact,
      },
      localization: {
        timeFormatter: chartTimeFormatterCompact,
      },
    });
  }
}
