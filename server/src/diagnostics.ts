import type { Patcher } from "liquidsoap-patcher";
import { isPatched, originalOffset } from "liquidsoap-patcher";
import * as path from "node:path";
import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { type Analysis, type RawDiagnostic, scriptPath } from "./analysis";
import { fileDocument, lineText, spanRange } from "./positions";

// Error codes of Liquidsoap's lexing and parse errors, which warnings reuse:
// tree-sitter reports syntax errors itself once the script needed patching.
const parseErrorCodes = new Set([1, 2, 3]);

const severity = (raw: RawDiagnostic): DiagnosticSeverity =>
  raw.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;

// Positions in messages name their file: the document's own go without it, and
// others are relative to the document's directory.
const localMessage = (document: TextDocument, message: string): string => {
  const file = scriptPath(document.uri);
  if (!file) return message;
  return message
    .replaceAll(`${file}, `, "")
    .replaceAll(`${path.dirname(file)}${path.sep}`, "");
};

const includeDirective = /^\s*%include(?:_extra)?\s+"([^"]+)"/;

// The name in the document's `%include` of [file]. A file included from an
// included file has none, and its errors go at the top of the document.
const includeOf = (document: TextDocument, file: string): Range => {
  const directory = path.dirname(scriptPath(document.uri));
  for (let line = 0; line < document.lineCount; line++) {
    const match = includeDirective.exec(lineText(document, line));
    if (match && path.resolve(directory, match[1]) === path.resolve(file))
      return {
        start: { line, character: match[0].length - match[1].length - 1 },
        end: { line, character: match[0].length },
      };
  }
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
};

// Shown on the `%include`, with a link to where the included file is wrong.
const included = (document: TextDocument, raw: RawDiagnostic): Diagnostic => {
  const includedDocument = fileDocument(raw.file);
  return {
    severity: severity(raw),
    code: raw.code,
    source: "liquidsoap",
    message: `In ${path.basename(raw.file)}: ${localMessage(document, raw.message)}`,
    range: includeOf(document, raw.file),
    relatedInformation: [
      {
        location: {
          uri: includedDocument.uri,
          range: spanRange(includedDocument, raw),
        },
        message: localMessage(document, raw.message),
      },
    ],
  };
};

const semantic = (
  analysis: Analysis,
  document: TextDocument,
  patched: TextDocument,
  edits: Parameters<typeof originalOffset>[0],
): Diagnostic[] => {
  const file = scriptPath(document.uri);
  const raws = analysis
    .check(patched.getText(), file)
    .filter(
      ({ severity, code }) =>
        edits.length === 0 || severity !== "error" || !parseErrorCodes.has(code),
    );
  const isOwn = (raw: RawDiagnostic) => raw.file === file || raw.file === "";
  // An included library's unused definitions are not this script's concern.
  const fromIncludes = raws
    .filter((raw) => !isOwn(raw) && raw.severity === "error")
    .map((raw) => included(document, raw));
  const own = raws.filter(isOwn).flatMap((raw) => {
    const range = spanRange(patched, raw);
    const start = patched.offsetAt(range.start);
    const end = patched.offsetAt(range.end);
    if (isPatched(edits, start)) return [];
    return [
      {
        severity: severity(raw),
        code: raw.code,
        source: "liquidsoap",
        message: localMessage(document, raw.message),
        range: {
          start: document.positionAt(originalOffset(edits, start)),
          end: document.positionAt(originalOffset(edits, end)),
        },
      },
    ];
  });
  return [...own, ...fromIncludes];
};

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
