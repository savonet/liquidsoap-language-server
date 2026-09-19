import type { Patcher } from "liquidsoap-patcher";
import { patchedOffset, placeholder } from "liquidsoap-patcher";
import {
  CompletionItem,
  CompletionItemKind,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Analysis, Method } from "./analysis";
import { byteColumn, lineText } from "./positions";

const partialName = /[\p{L}_][\p{L}\p{N}_']*$/u;
const nameBeforeDot = /(?:^|[^\p{L}\p{N}_'.])([\p{L}_][\p{L}\p{N}_']*)\.$/u;

// Returns where offset [at] of the edited text lands in the checked script, in
// the analysis' units.
const checkEdited = (
  analysis: Analysis,
  patch: Patcher,
  document: TextDocument,
  range: { start: number; end: number; text: string },
  at: number,
): { line: number; column: number } | undefined => {
  const text = document.getText();
  const edited = text.slice(0, range.start) + range.text + text.slice(range.end);
  const { source, edits } = patch(edited);
  const offset = patchedOffset(edits, at);
  if (offset === undefined) return undefined;
  const patched = TextDocument.create(document.uri, "liquidsoap", 0, source);
  const { line, character } = patched.positionAt(offset);
  analysis.check(source);
  return { line: line + 1, column: byteColumn(lineText(patched, line), character) };
};

const methodItems = (methods: Method[]): CompletionItem[] =>
  methods.map(({ name, type }) => ({
    label: name,
    kind: CompletionItemKind.Field,
    detail: type,
  }));

// The member being typed is removed so that the script still typechecks.
const members = (
  analysis: Analysis,
  patch: Patcher,
  document: TextDocument,
  cursor: number,
  dot: number,
): CompletionItem[] => {
  const before = document.getText().slice(0, dot + 1);
  // `null.m` names a module that no script can write.
  if (nameBeforeDot.exec(before)?.[1] === "null")
    return methodItems(analysis.nullMethods());
  const at = checkEdited(
    analysis,
    patch,
    document,
    { start: dot, end: cursor, text: "" },
    dot - 1,
  );
  return at ? methodItems(analysis.methodsAt(at.line, at.column)) : [];
};

// A name being typed is replaced with an expression that typechecks anywhere,
// which gives the scope a term to be found at.
const names = (
  analysis: Analysis,
  patch: Patcher,
  document: TextDocument,
  cursor: number,
  start: number,
): CompletionItem[] => {
  const at = checkEdited(
    analysis,
    patch,
    document,
    { start, end: cursor, text: placeholder },
    start,
  );
  if (!at) return [];
  return analysis
    .scopeAt(at.line, at.column)
    .filter((name) => `${name}()` !== placeholder)
    .map((name) => ({ label: name, kind: CompletionItemKind.Variable }));
};

export const complete = (
  analysis: Analysis,
  patch: Patcher,
  document: TextDocument,
  position: Position,
): CompletionItem[] => {
  const cursor = document.offsetAt(position);
  const line = lineText(document, position.line).slice(0, position.character);
  const start = cursor - (partialName.exec(line)?.[0].length ?? 0);
  const text = document.getText();
  if (text[start - 1] === ".") return members(analysis, patch, document, cursor, start - 1);
  return names(analysis, patch, document, cursor, start);
};
