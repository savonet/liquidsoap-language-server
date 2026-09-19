// Talks to the built server over stdio, as an editor would.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";

const server = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "server.js",
);

let child;
let connection;
const published = new Map();
const waiters = new Map();

const diagnosticsFor = (uri) =>
  new Promise((resolve) => {
    if (published.has(uri)) return resolve(published.get(uri));
    waiters.set(uri, resolve);
  });

let version = 0;
const open = async (name, text) => {
  const uri = `file:///${name}`;
  published.delete(uri);
  const diagnostics = diagnosticsFor(uri);
  await connection.sendNotification("textDocument/didOpen", {
    textDocument: { uri, languageId: "liquidsoap", version: ++version, text },
  });
  return diagnostics;
};

before(async () => {
  child = spawn(process.execPath, [server, "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  connection.onNotification(
    "textDocument/publishDiagnostics",
    ({ uri, diagnostics }) => {
      published.set(uri, diagnostics);
      waiters.get(uri)?.(diagnostics);
      waiters.delete(uri);
    },
  );
  connection.listen();
  await connection.sendRequest("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
  });
  await connection.sendNotification("initialized", {});
});

after(() => {
  connection.dispose();
  child.kill();
});

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
