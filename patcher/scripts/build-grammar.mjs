// Builds tree-sitter-liquidsoap to wasm, since its npm package ships none.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const grammar = process.env.TREE_SITTER_LIQUIDSOAP;
if (!grammar || !fs.existsSync(path.join(grammar, "grammar.js"))) {
  console.error(
    "build-grammar: set TREE_SITTER_LIQUIDSOAP to a tree-sitter-liquidsoap checkout.",
  );
  process.exit(1);
}
const output = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "grammar",
  "tree-sitter-liquidsoap.wasm",
);
fs.mkdirSync(path.dirname(output), { recursive: true });
execFileSync("tree-sitter", ["build", "--wasm", "-o", output], {
  cwd: grammar,
  stdio: "inherit",
});
console.log(`build-grammar: wrote ${output}`);
