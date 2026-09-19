import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer } from "./client.mjs";

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const hoverText = async (name, text, line, character) => {
  await server.open(name, text);
  const result = await server.hover(name, line, character);
  return result?.contents.value ?? null;
};

test("a core operator shows its type", async () => {
  const text = await hoverText("core.liq", "s = sine()\n", 0, 5);
  assert.match(text, /source\(/);
});

test("a local binding shows its type", async () => {
  const text = await hoverText("local.liq", "x = 1\ny = x + 2\n", 1, 4);
  assert.match(text, /^```liquidsoap\nint\n```$/);
});

test("blank space and comments show nothing", async () => {
  const source = "x = 1\n\n# a comment\n";
  assert.equal(await hoverText("blank.liq", source, 1, 0), null);
  assert.equal(await hoverText("blank.liq", source, 2, 1), null);
});

test("types are found through a patched script", async () => {
  const source = 'def f() =\n  amplify(0.5,\nend\n\nlabel = "done"\nprint(label)\n';
  const text = await hoverText("patched.liq", source, 5, 7);
  assert.match(text, /^```liquidsoap\nstring\n```$/);
});

test("columns after multi-byte characters are converted", async () => {
  // `n` is at UTF-16 column 10 but byte column 12, where column 10 is the
  // string before it.
  const text = await hoverText("unicode.liq", 'n = 1\ny = ("✨", n)\n', 1, 10);
  assert.match(text, /^```liquidsoap\nint\n```$/);
});
