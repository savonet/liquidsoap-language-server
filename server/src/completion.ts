import type { Patcher } from "liquidsoap-patcher";
import { patchedOffset, placeholder } from "liquidsoap-patcher";
import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { type Analysis, type Method, scriptPath } from "./analysis";
import { type Docs, formatDoc } from "./docs";
import { byteColumn, lineText } from "./positions";

const partialName = /[\p{L}_][\p{L}\p{N}_']*$/u;
const dottedBeforeDot = /(?:^|[^\p{L}\p{N}_'.])([\p{L}_][\p{L}\p{N}_'.]*)\.$/u;

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
  analysis.check(source, scriptPath(document.uri));
  return { line: line + 1, column: byteColumn(lineText(patched, line), character) };
};

// Types print their quantified variables first, as in `'a.(int) -> 'a`.
const isFunctionType = (type: string): boolean =>
  /^(?:'\w+\.)*\(/.test(type) && type.includes("->");

/** Completions carry the name to document when the item is resolved. */
export interface ItemData {
  documented: string;
}

// The standard library's documentation only applies to names the script does
// not bind itself.
const item = (
  docs: Docs,
  label: string,
  documented: string | undefined,
  type: string | undefined,
  kinds: { function: CompletionItemKind; value: CompletionItemKind },
): CompletionItem => {
  const doc = documented === undefined ? undefined : docs.get(documented);
  const itemType = type ?? doc?.type;
  return {
    label,
    kind: itemType && isFunctionType(itemType) ? kinds.function : kinds.value,
    ...(type ? { detail: type } : {}),
    ...(doc && documented ? { data: { documented } satisfies ItemData } : {}),
  };
};

const methodItems = (
  docs: Docs,
  methods: Method[],
  module: string | undefined,
): CompletionItem[] =>
  methods.map(({ name, type }) =>
    item(docs, name, module && `${module}.${name}`, type, {
      function: CompletionItemKind.Method,
      value: CompletionItemKind.Field,
    }),
  );

// The member being typed is removed so that the script still typechecks.
const members = (
  analysis: Analysis,
  patch: Patcher,
  docs: Docs,
  document: TextDocument,
  cursor: number,
  dot: number,
): CompletionItem[] => {
  const object = dottedBeforeDot.exec(document.getText().slice(0, dot + 1))?.[1];
  // `null.m` names a module that no script can write.
  if (object === "null") return methodItems(docs, analysis.nullMethods(), "null");
  const at = checkEdited(
    analysis,
    patch,
    document,
    { start: dot, end: cursor, text: "" },
    dot - 1,
  );
  if (!at) return [];
  const root = object?.split(".")[0];
  const module =
    root && !analysis.localsAt(at.line, at.column).includes(root) ? object : undefined;
  return methodItems(docs, analysis.methodsAt(at.line, at.column), module);
};

// A name being typed is replaced with an expression that typechecks anywhere,
// which gives the scope a term to be found at.
const names = (
  analysis: Analysis,
  patch: Patcher,
  docs: Docs,
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
  const locals = new Set(analysis.localsAt(at.line, at.column));
  return analysis
    .scopeAt(at.line, at.column)
    .filter((name) => `${name}()` !== placeholder)
    .map((name) =>
      item(docs, name, locals.has(name) ? undefined : name, undefined, {
        function: CompletionItemKind.Function,
        value: CompletionItemKind.Variable,
      }),
    );
};

export const complete = (
  analysis: Analysis,
  patch: Patcher,
  docs: Docs,
  document: TextDocument,
  position: Position,
): CompletionItem[] => {
  const cursor = document.offsetAt(position);
  const line = lineText(document, position.line).slice(0, position.character);
  const start = cursor - (partialName.exec(line)?.[0].length ?? 0);
  const text = document.getText();
  if (text[start - 1] === ".")
    return members(analysis, patch, docs, document, cursor, start - 1);
  return names(analysis, patch, docs, document, cursor, start);
};

export const resolve = (docs: Docs, completion: CompletionItem): CompletionItem => {
  const documented = (completion.data as ItemData | undefined)?.documented;
  const doc = documented && docs.get(documented);
  if (!documented || !doc) return completion;
  return {
    ...completion,
    documentation: { kind: MarkupKind.Markdown, value: formatDoc(documented, doc) },
  };
};
