import type { Definition, Outline } from "liquidsoap-patcher";
import { DocumentSymbol, SymbolKind } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

const toSymbol = (document: TextDocument, definition: Definition): DocumentSymbol => ({
  name: definition.name,
  kind: definition.kind === "function" ? SymbolKind.Function : SymbolKind.Variable,
  range: {
    start: document.positionAt(definition.start),
    end: document.positionAt(definition.end),
  },
  selectionRange: {
    start: document.positionAt(definition.nameStart),
    end: document.positionAt(definition.nameEnd),
  },
  children: definition.children.map((child) => toSymbol(document, child)),
});

export const symbols = (outline: Outline, document: TextDocument): DocumentSymbol[] =>
  outline(document.getText()).map((definition) => toSymbol(document, definition));
