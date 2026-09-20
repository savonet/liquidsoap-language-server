import type { Token, TokenType, Tokens } from "liquidsoap-patcher";
import {
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensLegend,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Docs } from "./docs";

const types: TokenType[] = [
  "function",
  "method",
  "parameter",
  "property",
  "type",
  "variable",
];
const modifiers = ["declaration", "defaultLibrary"];

const DECLARATION = 1;
const DEFAULT_LIBRARY = 2;

export const legend: SemanticTokensLegend = {
  tokenTypes: types,
  tokenModifiers: modifiers,
};

// A name the script binds itself is not the standard library's, wherever it is
// used; the rest is told apart by the documentation's names and their modules.
const fromLibrary = (docs: Docs, found: Token[], text: string) => {
  const nameOf = ({ start, length }: Token) => text.slice(start, start + length);
  const bound = new Set(found.filter((t) => t.declaration).map(nameOf));
  const modules = new Set(
    [...docs.keys()].flatMap((name) =>
      name.includes(".") ? [name.split(".")[0]] : [],
    ),
  );
  return (token: Token) => {
    const name = nameOf(token);
    return !bound.has(name) && (docs.has(name) || modules.has(name));
  };
};

const encode = (
  docs: Docs,
  document: TextDocument,
  found: Token[],
): SemanticTokens => {
  const builder = new SemanticTokensBuilder();
  const library = fromLibrary(docs, found, document.getText());
  for (const token of found) {
    const { line, character } = document.positionAt(token.start);
    builder.push(
      line,
      character,
      token.length,
      types.indexOf(token.type),
      (token.declaration ? DECLARATION : 0) | (library(token) ? DEFAULT_LIBRARY : 0),
    );
  }
  return builder.build();
};

/** Highlights the names of a script, for what the grammar cannot tell apart. */
export const semanticTokens = (
  tokens: Tokens,
  docs: Docs,
  document: TextDocument,
): SemanticTokens => encode(docs, document, tokens(document.getText()));
