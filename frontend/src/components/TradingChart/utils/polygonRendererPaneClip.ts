import { PolygonRenderer } from "lightweight-charts-line-tools-core";

let patched = false;

type MediaScope = {
  context: CanvasRenderingContext2D;
  mediaSize: { width: number; height: number };
};

type DrawTarget = {
  useMediaCoordinateSpace: (fn: (scope: MediaScope) => void) => void;
};

/**
 * Fırça / highlighter gibi araçlar PolygonRenderer ile çizer; stroke genişliği ve
 * yumuşatma pane sınırının dışına taşabiliyor. LWC pane hedefi medya uzayında
 * dikdörtgene kırparak çizgilerin ızgara / eksen / dış araç çubuğu üzerine sızmasını engeller.
 */
export function ensurePolygonRendererClippedToPane(): void {
  if (patched) return;
  patched = true;

  const proto = PolygonRenderer.prototype as {
    draw(this: PolygonRenderer<unknown>, target: DrawTarget): void;
  };
  const originalDraw = proto.draw;

  proto.draw = function drawClipped(
    this: PolygonRenderer<unknown>,
    target: DrawTarget,
  ) {
    const wrapped: DrawTarget = {
      useMediaCoordinateSpace(fn) {
        return target.useMediaCoordinateSpace((scope) => {
          const { context: ctx, mediaSize } = scope;
          const w = mediaSize.width;
          const h = mediaSize.height;
          if (w > 0 && h > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, w, h);
            ctx.clip();
          }
          try {
            fn(scope);
          } finally {
            if (w > 0 && h > 0) {
              ctx.restore();
            }
          }
        });
      },
    };
    originalDraw.call(this, wrapped);
  };
}
