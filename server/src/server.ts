#!/usr/bin/env node
import { createPatcher } from "liquidsoap-patcher";
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { loadAnalysis } from "./analysis";
import { complete } from "./completion";
import { diagnose } from "./diagnostics";
import { loadDocs } from "./docs";
import { hover } from "./hover";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analysis = loadAnalysis(__dirname);
const patcher = createPatcher();
const docs = loadDocs(__dirname);

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true,
    completionProvider: { triggerCharacters: ["."] },
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
  return hover(await analysis, await patcher, docs, document, position);
});

connection.onCompletion(async ({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) return [];
  return complete(await analysis, await patcher, document, position);
});

documents.onDidClose(({ document }) => {
  clearTimeout(pendingDiagnostics.get(document.uri));
  pendingDiagnostics.delete(document.uri);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

Promise.all([analysis, patcher]).catch((error) => {
  connection.console.error(`Could not start: ${error}`);
  process.exit(1);
});

documents.listen(connection);
connection.listen();
