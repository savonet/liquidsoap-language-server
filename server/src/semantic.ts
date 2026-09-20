import type { Token, TokenType, Tokens } from "liquidsoap-patcher";
import {
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensLegend,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

const types: TokenType[] = [
  "function",
  "method",
  "parameter",
  "property",
  "type",
  "variable",
];
const modifiers = ["declaration"];

export const legend: SemanticTokensLegend = {
  tokenTypes: types,
  tokenModifiers: modifiers,
};

const encode = (document: TextDocument, found: Token[]): SemanticTokens => {
  const builder = new SemanticTokensBuilder();
  for (const token of found) {
    const { line, character } = document.positionAt(token.start);
    builder.push(
      line,
      character,
      token.length,
      types.indexOf(token.type),
      token.declaration ? 1 : 0,
    );
  }
  return builder.build();
};

/** Highlights the names of a script, for what the grammar cannot tell apart. */
export const semanticTokens = (
  tokens: Tokens,
  document: TextDocument,
): SemanticTokens => encode(document, tokens(document.getText()));
