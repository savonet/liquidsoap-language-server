import { TextEdit } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { scriptPath } from "./analysis";

// liquidsoap-prettier is an ES module, which the server loads on first use.
const formatter = async () => ({
  prettier: await import("prettier"),
  plugin: await import("liquidsoap-prettier"),
});

/** Formats the whole document, following any prettier configuration next to it. */
export const format = async (document: TextDocument): Promise<TextEdit[]> => {
  const { prettier, plugin } = await formatter();
  const text = document.getText();
  const file = scriptPath(document.uri);
  const config = file ? await prettier.resolveConfig(file) : null;
  let formatted: string;
  try {
    formatted = await prettier.format(text, {
      ...config,
      parser: "liquidsoap",
      plugins: [plugin],
    });
  } catch {
    // A script that does not parse is left as it is; diagnostics say why.
    return [];
  }
  if (formatted === text) return [];
  return [
    TextEdit.replace(
      { start: { line: 0, character: 0 }, end: document.positionAt(text.length) },
      formatted,
    ),
  ];
};
