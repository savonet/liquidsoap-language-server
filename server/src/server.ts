#!/usr/bin/env node
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { loadAnalysis } from "./analysis";
import { toRange } from "./positions";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analysis = loadAnalysis(__dirname);

connection.onInitialize(() => ({
  capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental },
}));

const diagnose = async (document: TextDocument): Promise<Diagnostic[]> =>
  (await analysis)
    .check(document.getText())
    // Diagnostics positioned in `%include`d files belong to other documents.
    .filter(({ file }) => file === "")
    .map((raw) => ({
      severity:
        raw.severity === "error"
          ? DiagnosticSeverity.Error
          : DiagnosticSeverity.Warning,
      code: raw.code,
      source: "liquidsoap",
      message: raw.message,
      range: toRange(
        document,
        { line: raw.startLine, column: raw.startColumn },
        { line: raw.endLine, column: raw.endColumn },
      ),
    }));

documents.onDidChangeContent(async ({ document }) => {
  connection.sendDiagnostics({
    uri: document.uri,
    version: document.version,
    diagnostics: await diagnose(document),
  });
});

documents.onDidClose(({ document }) =>
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] }),
);

analysis.catch((error) => {
  connection.console.error(`Could not load the analysis module: ${error}`);
  process.exit(1);
});

documents.listen(connection);
connection.listen();
