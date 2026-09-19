import type { Patcher } from "liquidsoap-patcher";
import { isPatched, originalOffset } from "liquidsoap-patcher";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Analysis, RawDiagnostic } from "./analysis";
import { toRange } from "./positions";

// Error codes of Liquidsoap's lexing and parse errors, which warnings reuse:
// tree-sitter reports syntax errors itself once the script needed patching.
const parseErrorCodes = new Set([1, 2, 3]);

const semantic = (
  analysis: Analysis,
  document: TextDocument,
  patched: TextDocument,
  edits: Parameters<typeof originalOffset>[0],
): Diagnostic[] =>
  analysis
    .check(patched.getText())
    // Diagnostics positioned in `%include`d files belong to other documents.
    .filter(({ file }) => file === "")
    .filter(
      ({ severity, code }) =>
        edits.length === 0 ||
        severity !== "error" ||
        !parseErrorCodes.has(code),
    )
    .flatMap((raw: RawDiagnostic) => {
      const range = toRange(
        patched,
        { line: raw.startLine, column: raw.startColumn },
        { line: raw.endLine, column: raw.endColumn },
      );
      const start = patched.offsetAt(range.start);
      const end = patched.offsetAt(range.end);
      if (isPatched(edits, start)) return [];
      return [
        {
          severity:
            raw.severity === "error"
              ? DiagnosticSeverity.Error
              : DiagnosticSeverity.Warning,
          code: raw.code,
          source: "liquidsoap",
          message: raw.message,
          range: {
            start: document.positionAt(originalOffset(edits, start)),
            end: document.positionAt(originalOffset(edits, end)),
          },
        },
      ];
    });

export const diagnose = (
  analysis: Analysis,
  patch: Patcher,
  document: TextDocument,
): Diagnostic[] => {
  const { source, edits, errors } = patch(document.getText());
  if (edits.length === 0) return semantic(analysis, document, document, []);
  const patched = TextDocument.create(
    document.uri,
    document.languageId,
    document.version,
    source,
  );
  const syntax: Diagnostic[] = errors.map(({ start, end, missing }) => ({
    severity: DiagnosticSeverity.Error,
    source: "liquidsoap",
    message: missing ? `Syntax error: missing ${missing}.` : "Syntax error.",
    range: { start: document.positionAt(start), end: document.positionAt(end) },
  }));
  return [...syntax, ...semantic(analysis, document, patched, edits)];
};
