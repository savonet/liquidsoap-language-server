// Every patched script from the patcher's cases must satisfy Liquidsoap's own
// parser, which is stricter than tree-sitter's grammar.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createPatcher } from "liquidsoap-patcher";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");
const casesDir = path.join(here, "..", "..", "patcher", "test", "cases");
const cases = fs.readdirSync(casesDir).filter((f) => f.endsWith(".liq"));

// tree-sitter reads keywords as variables, see tree-sitter-liquidsoap.
const knownFailures = new Set();

const parseErrorCodes = new Set([1, 2, 3]);

let analysis;
let patch;
before(async () => {
  analysis = await require(path.join(dist, "analysis.js")).loadAnalysis(dist);
  patch = await createPatcher();
});

test("there are cases", () => assert.ok(cases.length >= 5));

for (const name of cases) {
  test(name, { todo: knownFailures.has(name) }, () => {
    const source = fs.readFileSync(path.join(casesDir, name), "utf8");
    const parseErrors = analysis
      .check(patch(source).source)
      .filter(
        ({ severity, code }) =>
          severity === "error" && parseErrorCodes.has(code),
      );
    assert.deepEqual(parseErrors, []);
  });
}
