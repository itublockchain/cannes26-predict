import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  root: frontendDir,
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    dedupe: [
      "lightweight-charts",
      "lightweight-charts-line-tools-core",
      "lightweight-charts-line-tools-lines",
      "lightweight-charts-line-tools-freehand",
      "lightweight-charts-line-tools-fib-retracement",
    ],
  },
  optimizeDeps: {
    include: [
      "lightweight-charts",
      "lightweight-charts-line-tools-core",
      "lightweight-charts-line-tools-lines",
      "lightweight-charts-line-tools-freehand",
      "lightweight-charts-line-tools-fib-retracement",
    ],
  },
  server: {
    port: 3000,
    host: true,
    fs: {
      allow: [frontendDir, path.resolve(frontendDir, "..")],
    },
  },
});
