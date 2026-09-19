import type { Patcher } from "liquidsoap-patcher";
import { Hover, MarkupKind, Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Analysis } from "./analysis";
import { checkAt } from "./checked";
import { type Docs, dottedNameAt, formatDoc } from "./docs";
import { lineText } from "./positions";

const identifierChar = /[\p{L}\p{N}_'.]/u;

// Blank space has no term of its own, only the enclosing block's.
const onIdentifier = (document: TextDocument, position: Position): boolean => {
  const text = lineText(document, position.line);
  return [text[position.character], text[position.character - 1]].some(
    (char) => char !== undefined && identifierChar.test(char),
  );
};

const markdown = (value: string): Hover => ({
  contents: { kind: MarkupKind.Markdown, value },
});

export const hover = (
  analysis: Analysis,
  patch: Patcher,
  docs: Docs,
  document: TextDocument,
  position: Position,
): Hover | null => {
  if (!onIdentifier(document, position)) return null;
  const checked = checkAt(analysis, patch, document, document.offsetAt(position));
  if (!checked) return null;
  const { at } = checked;
  // The standard library's documentation only applies when the script does not
  // bind the name itself around the cursor.
  const name = dottedNameAt(document, position);
  const doc = name && docs.get(name);
  if (name && doc) {
    const root = name.split(".")[0];
    if (!analysis.localsAt(at.line, at.column).includes(root))
      return markdown(formatDoc(name, doc));
  }
  const type = analysis.typeAt(at.line, at.column);
  return type ? markdown(["```liquidsoap", type, "```"].join("\n")) : null;
};
