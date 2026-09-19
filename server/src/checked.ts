import type { Edit, Patcher } from "liquidsoap-patcher";
import { patchedOffset } from "liquidsoap-patcher";
import { TextDocument } from "vscode-languageserver-textdocument";
import { type Analysis, scriptPath } from "./analysis";
import { byteColumn, lineText } from "./positions";

export interface Checked {
  patched: TextDocument;
  edits: Edit[];
  /** The offset's position in the checked script, in the analysis' units. */
  at: { line: number; column: number };
}

/** Checks the patched document, which the analysis then answers for. */
export const checkAt = (
  analysis: Analysis,
  patch: Patcher,
  document: TextDocument,
  offset: number,
): Checked | undefined => {
  const { source, edits } = patch(document.getText());
  const patchedAt = patchedOffset(edits, offset);
  if (patchedAt === undefined) return undefined;
  const patched = TextDocument.create(
    document.uri,
    document.languageId,
    document.version,
    source,
  );
  const { line, character } = patched.positionAt(patchedAt);
  analysis.check(source, scriptPath(document.uri));
  return {
    patched,
    edits,
    at: { line: line + 1, column: byteColumn(lineText(patched, line), character) },
  };
};
