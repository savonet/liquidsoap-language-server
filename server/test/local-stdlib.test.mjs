// The server asks the liquidsoap on the machine for its standard library. A
// fake one stands in for it, so that the tests do not depend on what is
// installed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "./client.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");
const fake = path.join(here, "fake");

let cache;
let calls;
const servers = [];

const start = (env = {}) =>
  startServer({
    LIQUIDSOAP: path.join(fake, "liquidsoap"),
    XDG_CACHE_HOME: cache,
    FAKE_CALLS: calls,
    FAKE_TYPES: path.join(dist, "stdlib.types"),
    FAKE_FUNCTIONS: path.join(fake, "functions.json"),
    ...env,
  }).then((server) => {
    servers.push(server);
    return server;
  });

const hoverText = async (server, name, text, line, character) => {
  const file = path.join(cache, name);
  await server.open(file, text);
  return (await server.hover(file, line, character))?.contents.value ?? "";
};

before(() => {
  cache = fs.mkdtempSync(path.join(os.tmpdir(), "liquidsoap-language-server-test-"));
  calls = path.join(cache, "calls");
});
after(() => {
  for (const server of servers) server.stop();
  fs.rmSync(cache, { recursive: true, force: true });
});

test("the machine's liquidsoap provides the documentation", async () => {
  const server = await start();
  const text = await hoverText(server, "fake.liq", "s = sine()\n", 0, 5);
  assert.match(text, /A sine from the fake liquidsoap\./);
});

test("its plugins are documented", async () => {
  const server = await start();
  const text = await hoverText(
    server,
    "plugin.liq",
    "s = sine()\nt = lv2.reverb(s)\n",
    1,
    8,
  );
  assert.match(text, /A plugin installed on this machine\./);
});

test("the standard library is generated once per version", async () => {
  await start();
  const generated = fs
    .readFileSync(calls, "utf8")
    .split("\n")
    .filter((call) => call.startsWith("--cache-js-stdlib"));
  assert.equal(generated.length, 1);
  assert.ok(fs.existsSync(path.join(cache, "liquidsoap-language-server")));
});

test("an unusable liquidsoap falls back to the bundled standard library", async () => {
  const server = await start({ LIQUIDSOAP: path.join(fake, "not-liquidsoap") });
  const text = await hoverText(server, "bundled.liq", "s = sine()\n", 0, 5);
  assert.match(text, /Generate a sine wave\./);
});
