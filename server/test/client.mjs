// Starts the built server and talks to it over stdio, as an editor would.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";

const server = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "server.js",
);

export const startServer = async () => {
  const child = spawn(process.execPath, [server, "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  const published = new Map();
  const waiters = new Map();
  connection.onNotification(
    "textDocument/publishDiagnostics",
    ({ uri, diagnostics }) => {
      published.set(uri, diagnostics);
      waiters.get(uri)?.(diagnostics);
      waiters.delete(uri);
    },
  );
  connection.listen();
  await connection.sendRequest("initialize", {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
  });
  await connection.sendNotification("initialized", {});

  let version = 0;
  return {
    // Resolves with the diagnostics published for the opened document.
    open: async (name, text) => {
      const uri = `file:///${name}`;
      published.delete(uri);
      const diagnostics = new Promise((resolve) => waiters.set(uri, resolve));
      await connection.sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: "liquidsoap", version: ++version, text },
      });
      return diagnostics;
    },
    hover: (name, line, character) =>
      connection.sendRequest("textDocument/hover", {
        textDocument: { uri: `file:///${name}` },
        position: { line, character },
      }),
    complete: (name, line, character) =>
      connection.sendRequest("textDocument/completion", {
        textDocument: { uri: `file:///${name}` },
        position: { line, character },
      }),
    stop: () => {
      connection.dispose();
      child.kill();
    },
  };
};
