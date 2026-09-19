// Each script in cases/ is opened in the server, and its diagnostics and the
// answers to its `#? hover|complete L:C` and `#? symbols` queries are checked against
// expected/. Lines start at 1 and characters are UTF-16 code units from 0, as
// the editor counts them. Run with UPDATE=1 to rewrite them, then review the
// diff.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "./client.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(here, "cases");
const expectedDir = path.join(here, "expected");
const cases = fs.readdirSync(casesDir).filter((f) => f.endsWith(".liq"));

let server;
// Every script has the standard library's names in scope, so completions show
// them as one line.
let standardNames;
before(async () => {
  server = await startServer();
  const empty = path.join(casesDir, "empty.liq");
  await server.open(empty, "");
  const items = await server.complete(empty, 0, 0);
  standardNames = new Set(items.map(({ label }) => label));
});
after(() => server.stop());

const queries = (source) =>
  [...source.matchAll(/^#\? (\w+)(?: (\d+):(\d+))?$/gm)].map(
    ([, query, line, character]) => ({
      query,
      line: line && Number(line),
      character: character && Number(character),
    }),
  );

const position = ({ line, character }) => `${line + 1}:${character}`;

const printRange = ({ start, end }) => `${position(start)}-${position(end)}`;

const printRelated = ({ location, message }) =>
  `  at ${path.relative(casesDir, fileURLToPath(location.uri))} ${printRange(location.range)}: ${message}`;

const printDiagnostic = ({ severity, code, range, message, relatedInformation = [] }) =>
  [
    `${severity === 1 ? "error" : "warning"} ${code ?? "syntax"} ${printRange(range)}: ${message}`,
    ...relatedInformation.map(printRelated),
  ].join("\n");

const variableKind = 6;

const printCompletions = (items) => {
  const own = items.filter(
    ({ label, kind }) => kind !== variableKind || !standardNames.has(label),
  );
  const lines = own
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(({ label, detail }) => (detail ? `${label} : ${detail}` : label));
  if (own.length < items.length) lines.push("(standard library)");
  return lines.join("\n");
};

const printSymbols = (symbols, indent = "") =>
  symbols.flatMap(({ name, kind, range, selectionRange, children = [] }) => [
    `${indent}${name} ${kind === 12 ? "function" : "value"} ${printRange(range)} name ${printRange(selectionRange)}`,
    ...printSymbols(children, `${indent}  `),
  ]);

const answer = async (file, { query, line, character }) => {
  if (query === "symbols") return printSymbols(await server.symbols(file)).join("\n");
  if (query === "hover")
    return (await server.hover(file, line - 1, character))?.contents.value ?? "(none)";
  if (query === "complete")
    return printCompletions(await server.complete(file, line - 1, character));
  throw new Error(`Unknown query: ${query}`);
};

test("there are cases", () => {
  assert.ok(cases.length >= 5);
  assert.ok(standardNames.size > 100);
});

test("the standard library offers only names a script can write", () => {
  const unwritable = [...standardNames].filter(
    (name) => !/^[\p{L}_][\p{L}\p{N}_']*$/u.test(name) || /^_\d/.test(name),
  );
  assert.deepEqual(unwritable, []);
});

for (const name of cases) {
  test(name, async () => {
    const file = path.join(casesDir, name);
    const source = fs.readFileSync(file, "utf8");
    const sections = [
      "--- diagnostics ---",
      ...(await server.open(file, source)).map(printDiagnostic),
    ];
    for (const query of queries(source))
      sections.push(
        `--- ${query.query}${query.line ? ` ${query.line}:${query.character}` : ""} ---`,
        await answer(file, query),
      );
    const actual = `${sections.join("\n")}\n`;
    const expectedFile = path.join(expectedDir, name.replace(/\.liq$/, ".expected"));
    if (process.env.UPDATE) fs.writeFileSync(expectedFile, actual);
    assert.equal(actual, fs.readFileSync(expectedFile, "utf8"));
  });
}
