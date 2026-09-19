import type { Patcher } from "liquidsoap-patcher";
import { originalOffset } from "liquidsoap-patcher";
import type { Location, Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { type Analysis, scriptPath } from "./analysis";
import { checkAt } from "./checked";
import { fileDocument, spanRange } from "./positions";

export const definition = (
  analysis: Analysis,
  patch: Patcher,
  document: TextDocument,
  position: Position,
): Location | null => {
  const checked = checkAt(analysis, patch, document, document.offsetAt(position));
  if (!checked) return null;
  const { patched, edits, at } = checked;
  const span = analysis.definitionAt(at.line, at.column);
  if (!span) return null;
  if (span.file !== scriptPath(document.uri)) {
    const included = fileDocument(span.file);
    return { uri: included.uri, range: spanRange(included, span) };
  }
  const range = spanRange(patched, span);
  const toOriginal = (position: Position) =>
    document.positionAt(originalOffset(edits, patched.offsetAt(position)));
  return {
    uri: document.uri,
    range: { start: toOriginal(range.start), end: toOriginal(range.end) },
  };
};
