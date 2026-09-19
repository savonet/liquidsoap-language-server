// Writes dist/docs.json, the documentation shown on hover, from the output of
// `liquidsoap --list-functions-json`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "dist",
);
const input = process.env.LIQUIDSOAP_FUNCTIONS_JSON;
if (!input || !fs.existsSync(input)) {
  console.error(
    "build-docs: set LIQUIDSOAP_FUNCTIONS_JSON to the output of `liquidsoap --list-functions-json`.",
  );
  process.exit(1);
}

// LV2 and LADSPA operators come from the plugins installed where the docs were
// generated, which say nothing about the user's machine.
const machineSpecific = /^(lv2|ladspa)\./;

// Older Liquidsoap versions key arguments by label, which keeps only one of a
// function's unlabeled arguments; newer ones list them.
const argumentList = (args) =>
  Array.isArray(args)
    ? args
    : Object.entries(args ?? {}).map(([label, arg]) => ({ label, ...arg }));

const docs = {};
for (const [name, entry] of Object.entries(
  JSON.parse(fs.readFileSync(input, "utf8")),
)) {
  const flags = entry.flags ?? [];
  if (machineSpecific.test(name) || flags.includes("hidden")) continue;
  docs[name] = {
    type: entry.type,
    description: entry.description ?? "",
    arguments: argumentList(entry.arguments).map(({ label, ...arg }) => ({
      label,
      type: arg.type,
      default: arg.default ?? null,
      description: arg.description ?? "",
    })),
    ...(flags.includes("deprecated") ? { deprecated: true } : {}),
  };
}

fs.mkdirSync(dist, { recursive: true });
const output = path.join(dist, "docs.json");
fs.writeFileSync(output, JSON.stringify(docs));
console.log(
  `build-docs: ${Object.keys(docs).length} entries, ${fs.statSync(output).size} bytes.`,
);
