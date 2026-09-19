// Each broken script in cases/ has its patched form checked in under expected/.
// Run with UPDATE=1 to rewrite them, then review the diff.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createPatcher, originalOffset } from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(here, "cases");
const expectedDir = path.join(here, "expected");
const cases = fs.readdirSync(casesDir).filter((f) => f.endsWith(".liq"));

let patch;
before(async () => {
  patch = await createPatcher();
});

test("there are cases", () => assert.ok(cases.length >= 5));

for (const name of cases) {
  test(name, () => {
    const source = fs.readFileSync(path.join(casesDir, name), "utf8");
    const patched = patch(source);
    const expectedFile = path.join(expectedDir, name);
    if (process.env.UPDATE) fs.writeFileSync(expectedFile, patched.source);
    assert.equal(patched.source, fs.readFileSync(expectedFile, "utf8"));
    assert.deepEqual(
      patch(patched.source).errors,
      [],
      "the patched script still has syntax errors",
    );
  });
}

test("offsets map back through edits", () => {
  const edits = [{ start: 4, end: 9, text: "💣()" }];
  assert.equal(originalOffset(edits, 2), 2);
  assert.equal(originalOffset(edits, 5), 4);
  assert.equal(originalOffset(edits, 10), 11);
});
