import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer } from "./client.mjs";

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const open = (name, text) => server.open(name, text);

test("a type error gives one diagnostic at the right range", async () => {
  const diagnostics = await open("type_error.liq", 'x = 1 + "a"\n');
  assert.equal(diagnostics.length, 1);
  const [diagnostic] = diagnostics;
  assert.equal(diagnostic.severity, 1);
  assert.equal(diagnostic.code, 5);
  assert.deepEqual(diagnostic.range, {
    start: { line: 0, character: 8 },
    end: { line: 0, character: 11 },
  });
  assert.match(diagnostic.message, /this value has type/);
});

test("columns are converted from UTF-8 bytes to UTF-16", async () => {
  const diagnostics = await open("unicode.liq", 'x = "✨" ^ 1\n');
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0].range.start, { line: 0, character: 10 });
});

test("core operators typecheck", async () => {
  const diagnostics = await open("core.liq", "output.dummy(sine())\n");
  assert.deepEqual(diagnostics, []);
});

test("a syntax error is reported where tree-sitter finds it", async () => {
  const diagnostics = await open("syntax_error.liq", "x = 1 +\n");
  const errors = diagnostics.filter(({ severity }) => severity === 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, "Syntax error: missing an expression.");
  assert.deepEqual(errors[0].range.start, { line: 0, character: 7 });
});

test("errors after a broken definition keep their original position", async () => {
  const diagnostics = await open(
    "after_break.liq",
    'def f() =\n  amplify(0.5,\nend\n\nz = 1 + "a"\n',
  );
  const typeErrors = diagnostics.filter(({ code }) => code === 5);
  assert.equal(typeErrors.length, 1);
  assert.deepEqual(typeErrors[0].range, {
    start: { line: 4, character: 8 },
    end: { line: 4, character: 11 },
  });
  assert.ok(diagnostics.some(({ message }) => /Syntax error/.test(message)));
});
