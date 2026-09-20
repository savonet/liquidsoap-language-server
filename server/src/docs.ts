import * as fs from "node:fs";
import * as path from "node:path";
import type { Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { lineText } from "./positions";

export interface Argument {
  label: string;
  type: string;
  default: string | null;
  description: string;
}

export interface Doc {
  type: string;
  description: string;
  arguments: Argument[];
  deprecated?: boolean;
}

export type Docs = Map<string, Doc>;

// LV2 and LADSPA operators come from the plugins installed where the
// documentation was generated, which says nothing about the user's machine
// unless it is the machine's own liquidsoap that generated it.
const plugin = /^(lv2|ladspa)\./;

const argumentList = (args: unknown): Record<string, unknown>[] =>
  Array.isArray(args)
    ? args
    : Object.entries((args ?? {}) as Record<string, object>).map(
        ([label, argument]) => ({ label, ...argument }),
      );

/** Reads the output of `liquidsoap --list-functions-json`. */
export const docsFromFunctions = (
  functions: string,
  { keepPlugins = false } = {},
): Record<string, Doc> => {
  const docs: Record<string, Doc> = {};
  for (const [name, entry] of Object.entries(
    JSON.parse(functions) as Record<string, Record<string, any>>,
  )) {
    const flags: string[] = entry.flags ?? [];
    if ((!keepPlugins && plugin.test(name)) || flags.includes("hidden")) continue;
    docs[name] = {
      type: entry.type,
      description: entry.description ?? "",
      arguments: argumentList(entry.arguments).map((argument: any) => ({
        label: argument.label,
        type: argument.type,
        default: argument.default ?? null,
        description: argument.description ?? "",
      })),
      ...(flags.includes("deprecated") ? { deprecated: true } : {}),
    };
  }
  return docs;
};

export const loadDocs = (dir: string): Docs =>
  new Map(
    Object.entries(
      JSON.parse(fs.readFileSync(path.join(dir, "docs.json"), "utf8")),
    ),
  );

const identifierChar = /[\p{L}\p{N}_'.]/u;

/** The dotted name up to the end of the segment under the cursor, e.g. `output.dummy`. */
export const dottedNameAt = (
  document: TextDocument,
  position: Position,
): string | undefined => {
  const text = lineText(document, position.line);
  let start = position.character;
  while (start > 0 && identifierChar.test(text[start - 1])) start--;
  let end = position.character;
  while (end < text.length && identifierChar.test(text[end]) && text[end] !== ".")
    end++;
  const name = text.slice(start, end).replace(/^\.+/, "");
  return name || undefined;
};

const formatArgument = ({ label, type, default: value, description }: Argument) =>
  [
    `- \`${label || "(unlabeled)"}\` : \`${type}\``,
    value === null ? "" : ` (default \`${value}\`)`,
    description ? ` — ${description}` : "",
  ].join("");

export const formatDoc = (name: string, doc: Doc): string =>
  [
    ["```liquidsoap", `${name} : ${doc.type}`, "```"].join("\n"),
    doc.deprecated ? "**Deprecated.**" : "",
    doc.description,
    doc.arguments.length
      ? ["Arguments:", ...doc.arguments.map(formatArgument)].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
