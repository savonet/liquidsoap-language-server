// Writes dist/docs.json, the documentation shown on hover, from the output of
// `liquidsoap --list-functions-json`.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const input = process.env.LIQUIDSOAP_FUNCTIONS_JSON;
if (!input || !fs.existsSync(input)) {
  console.error(
    "build-docs: set LIQUIDSOAP_FUNCTIONS_JSON to the output of `liquidsoap --list-functions-json`.",
  );
  process.exit(1);
}

const { docsFromFunctions } = createRequire(import.meta.url)(
  path.join(dist, "docs.js"),
);
const docs = docsFromFunctions(fs.readFileSync(input, "utf8"));

fs.mkdirSync(dist, { recursive: true });
const output = path.join(dist, "docs.json");
fs.writeFileSync(output, JSON.stringify(docs));
console.log(
  `build-docs: ${Object.keys(docs).length} entries, ${fs.statSync(output).size} bytes.`,
);
