#!/usr/bin/env node
import { createOutline, createPatcher, createTokens } from "liquidsoap-patcher";
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { loadStdlib } from "./stdlib";
import { complete, resolve } from "./completion";
import { definition } from "./definition";
import { diagnose } from "./diagnostics";
import { format } from "./formatting";
import { hover } from "./hover";
import { legend, semanticTokens } from "./semantic";
import { signatureHelp } from "./signature";
import { symbols } from "./symbols";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const stdlib = loadStdlib(__dirname);
const analysis = stdlib.then(({ analysis }) => analysis);
const patcher = createPatcher();
const outline = createOutline();
const tokens = createTokens();
const docs = stdlib.then(({ docs }) => docs);

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true,
    documentSymbolProvider: true,
    semanticTokensProvider: { legend, full: true },
    definitionProvider: true,
    documentFormattingProvider: true,
    signatureHelpProvider: { triggerCharacters: ["(", ","] },
    completionProvider: { triggerCharacters: ["."], resolveProvider: true },
  },
}));

// Checking on every keystroke would lag behind typing.
const diagnosticsDelay = 200;
const pendingDiagnostics = new Map<string, NodeJS.Timeout>();

documents.onDidChangeContent(({ document }) => {
  clearTimeout(pendingDiagnostics.get(document.uri));
  pendingDiagnostics.set(
    document.uri,
    setTimeout(async () => {
      pendingDiagnostics.delete(document.uri);
      connection.sendDiagnostics({
        uri: document.uri,
        version: document.version,
        diagnostics: diagnose(await analysis, await patcher, document),
      });
    }, diagnosticsDelay),
  );
});

connection.onHover(async ({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return null;
  return hover(await analysis, await patcher, await docs, document, position);
});

connection.onCompletion(async ({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  return complete(await analysis, await patcher, await docs, document, position);
});

connection.onDefinition(async ({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return null;
  return definition(await analysis, await patcher, document, position);
});

connection.onCompletionResolve(async (completion) => resolve(await docs, completion));

connection.onDocumentFormatting(async ({ textDocument }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  return format(document);
});

connection.onSignatureHelp(async ({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return null;
  return signatureHelp(await analysis, await patcher, await docs, document, position);
});

connection.languages.semanticTokens.on(async ({ textDocument }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return { data: [] };
  return semanticTokens(await tokens, await docs, document);
});

connection.onDocumentSymbol(async ({ textDocument }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  return symbols(await outline, document);
});

documents.onDidClose(({ document }) => {
  clearTimeout(pendingDiagnostics.get(document.uri));
  pendingDiagnostics.delete(document.uri);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

stdlib.then(({ description }) =>
  connection.console.info(`Checking scripts against ${description}.`),
);

Promise.all([analysis, patcher, outline, tokens]).catch((error) => {
  connection.console.error(`Could not start: ${error}`);
  process.exit(1);
});

documents.listen(connection);
connection.listen();
