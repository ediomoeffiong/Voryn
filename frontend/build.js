import cp from "child_process";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("Starting Voryn Frontend build...");

// 1. Run tsc
console.log("Running tsc...");
try {
  const tscPath = require.resolve("typescript/bin/tsc");
  const tscRes = cp.spawnSync("node", [tscPath], { stdio: "inherit" });
  if (tscRes.status !== 0) {
    console.error("TypeScript compilation failed");
    process.exit(tscRes.status || 1);
  }
} catch (err) {
  console.error("Failed to run tsc:", err);
  process.exit(1);
}

// 2. Run vite build
console.log("Running vite build...");
try {
  const vitePkg = require.resolve("vite/package.json");
  const viteBin = path.join(path.dirname(vitePkg), "bin/vite.js");
  const viteRes = cp.spawnSync("node", [viteBin, "build"], { stdio: "inherit" });
  if (viteRes.status !== 0) {
    console.error("Vite build failed");
    process.exit(viteRes.status || 1);
  }
} catch (err) {
  console.error("Failed to run vite build:", err);
  process.exit(1);
}

console.log("Build completed successfully!");
