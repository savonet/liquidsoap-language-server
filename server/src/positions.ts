import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import type { Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Span } from "./analysis";

export const lineText = (document: TextDocument, line: number): string =>
  document
    .getText({
      start: { line, character: 0 },
      end: { line: line + 1, character: 0 },
    })
    .replace(/\r?\n$/, "");

const utf8Length = (codePoint: number): number =>
  codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;

// Liquidsoap counts columns in UTF-8 bytes, the protocol in UTF-16 code units.
export const utf16Column = (text: string, byteColumn: number): number => {
  let bytes = 0;
  let units = 0;
  for (const char of text) {
    if (bytes >= byteColumn) break;
    const codePoint = char.codePointAt(0)!;
    bytes += utf8Length(codePoint);
    units += codePoint > 0xffff ? 2 : 1;
  }
  return units;
};

export const byteColumn = (text: string, utf16Column: number): number =>
  Buffer.byteLength(text.slice(0, utf16Column), "utf8");

// Liquidsoap lines start at 1, the protocol's at 0.
const toPosition = (
  document: TextDocument,
  line: number,
  byteColumn: number,
): Position => {
  const zeroBasedLine = Math.min(Math.max(line - 1, 0), document.lineCount - 1);
  return {
    line: zeroBasedLine,
    character: utf16Column(lineText(document, zeroBasedLine), byteColumn),
  };
};

export const toRange = (
  document: TextDocument,
  start: { line: number; column: number },
  end: { line: number; column: number },
): Range => ({
  start: toPosition(document, start.line, start.column),
  end: toPosition(document, end.line, end.column),
});

export const spanRange = (document: TextDocument, span: Span): Range =>
  toRange(
    document,
    { line: span.startLine, column: span.startColumn },
    { line: span.endLine, column: span.endColumn },
  );

/** A file that is not open, read from disk to convert its columns. */
export const fileDocument = (file: string): TextDocument => {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {}
  return TextDocument.create(pathToFileURL(file).href, "liquidsoap", 0, text);
};
