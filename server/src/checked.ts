import type { Edit, Patched, Patcher } from "liquidsoap-patcher";
import { patchedOffset } from "liquidsoap-patcher";
import { TextDocument } from "vscode-languageserver-textdocument";
import { type Analysis, scriptPath } from "./analysis";
import { byteColumn, lineText } from "./positions";

// Error codes of Liquidsoap's lexing and parse errors.
export const parseErrorCodes = new Set([1, 2, 3]);

let lastParse: { source: string; file: string; parses: boolean } | undefined;

const parses = (analysis: Analysis, source: string, file: string): boolean => {
  if (lastParse?.source !== source || lastParse.file !== file)
    lastParse = {
      source,
      file,
      parses: !analysis
        .check(source, file)
        .some(
          ({ severity, code }) => severity === "error" && parseErrorCodes.has(code),
        ),
    };
  return lastParse.parses;
};

/**
 * Tree-sitter's grammar can reject a script that Liquidsoap parses, which is
 * then checked as written.
 */
export const patchScript = (
  analysis: Analysis,
  patch: Patcher,
  source: string,
  file: string,
  keep?: number,
): Patched => {
  const patched = patch(source, keep);
  if (patched.edits.length === 0 || !parses(analysis, source, file)) return patched;
  return { source, edits: [], errors: [] };
};

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
  const file = scriptPath(document.uri);
  const { source, edits } = patchScript(analysis, patch, document.getText(), file);
  const patchedAt = patchedOffset(edits, offset);
  if (patchedAt === undefined) return undefined;
  const patched = TextDocument.create(
    document.uri,
    document.languageId,
    document.version,
    source,
  );
  const { line, character } = patched.positionAt(patchedAt);
  analysis.check(source, file);
  return {
    patched,
    edits,
    at: { line: line + 1, column: byteColumn(lineText(patched, line), character) },
  };
};
