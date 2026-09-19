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
