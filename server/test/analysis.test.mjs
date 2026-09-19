import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { rememberLastCheck } = require("../dist/analysis.js");

test("checking the script checked last reuses its result", () => {
  const checked = [];
  const analysis = rememberLastCheck({
    check: (source, file) => {
      checked.push([source, file]);
      return [];
    },
  });
  analysis.check("x = 1", "a.liq");
  analysis.check("x = 1", "a.liq");
  analysis.check("x = 2", "a.liq");
  analysis.check("x = 2", "b.liq");
  analysis.check("x = 1", "a.liq");
  assert.deepEqual(checked, [
    ["x = 1", "a.liq"],
    ["x = 2", "a.liq"],
    ["x = 2", "b.liq"],
    ["x = 1", "a.liq"],
  ]);
});
