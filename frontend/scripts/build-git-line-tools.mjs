import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Git line-tool packages run `npm install` locally, which nests lightweight-charts@5.0.x
 * under the package while the app uses hoisted 5.1.x. Two copies produce incompatible
 * IChartApiBase / HorzScaleOptions typings and break `tsc` + typedoc.
 */
function pruneNestedLightweightCharts(packageRoot) {
  const walk = (dir) => {
    const nm = join(dir, "node_modules");
    if (!existsSync(nm)) return;
    const nested = join(nm, "lightweight-charts");
    if (existsSync(nested)) {
      rmSync(nested, { recursive: true, force: true });
    }
    for (const name of readdirSync(nm)) {
      if (name === ".bin") continue;
      const child = join(nm, name);
      if (statSync(child).isDirectory()) {
        walk(child);
      }
    }
  };
  walk(packageRoot);
}

const packages = [
  {
    name: "lightweight-charts-line-tools-core",
    distFile: "dist/lightweight-charts-line-tools-core.js",
  },
  {
    name: "lightweight-charts-line-tools-lines",
    distFile: "dist/lightweight-charts-line-tools-lines.js",
  },
  {
    name: "lightweight-charts-line-tools-freehand",
    distFile: "dist/lightweight-charts-line-tools-freehand.js",
  },
  {
    name: "lightweight-charts-line-tools-fib-retracement",
    distFile: "dist/lightweight-charts-line-tools-fib-retracement.js",
  },
];

for (const { name, distFile } of packages) {
  const pkgDir = join(root, "node_modules", name);
  const distPath = join(pkgDir, distFile);
  if (existsSync(distPath)) continue;
  if (!existsSync(join(pkgDir, "package.json"))) {
    console.warn(`[postinstall] skip ${name}: not installed`);
    continue;
  }
  console.log(`[postinstall] building ${name} (Git dep has no prebuilt dist)…`);
  execSync("npm install", {
    cwd: pkgDir,
    stdio: "inherit",
    env: { ...process.env, npm_config_ignore_scripts: "false" },
  });
  pruneNestedLightweightCharts(pkgDir);
  execSync("npm run build", {
    cwd: pkgDir,
    stdio: "inherit",
    env: { ...process.env, npm_config_ignore_scripts: "false" },
  });
}
