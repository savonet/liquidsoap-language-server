import type { Patcher } from "liquidsoap-patcher";
import { patchedOffset } from "liquidsoap-patcher";
import { Hover, MarkupKind, Position } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Analysis } from "./analysis";
import { byteColumn, lineText } from "./positions";

const identifierChar = /[\p{L}\p{N}_'.]/u;

// Blank space has no term of its own, only the enclosing block's.
const onIdentifier = (document: TextDocument, position: Position): boolean => {
  const text = lineText(document, position.line);
  return [text[position.character], text[position.character - 1]].some(
    (char) => char !== undefined && identifierChar.test(char),
  );
};

export const hover = (
  analysis: Analysis,
  patch: Patcher,
  document: TextDocument,
  position: Position,
): Hover | null => {
  if (!onIdentifier(document, position)) return null;
  const { source, edits } = patch(document.getText());
  const offset = patchedOffset(edits, document.offsetAt(position));
  if (offset === undefined) return null;
  const patched = TextDocument.create(
    document.uri,
    document.languageId,
    document.version,
    source,
  );
  const { line, character } = patched.positionAt(offset);
  // The analysis module answers for the script it checked last.
  analysis.check(source);
  const type = analysis.typeAt(
    line + 1,
    byteColumn(lineText(patched, line), character),
  );
  if (!type) return null;
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: ["```liquidsoap", type, "```"].join("\n"),
    },
  };
};
