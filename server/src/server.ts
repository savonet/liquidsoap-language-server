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
import { diagnose } from "./diagnostics";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analysis = loadAnalysis(__dirname);
const patcher = createPatcher();

connection.onInitialize(() => ({
  capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental },
}));

documents.onDidChangeContent(async ({ document }) => {
  connection.sendDiagnostics({
    uri: document.uri,
    version: document.version,
    diagnostics: diagnose(await analysis, await patcher, document),
  });
});

documents.onDidClose(({ document }) =>
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] }),
);

Promise.all([analysis, patcher]).catch((error) => {
  connection.console.error(`Could not start: ${error}`);
  process.exit(1);
});

documents.listen(connection);
connection.listen();
