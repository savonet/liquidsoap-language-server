// Loads the analysis module, the full stdlib environment, and times a few checks.
const fs = require("fs");
const path = require("path");

const [target, dumpFile] = process.argv.slice(2);
const since = (t) => `${(performance.now() - t).toFixed(1)}ms`;

const waitFor = async (get) => {
  for (let i = 0; i < 2000; i++) {
    const value = get();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("module never exported `liquidsoap`");
};

const scripts = {
  type_error: 'x = 1 + "a"',
  core_operator: "s = sine()\noutput.dummy(s)",
  shadowing: "def sine() =\n  1\nend\nx = sine() + 1",
};

(async () => {
  let t = performance.now();
  const exported = require(path.resolve(target));
  const liquidsoap = await waitFor(
    () => exported.liquidsoap ?? globalThis.liquidsoap,
  );
  console.log(`module ready: ${since(t)}`);

  const dump = new Uint8Array(fs.readFileSync(dumpFile));
  t = performance.now();
  liquidsoap.loadEnv(dump);
  console.log(`loadEnv (${dump.length} bytes): ${since(t)}`);

  for (const [name, source] of Object.entries(scripts)) {
    t = performance.now();
    const diagnostics = liquidsoap.check(source);
    const took = since(t);
    const summary = Array.from(diagnostics).map(
      (d) => `${d.severity} ${d.code} ${d.line}:${d.column} ${d.message.split("\n")[0]}`,
    );
    console.log(`check ${name}: ${took}`, summary);
  }
  console.log(`typeAt 4:4 in shadowing: ${liquidsoap.typeAt(4, 4)}`);

  const big = fs.readFileSync(
    "/home/toots/src/savonet/liquidsoap/src/libs/playlist.liq",
    "utf8",
  );
  for (let run = 1; run <= 3; run++) {
    t = performance.now();
    const diagnostics = liquidsoap.check(big);
    console.log(
      `check playlist.liq (${big.split("\n").length} lines) run ${run}: ${since(t)}, ${diagnostics.length} diagnostics`,
    );
  }
})().catch((e) => {
  console.error("SPIKE FAILED:", e);
  process.exit(1);
});
