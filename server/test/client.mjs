// Starts the built server and talks to it over stdio, as an editor would.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

// Without `LIQUIDSOAP`, the server would pick up the one installed on the
// machine running the tests.
export const startServer = async (env = { LIQUIDSOAP: "" }) => {
  const child = spawn(process.execPath, [server, "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, ...env },
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
      waiters.get(uri)?.resolve(diagnostics);
      waiters.delete(uri);
    },
  );
  // Without this, a server that dies leaves every pending request hanging.
  child.on("exit", (code) => {
    for (const { reject } of waiters.values())
      reject(new Error(`The server exited with code ${code}.`));
    waiters.clear();
  });
  const logs = [];
  connection.onNotification("window/logMessage", ({ message }) => logs.push(message));
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
    // Documents are named by their path, which `%include` resolves against.
    open: async (file, text) => {
      const uri = pathToFileURL(file).href;
      published.delete(uri);
      const diagnostics = new Promise((resolve, reject) =>
        waiters.set(uri, { resolve, reject }),
      );
      await connection.sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: "liquidsoap", version: ++version, text },
      });
      return diagnostics;
    },
    hover: (file, line, character) =>
      connection.sendRequest("textDocument/hover", {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character },
      }),
    complete: (file, line, character) =>
      connection.sendRequest("textDocument/completion", {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character },
      }),
    definition: (file, line, character) =>
      connection.sendRequest("textDocument/definition", {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character },
      }),
    format: (file) =>
      connection.sendRequest("textDocument/formatting", {
        textDocument: { uri: pathToFileURL(file).href },
        options: { tabSize: 2, insertSpaces: true },
      }),
    signature: (file, line, character) =>
      connection.sendRequest("textDocument/signatureHelp", {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character },
      }),
    resolve: (item) => connection.sendRequest("completionItem/resolve", item),
    symbols: (file) =>
      connection.sendRequest("textDocument/documentSymbol", {
        textDocument: { uri: pathToFileURL(file).href },
      }),
    logs,
    stop: () => {
      connection.dispose();
      child.kill();
    },
  };
};
