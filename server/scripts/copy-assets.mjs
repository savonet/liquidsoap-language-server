// Puts the wasm analysis module and the stdlib typing environment next to
// dist/server.js, where the wasm loader looks for its assets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const analysisBuild = path.join(root, "..", "analysis", "_build", "default");
const stdlibTypes = process.env.LIQUIDSOAP_STDLIB_TYPES;

const fail = (message) => {
  console.error(`copy-assets: ${message}`);
  process.exit(1);
};

const loader = path.join(analysisBuild, "analysis_wasm.bc.wasm.js");
const assets = path.join(analysisBuild, "analysis_wasm.bc.wasm.assets");
if (!fs.existsSync(loader) || !fs.existsSync(assets))
  fail(`no wasm build in ${analysisBuild}, build analysis/ first.`);
if (!stdlibTypes || !fs.existsSync(stdlibTypes))
  fail("set LIQUIDSOAP_STDLIB_TYPES to the stdlib.types file to ship.");

fs.mkdirSync(dist, { recursive: true });
// The loader looks for its assets next to the script Node was started with.
// Next to the loader itself works however the server is started.
const mainDirectory = /[\w$]+\.dirname\(require\.main\.filename\)/g;
const loaderSource = fs.readFileSync(loader, "utf8");
if (!mainDirectory.test(loaderSource))
  fail("the wasm loader no longer locates its assets as expected.");
fs.writeFileSync(
  path.join(dist, "analysis_wasm.bc.wasm.js"),
  loaderSource.replace(mainDirectory, "__dirname"),
);
fs.rmSync(path.join(dist, "analysis_wasm.bc.wasm.assets"), {
  recursive: true,
  force: true,
});
fs.cpSync(assets, path.join(dist, "analysis_wasm.bc.wasm.assets"), {
  recursive: true,
});
fs.copyFileSync(stdlibTypes, path.join(dist, "stdlib.types"));
// Dune's outputs are read-only, which would stop the next build from replacing
// the copies.
for (const file of fs.readdirSync(dist, { recursive: true })) {
  const target = path.join(dist, file);
  if (fs.statSync(target).isFile()) fs.chmodSync(target, 0o644);
}
fs.chmodSync(path.join(dist, "server.js"), 0o755);
console.log(`copy-assets: ${dist} is ready.`);
